# Argo CD Kubernetes Resource Copier (Chrome Extension)

A lightweight Google Chrome extension designed specifically for the **Argo CD** web interface. It streamlines resource deletion confirmation workflows by adding one-click copy buttons and optional automatic confirmation filling.

---

## What It Does

1. **Argo CD Web Interface Detection**:
   - Operates **only** on Argo CD web interface pages.
   - On all other websites, the extension remains completely inactive and performs no actions.

2. **One-Click COPY Button**:
   - Whenever a deletion confirmation modal appears for any Kubernetes resource (`Deployment`, `ServiceAccount`, `StatefulSet`, `ConfigMap`, etc.), the extension injects a clean **"COPY"** button next to the resource name (`<kbd>` tag).
   - Clicking **"COPY"** strictly copies the resource name to your clipboard (exchange buffer).

3. **Extension Settings Window**:
   - Clicking the extension icon in the Chrome toolbar opens a settings popup.
   - Displays real-time status of whether the active tab is an Argo CD web page.
   - Provides a toggle for **"Automatic insert"**.

4. **Automatic Resource Name Insertion**:
   - When the **"Automatic insert"** setting is enabled in the extension popup (disabled by default), the extension automatically populates the confirmation text input (`value="..."` property) with the target resource name as soon as the delete modal opens.
   - Fully compatible with Argo CD's React state management, immediately enabling the confirmation **OK** button without manual typing.

---

## How to Install from This Folder

1. Open **Google Chrome** (or any Chromium-based browser like Brave or Edge).
2. In the address bar, navigate to:
   ```text
   chrome://extensions
   ```
3. In the top-right corner, turn on the **Developer mode** toggle.
4. In the top-left corner, click the **"Load unpacked"** button.
5. In the file picker dialog, select this folder:
   ```text
   ./argocd-chrome-extention
   ```
6. The extension **"Argo CD Kubernetes Resource Copier"** will now appear in your active extensions list.
7. *(Optional)* Click the puzzle piece icon in the Chrome toolbar and pin **Argo CD Copier** for quick access to the settings window.

---

## Directory Structure

```text
argocd-chrome-extention/
├── manifest.json       # Manifest V3 extension configuration & permissions
├── content.js          # Argo CD detector, modal scanner, and DOM injector
├── styles.css          # Injected button styles & dark mode support
├── popup.html          # Toolbar settings window markup
├── popup.css           # Settings window styles & toggle switch
├── popup.js            # Settings window logic & Chrome storage sync
├── icons/              # Extension icons (16x16, 48x48, 128x128)
└── README.md          # Documentation
```
