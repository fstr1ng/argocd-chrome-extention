/**
 * Argo CD Copier - Settings Window Script
 */

(function initializeSettingsPopup() {
  "use strict";

  const STORAGE_KEY_AUTO_INSERT = "autoInsert";

  const autoInsertToggle = document.getElementById("auto-insert-toggle");
  const saveIndicator = document.getElementById("save-indicator");
  const statusPanel = document.getElementById("status-panel");
  const statusText = document.getElementById("status-text");

  let saveTimeoutIdentifier = null;

  /**
   * Safe storage helper supporting sync storage with local fallback.
   */
  function getStorageArea() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local;
    }
    return null;
  }

  /**
   * Displays temporary "Setting saved" confirmation.
   */
  function showSavedFeedback() {
    if (!saveIndicator) {
      return;
    }

    saveIndicator.classList.add("save-indicator--visible");
    if (saveTimeoutIdentifier !== null) {
      clearTimeout(saveTimeoutIdentifier);
    }
    saveTimeoutIdentifier = setTimeout(function hideFeedback() {
      saveIndicator.classList.remove("save-indicator--visible");
      saveTimeoutIdentifier = null;
    }, 1400);
  }

  /**
   * Loads saved settings from extension storage.
   */
  function loadSettings() {
    const storageArea = getStorageArea();
    if (!storageArea) {
      return;
    }

    storageArea.get({ [STORAGE_KEY_AUTO_INSERT]: false }, function handleLoadedSettings(items) {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.warn("[Argo CD Settings] Error loading settings:", chrome.runtime.lastError);
        return;
      }
      if (autoInsertToggle && items) {
        autoInsertToggle.checked = Boolean(items[STORAGE_KEY_AUTO_INSERT]);
      }
    });
  }

  /**
   * Saves updated setting to extension storage.
   */
  function saveAutoInsertSetting(isEnabled) {
    const storageArea = getStorageArea();
    if (!storageArea) {
      return;
    }

    storageArea.set({ [STORAGE_KEY_AUTO_INSERT]: isEnabled }, function handleSettingSaved() {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.warn("[Argo CD Settings] Error saving setting:", chrome.runtime.lastError);
        return;
      }
      showSavedFeedback();
    });
  }

  /**
   * Checks the active browser tab to determine if Argo CD is running.
   */
  function checkCurrentTabStatus() {
    if (!chrome.tabs || !chrome.tabs.query) {
      updateStatusDisplay(false, "Unknown context");
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function handleActiveTabs(tabsList) {
      if (!tabsList || tabsList.length === 0) {
        updateStatusDisplay(false, "No active tab");
        return;
      }

      const activeTab = tabsList[0];
      const activeTabUrl = activeTab.url || "";

      // Internal browser pages
      if (activeTabUrl.startsWith("chrome://") || activeTabUrl.startsWith("edge://")) {
        updateStatusDisplay(false, "Inactive on browser internal pages");
        return;
      }

      // Query content script on active tab
      chrome.tabs.sendMessage(
        activeTab.id,
        { type: "CHECK_ARGO_STATUS" },
        function handleStatusResponse(response) {
          if (chrome.runtime.lastError || !response) {
            // Check URL heuristics if content script response wasn't available
            const urlLooksLikeArgo = /argo/i.test(activeTabUrl);
            if (urlLooksLikeArgo) {
              updateStatusDisplay(true, "Argo CD page (ready)");
            } else {
              updateStatusDisplay(false, "Inactive (non-Argo CD page)");
            }
            return;
          }

          if (response.isArgoCD) {
            updateStatusDisplay(true, "Argo CD detected on this page");
          } else {
            updateStatusDisplay(false, "Inactive on this page");
          }
        }
      );
    });
  }

  /**
   * Updates the visual status badge in the popup.
   */
  function updateStatusDisplay(isActive, message) {
    if (!statusPanel || !statusText) {
      return;
    }

    statusText.textContent = message;
    if (isActive) {
      statusPanel.classList.add("status-panel--active");
    } else {
      statusPanel.classList.remove("status-panel--active");
    }
  }

  /**
   * Binds event listeners.
   */
  function bindEventListeners() {
    if (autoInsertToggle) {
      autoInsertToggle.addEventListener("change", function handleToggleChange(event) {
        saveAutoInsertSetting(event.target.checked);
      });
    }
  }

  // Initialization
  loadSettings();
  bindEventListeners();
  checkCurrentTabStatus();
})();
