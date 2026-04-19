import {
  ensureReadWritePermission,
  inspectGameDirectory,
  installGame,
  loadManifest,
} from "./installer-core.mjs";

const state = {
  manifest: null,
  rootHandle: null,
  inspection: null,
  busy: false,
  logs: [],
};

const pickFolderButton = document.querySelector("#pick-folder-button");
const installButton = document.querySelector("#install-button");
const supportNote = document.querySelector("#support-note");
const folderName = document.querySelector("#folder-name");
const folderStatus = document.querySelector("#folder-status");
const folderLayout = document.querySelector("#folder-layout");
const pluginTarget = document.querySelector("#plugin-target");
const pluginsFile = document.querySelector("#plugins-file");
const packageList = document.querySelector("#package-list");
const logList = document.querySelector("#log-list");

pickFolderButton.addEventListener("click", handlePickFolder);
installButton.addEventListener("click", handleInstall);

render();
initialize();

async function initialize() {
  if (!supportsInstallation()) {
    pushLog("This browser cannot open directories for install.", "error");
    render();
    return;
  }

  try {
    state.manifest = await loadManifest(new URL("./installer-manifest.json", import.meta.url));
    pushLog(
      `Installer bundle loaded with ${state.manifest.supportFiles.length + 1} files.`,
      "info",
    );
  } catch (error) {
    pushLog(`Failed to load the installer bundle: ${error.message}`, "error");
  }

  render();
}

async function handlePickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.rootHandle = handle;
    pushLog(`Selected folder: ${handle.name}`, "info");
    state.inspection = await inspectGameDirectory(handle);
    if (state.inspection.valid) {
      pushLog(`Detected ${state.inspection.layoutLabel}.`, "success");
    } else {
      pushLog(state.inspection.reason, "warning");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      pushLog(`Folder selection failed: ${error.message}`, "error");
    }
  }

  render();
}

async function handleInstall() {
  if (!state.rootHandle || !state.manifest) {
    return;
  }

  state.busy = true;
  render();

  try {
    const permissionGranted = await ensureReadWritePermission(state.rootHandle);
    if (!permissionGranted) {
      throw new Error("Read and write permission was not granted for the selected folder.");
    }

    const result = await installGame(state.rootHandle, state.manifest, {
      baseUrl: import.meta.url,
      log: pushLog,
    });

    pushLog(
      `Install complete. Wrote ${result.filesCopied} plugin files and updated ${result.supportDirectory}.`,
      "success",
    );
    if (result.packageUpdates === 0) {
      pushLog("No package name changes were needed.", "info");
    }

    state.inspection = await inspectGameDirectory(state.rootHandle);
  } catch (error) {
    pushLog(`Installation failed: ${error.message}`, "error");
  } finally {
    state.busy = false;
    render();
  }
}

function supportsInstallation() {
  return window.isSecureContext && typeof window.showDirectoryPicker === "function";
}

function pushLog(message, tone = "info") {
  state.logs.push({
    message,
    tone,
  });
  renderLog();
}

function render() {
  renderSupportNote();
  renderFolderDetails();
  renderLog();
  pickFolderButton.disabled = state.busy || !supportsInstallation();
  installButton.disabled = state.busy || !canInstall();
}

function renderSupportNote() {
  if (!window.isSecureContext) {
    supportNote.textContent = "Directory access needs a secure context. Use HTTPS or localhost.";
    return;
  }

  if (typeof window.showDirectoryPicker !== "function") {
    supportNote.textContent = "Use a Chromium browser with the File System Access API.";
    return;
  }

  if (!state.manifest) {
    supportNote.textContent = "Loading the installer bundle.";
    return;
  }

  if (!state.rootHandle) {
    supportNote.textContent = "Select the game folder that contains js/plugins or www/js/plugins.";
    return;
  }

  supportNote.textContent = state.inspection?.reason ?? "Ready to inspect the selected folder.";
}

function renderFolderDetails() {
  folderName.textContent = state.rootHandle?.name ?? "Nothing selected";
  folderStatus.textContent = state.inspection?.reason ?? "Waiting for a folder selection.";
  folderLayout.textContent = state.inspection?.layoutLabel ?? "Unknown";
  pluginTarget.textContent = state.inspection?.pluginsDirPath ?? "Unknown";
  pluginsFile.textContent = state.inspection?.pluginsFilePath ?? "Unknown";

  packageList.textContent = "";

  const candidates = state.inspection?.packageCandidates ?? [];
  if (candidates.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Nothing inspected yet.";
    packageList.append(item);
    return;
  }

  for (const candidate of candidates) {
    const item = document.createElement("li");
    item.textContent = `${candidate.path}: ${candidate.exists ? "found" : "missing"}`;
    packageList.append(item);
  }
}

function renderLog() {
  logList.textContent = "";

  const entries = state.logs.length > 0
    ? state.logs
    : [{ message: "Waiting to load the installer bundle.", tone: "info" }];

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `log-entry ${entry.tone}`;
    item.textContent = entry.message;
    logList.append(item);
  }
}

function canInstall() {
  return Boolean(state.manifest && state.rootHandle && state.inspection?.valid && supportsInstallation());
}
