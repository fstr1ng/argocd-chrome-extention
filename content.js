/**
 * Argo CD Kubernetes Resource Copier - Content Script
 *
 * Exclusively active on Argo CD web interfaces.
 * Detects resource delete confirmation modals, injects a "COPY" button
 * next to each resource name (<kbd> tag), copies it to clipboard on click,
 * and automatically fills the confirmation input when "Automatic insert" is enabled.
 */

(function initializeArgoCDResourceCopier() {
  "use strict";

  const COPY_BUTTON_CLASS_NAME = "k8s-resource-copy-button";
  const COPY_BUTTON_COPIED_CLASS_NAME = "k8s-resource-copy-button--copied";
  const PROCESSED_ATTRIBUTE_NAME = "data-k8s-copy-injected";

  const DEFAULT_BUTTON_LABEL = "COPY";
  const COPIED_BUTTON_LABEL = "COPIED!";
  const FEEDBACK_DURATION_MILLISECONDS = 1600;

  // Patterns for detecting deletion confirmation dialogs in Argo CD
  const DELETE_CONFIRMATION_PATTERN = /are\s+you\s+sure\s+you\s+want\s+to\s+delete/i;
  const CONFIRM_PROMPT_LABEL_PATTERN = /please\s+type\s+['"‘“]?([^'”’]+)['"’”]?\s+to\s+confirm/i;

  // State
  let isConfirmedArgoCD = false;
  let settings = {
    autoInsert: false
  };

  /**
   * Safe helper to get Chrome extension storage area.
   */
  function getStorageArea() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local;
    }
    return null;
  }

  /**
   * Loads user settings from storage and listens for live updates.
   */
  function initializeSettings() {
    const storageArea = getStorageArea();
    if (storageArea) {
      storageArea.get({ autoInsert: false }, function handleLoadedSettings(items) {
        if (items && typeof items.autoInsert === "boolean") {
          settings.autoInsert = items.autoInsert;
        }
      });
    }

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function handleStorageChanged(changes) {
        if (changes.autoInsert) {
          settings.autoInsert = Boolean(changes.autoInsert.newValue);
          // If autoInsert was just turned on and an Argo CD modal is currently open, fill it now
          if (settings.autoInsert && isArgoCDPage()) {
            scanAndInjectCopyButtons(document.body);
          }
        }
      });
    }

    // Listen for status query messages from popup.js
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function handleMessage(message, sender, sendResponse) {
        if (message && message.type === "CHECK_ARGO_STATUS") {
          sendResponse({ isArgoCD: isArgoCDPage() });
        }
        return true;
      });
    }
  }

  /**
   * Accurately determines if the current page is an Argo CD web interface.
   * If not Argo CD, the extension will perform no actions.
   *
   * @returns {boolean} True if the page is confirmed to be Argo CD.
   */
  function isArgoCDPage() {
    if (isConfirmedArgoCD) {
      return true;
    }

    // 1. Check document title (Argo CD sets title to "Argo CD" or "Argo CD - ...")
    if (typeof document.title === "string" && /argo\s*cd/i.test(document.title)) {
      isConfirmedArgoCD = true;
      return true;
    }

    // 2. Check meta tags, scripts, and favicon links
    const argoMetaOrLink = document.querySelector(
      'meta[name="application-name" i][content*="argo" i], ' +
      'link[rel*="icon" i][href*="argo" i], ' +
      'link[href*="/assets/favicon/favicon" i], ' +
      'script[src*="argo" i]'
    );
    if (argoMetaOrLink) {
      isConfirmedArgoCD = true;
      return true;
    }

    // 3. Check for distinctive Argo CD UI classes, icons, and test attributes
    const argoDOMElements = document.querySelector(
      '[class*="argo-field"], [class*="argo-button"], [class*="argo-icon-"], ' +
      '[class*="argo-form-row"], [class*="argo-label-placeholder"], ' +
      '[qe-id^="prompt-popup-"], [qe-id^="applications-"], [qe-id^="nav-item-"], ' +
      '.popup-container__header, .popup-container__body, .argo-icon-warning, .argo-icon-close'
    );
    if (argoDOMElements) {
      isConfirmedArgoCD = true;
      return true;
    }

    // 4. Check URL pathname or hostname for explicit argo indicator
    try {
      const hostname = window.location.hostname || "";
      const pathname = window.location.pathname || "";
      if (/argo/i.test(hostname) || /argo/i.test(pathname)) {
        isConfirmedArgoCD = true;
        return true;
      }
    } catch (urlError) {
      // Ignore URL parsing errors
    }

    return false;
  }

  /**
   * Sets the input element's value, updating both the HTML value attribute
   * and the React internal state via the prototype setter.
   *
   * @param {HTMLInputElement} inputElement - The confirmation input element.
   * @param {string} valueToSet - The resource name to fill.
   */
  function setReactInputValue(inputElement, valueToSet) {
    if (!inputElement || !valueToSet) {
      return;
    }

    // Check if value is already set to avoid redundant dispatch
    if (inputElement.value === valueToSet && inputElement.getAttribute("value") === valueToSet) {
      return;
    }

    // 1. Call native prototype setter so React tracks the change
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(inputElement, valueToSet);
    } else {
      inputElement.value = valueToSet;
    }

    // 2. Explicitly set HTML value attribute
    inputElement.setAttribute("value", valueToSet);

    // 3. Dispatch standard input and change events for form validation & React synthetic handlers
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));

    // 4. Focus the input
    inputElement.focus();
  }

  /**
   * Copies text to clipboard using modern Clipboard API with fallback.
   *
   * @param {string} textToCopy - Text to copy.
   * @returns {Promise<boolean>}
   */
  async function copyStringToClipboard(textToCopy) {
    if (!textToCopy) {
      return false;
    }

    // Try modern Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        const timeoutPromise = new Promise(function createTimeout(resolve) {
          window.setTimeout(function onTimeout() {
            resolve("TIMEOUT");
          }, 300);
        });

        const clipboardPromise = navigator.clipboard.writeText(textToCopy).then(
          function onWriteSuccess() {
            return "SUCCESS";
          },
          function onWriteError(error) {
            console.warn("[Argo CD Copier] writeText rejected:", error);
            return "ERROR";
          }
        );

        const raceResult = await Promise.race([clipboardPromise, timeoutPromise]);
        if (raceResult === "SUCCESS") {
          return true;
        }
      } catch (clipboardException) {
        console.warn("[Argo CD Copier] Clipboard API exception:", clipboardException);
      }
    }

    // Fallback using off-screen textarea
    try {
      const temporaryTextArea = document.createElement("textarea");
      temporaryTextArea.value = textToCopy;
      temporaryTextArea.style.position = "fixed";
      temporaryTextArea.style.left = "-999999px";
      temporaryTextArea.style.top = "-999999px";
      temporaryTextArea.style.opacity = "0";
      temporaryTextArea.setAttribute("readonly", "");
      temporaryTextArea.setAttribute("aria-hidden", "true");

      document.body.appendChild(temporaryTextArea);
      temporaryTextArea.focus();
      temporaryTextArea.select();

      const copyCommandSuccessful = document.execCommand("copy");
      document.body.removeChild(temporaryTextArea);

      return copyCommandSuccessful;
    } catch (fallbackError) {
      console.error("[Argo CD Copier] Fallback copy mechanism failed:", fallbackError);
      return false;
    }
  }

  /**
   * Creates the "COPY" button element.
   *
   * @param {string} resourceNameToCopy - The resource name string.
   * @returns {HTMLButtonElement}
   */
  function createCopyButtonElement(resourceNameToCopy) {
    const copyButtonElement = document.createElement("button");
    copyButtonElement.type = "button";
    copyButtonElement.className = COPY_BUTTON_CLASS_NAME;
    copyButtonElement.textContent = DEFAULT_BUTTON_LABEL;
    copyButtonElement.title = `Copy "${resourceNameToCopy}" to clipboard`;
    copyButtonElement.setAttribute("aria-label", `Copy resource name ${resourceNameToCopy}`);

    let revertTimeoutIdentifier = null;

    copyButtonElement.addEventListener("click", function handleCopyButtonClick(mouseEvent) {
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();

      copyStringToClipboard(resourceNameToCopy);

      copyButtonElement.textContent = COPIED_BUTTON_LABEL;
      copyButtonElement.classList.add(COPY_BUTTON_COPIED_CLASS_NAME);

      if (revertTimeoutIdentifier !== null) {
        window.clearTimeout(revertTimeoutIdentifier);
      }

      revertTimeoutIdentifier = window.setTimeout(function restoreDefaultLabel() {
        copyButtonElement.textContent = DEFAULT_BUTTON_LABEL;
        copyButtonElement.classList.remove(COPY_BUTTON_COPIED_CLASS_NAME);
        revertTimeoutIdentifier = null;
      }, FEEDBACK_DURATION_MILLISECONDS);
    });

    return copyButtonElement;
  }

  /**
   * Finds the primary target resource name to confirm deletion of inside an Argo CD modal.
   *
   * @param {HTMLElement} containerElement - Modal or form container.
   * @returns {string | null}
   */
  function findPrimaryTargetResourceName(containerElement) {
    if (!containerElement) {
      return null;
    }

    // Strategy 1: Check the label placeholder ("Please type 'my-resource' to confirm...")
    const labelPlaceholderElement = containerElement.querySelector(".argo-label-placeholder, label");
    if (labelPlaceholderElement && labelPlaceholderElement.textContent) {
      const labelMatch = labelPlaceholderElement.textContent.match(CONFIRM_PROMPT_LABEL_PATTERN);
      if (labelMatch && labelMatch[1]) {
        return labelMatch[1].trim();
      }
    }

    // Strategy 2: Check the <p> containing "Are you sure you want to delete ... <kbd>name</kbd>"
    const paragraphElements = containerElement.querySelectorAll("p");
    for (let index = 0; index < paragraphElements.length; index += 1) {
      const paragraph = paragraphElements[index];
      if (DELETE_CONFIRMATION_PATTERN.test(paragraph.textContent || "")) {
        const primaryKbd = paragraph.querySelector("kbd");
        if (primaryKbd && primaryKbd.textContent) {
          return primaryKbd.textContent.trim();
        }
      }
    }

    return null;
  }

  /**
   * Automatically inserts the target resource name into the confirmation input
   * if "Automatic insert" is enabled in settings.
   *
   * @param {HTMLElement} modalContainer - The modal or form container.
   */
  function handleAutomaticInsert(modalContainer) {
    if (!settings.autoInsert || !modalContainer) {
      return;
    }

    const confirmationInput = modalContainer.querySelector(
      'input.argo-field, input[type="text"], input:not([type])'
    );
    if (!confirmationInput) {
      return;
    }

    const primaryResourceName = findPrimaryTargetResourceName(modalContainer);
    if (primaryResourceName) {
      setReactInputValue(confirmationInput, primaryResourceName);
    }
  }

  /**
   * Checks if an element is inside an Argo CD delete confirmation modal.
   *
   * @param {HTMLElement} keyboardElement - Candidate <kbd> element.
   * @returns {boolean}
   */
  function isDeleteConfirmationResourceElement(keyboardElement) {
    if (!keyboardElement) {
      return false;
    }

    const parentParagraphElement = keyboardElement.closest("p");
    const parentContainerElement = keyboardElement.closest(
      "form, .popup-container, [role='dialog'], .modal, .modal-dialog, div"
    );

    const paragraphText = parentParagraphElement ? parentParagraphElement.textContent : "";
    const containerText = parentContainerElement ? parentContainerElement.textContent : "";

    const hasDeleteConfirmationText =
      DELETE_CONFIRMATION_PATTERN.test(paragraphText) ||
      DELETE_CONFIRMATION_PATTERN.test(containerText) ||
      CONFIRM_PROMPT_LABEL_PATTERN.test(containerText);

    return hasDeleteConfirmationText;
  }

  /**
   * Processes a single <kbd> element: verifies context and injects COPY button.
   *
   * @param {HTMLElement} keyboardElement
   */
  function processKeyboardElement(keyboardElement) {
    if (!keyboardElement || keyboardElement.hasAttribute(PROCESSED_ATTRIBUTE_NAME)) {
      return;
    }

    const trimmedResourceName = keyboardElement.textContent ? keyboardElement.textContent.trim() : "";
    if (trimmedResourceName.length === 0) {
      return;
    }

    if (!isDeleteConfirmationResourceElement(keyboardElement)) {
      return;
    }

    // Check if already injected
    const nextSiblingElement = keyboardElement.nextElementSibling;
    if (nextSiblingElement && nextSiblingElement.classList.contains(COPY_BUTTON_CLASS_NAME)) {
      keyboardElement.setAttribute(PROCESSED_ATTRIBUTE_NAME, "true");
      return;
    }

    keyboardElement.setAttribute(PROCESSED_ATTRIBUTE_NAME, "true");

    const modalContainer = keyboardElement.closest(".popup-container, form, [role='dialog'], div");
    const copyButtonElement = createCopyButtonElement(trimmedResourceName);

    keyboardElement.insertAdjacentElement("afterend", copyButtonElement);

    // If automatic insert is enabled, fill the confirmation input
    if (modalContainer) {
      handleAutomaticInsert(modalContainer);
    }
  }

  /**
   * Scans a DOM node for Argo CD delete modals.
   *
   * @param {Node} searchRootNode
   */
  function scanAndInjectCopyButtons(searchRootNode) {
    if (!searchRootNode || !isArgoCDPage()) {
      return;
    }

    if (searchRootNode.nodeType === Node.ELEMENT_NODE && searchRootNode.tagName === "KBD") {
      processKeyboardElement(searchRootNode);
    }

    if (typeof searchRootNode.querySelectorAll !== "function") {
      return;
    }

    const candidateKeyboardElements = searchRootNode.querySelectorAll("kbd");
    for (let index = 0; index < candidateKeyboardElements.length; index += 1) {
      processKeyboardElement(candidateKeyboardElements[index]);
    }

    // Check popup containers and forms for automatic insertion
    const candidateContainers = searchRootNode.querySelectorAll(".popup-container, form");
    for (let index = 0; index < candidateContainers.length; index += 1) {
      const container = candidateContainers[index];
      const containerText = container.textContent || "";
      if (DELETE_CONFIRMATION_PATTERN.test(containerText)) {
        handleAutomaticInsert(container);
      }
    }
  }

  /**
   * Sets up MutationObserver to react to dynamically mounted Argo CD modals.
   */
  function setupMutationObserver() {
    const domMutationObserver = new MutationObserver(function handleDomMutations(mutationRecordsList) {
      // If we haven't confirmed Argo CD yet, check if any added nodes indicate Argo CD
      if (!isConfirmedArgoCD && !isArgoCDPage()) {
        return;
      }

      for (let recordIndex = 0; recordIndex < mutationRecordsList.length; recordIndex += 1) {
        const mutationRecord = mutationRecordsList[recordIndex];
        const addedNodesList = mutationRecord.addedNodes;

        for (let nodeIndex = 0; nodeIndex < addedNodesList.length; nodeIndex += 1) {
          const addedNode = addedNodesList[nodeIndex];
          if (addedNode.nodeType === Node.ELEMENT_NODE) {
            scanAndInjectCopyButtons(addedNode);
          }
        }
      }
    });

    const observerConfiguration = {
      childList: true,
      subtree: true
    };

    domMutationObserver.observe(document.documentElement || document.body, observerConfiguration);
  }

  /**
   * Extension entry point.
   */
  function startExtension() {
    initializeSettings();

    function onReady() {
      if (isArgoCDPage()) {
        scanAndInjectCopyButtons(document.body);
      }
      setupMutationObserver();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
  }

  startExtension();
})();
