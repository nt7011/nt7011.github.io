import {
  ensureReadWritePermission,
  INSTALL_MANIFEST_URL,
  INSTALL_VERSION_URL,
  inspectGameDirectory,
  installGame,
  isVersionOutdated,
  loadInstalledConfigs,
  loadManifest,
  loadVersionInfo,
  saveInstalledConfigs,
} from "./installer-core.mjs";
import {
  cloneConfigSet,
  configDraftsEqual,
  formatIgnoreTranslationRegexRules,
  getValueAtPath,
  mergeConfigDefaults,
  normalizeIgnoreTranslationRegexInput,
  setValueAtPath,
  validateIgnoreTranslationRegexValue,
  validateNumberValue,
} from "./config-editor.mjs";
import {
  createTranslator,
  detectPreferredLocale,
} from "./i18n.mjs";
import {
  loadNwjsDllHashCatalog,
  scanDirectoryDlls,
  scanFileListDlls,
} from "./scanner/scanner-core.mjs";

const SETTINGS_FIELD = {
  id: "translation.disableCjkFilter",
  path: ["translation", "disableCjkFilter"],
  inputKind: "checkbox",
  label: "disableCjkFilter",
  descriptionKey: "field.translation.disableCjkFilter.description",
  tooltipKey: "field.translation.disableCjkFilter.tooltip",
};

const CHECK_UPDATES_FIELD = {
  id: "checkUpdates",
  path: ["checkUpdates"],
  inputKind: "checkbox",
  label: "checkUpdates",
  descriptionKey: "field.checkUpdates.description",
  tooltipKey: "field.checkUpdates.tooltip",
};

const TRANSLATION_MAX_OUTPUT_TOKENS_FIELD = {
  id: "translation.maxOutputTokens",
  path: ["translation", "maxOutputTokens"],
  inputKind: "number",
  label: "maxOutputTokens",
  descriptionKey: "field.translation.maxOutputTokens.description",
  tooltipKey: "field.translation.maxOutputTokens.tooltip",
  integer: true,
  min: 1,
  required: true,
  validationMessageKey: "error.translationMaxOutputTokensRange",
};

const IGNORE_TRANSLATION_REGEX_FIELD = {
  id: "ignoreTranslationRegex",
  path: ["ignoreTranslationRegex"],
  inputKind: "regex-list",
  label: "ignoreTranslationRegex",
  descriptionKey: "field.ignoreTranslationRegex.description",
  tooltipKey: "field.ignoreTranslationRegex.tooltip",
};

const GAME_MESSAGE_TEXT_SCALE_FIELD = {
  id: "gameMessage.textScale",
  path: ["gameMessage", "textScale"],
  inputKind: "number",
  label: "textScale",
  descriptionKey: "field.gameMessage.textScale.description",
  tooltipKey: "field.gameMessage.textScale.tooltip",
  integer: true,
  min: 1,
  max: 100,
  required: true,
  validationMessageKey: "error.gameMessageTextScaleRange",
};

const GAME_MESSAGE_ORIGIN_AWARE_LINE_BREAKS_FIELD = {
  id: "gameMessage.originAwareLineBreaks",
  path: ["gameMessage", "originAwareLineBreaks"],
  inputKind: "checkbox",
  label: "originAwareLineBreaks",
  descriptionKey: "field.gameMessage.originAwareLineBreaks.description",
  tooltipKey: "field.gameMessage.originAwareLineBreaks.tooltip",
};

const TEXT_SCALE_OTHERS_FIELD = {
  id: "textScaleOthers",
  path: ["textScaleOthers"],
  inputKind: "number",
  label: "textScaleOthers",
  descriptionKey: "field.textScaleOthers.description",
  tooltipKey: "field.textScaleOthers.tooltip",
  integer: true,
  min: 1,
  max: 100,
  required: true,
  validationMessageKey: "error.textScaleOthersRange",
};

const LOCAL_TRANSLATOR_FIELDS = [
  {
    id: "settings.local.address",
    path: ["settings", "local", "address"],
    inputKind: "text",
    label: "address",
    tooltipKey: "field.local.address.tooltip",
  },
  {
    id: "settings.local.port",
    path: ["settings", "local", "port"],
    inputKind: "number",
    label: "port",
    tooltipKey: "field.local.port.tooltip",
  },
  {
    id: "settings.local.model",
    path: ["settings", "local", "model"],
    inputKind: "text",
    label: "model",
    tooltipKey: "field.local.model.tooltip",
  },
  {
    id: "settings.local.system_prompt",
    path: ["settings", "local", "system_prompt"],
    inputKind: "textarea",
    label: "system_prompt",
    tooltipKey: "field.local.systemPrompt.tooltip",
  },
  {
    id: "settings.local.temperature",
    path: ["settings", "local", "temperature"],
    inputKind: "number",
    label: "temperature",
    tooltipKey: "field.local.temperature.tooltip",
  },
  {
    id: "settings.local.top_p",
    path: ["settings", "local", "top_p"],
    inputKind: "number",
    label: "top_p",
    tooltipKey: "field.local.topP.tooltip",
  },
  {
    id: "settings.local.top_k",
    path: ["settings", "local", "top_k"],
    inputKind: "number",
    label: "top_k",
    tooltipKey: "field.local.topK.tooltip",
  },
  {
    id: "settings.local.min_p",
    path: ["settings", "local", "min_p"],
    inputKind: "number",
    label: "min_p",
    tooltipKey: "field.local.minP.tooltip",
  },
  {
    id: "settings.local.repeat_penalty",
    path: ["settings", "local", "repeat_penalty"],
    inputKind: "number",
    label: "repeat_penalty",
    tooltipKey: "field.local.repeatPenalty.tooltip",
  },
];

const DEEPL_TRANSLATOR_FIELDS = [
  {
    id: "settings.deepl.language",
    path: ["settings", "deepl", "language"],
    inputKind: "text",
    label: "language",
    tooltipKey: "field.deepl.language.tooltip",
  },
  {
    id: "settings.deepl.apiKey",
    path: ["settings", "deepl", "apiKey"],
    inputKind: "sensitive-text",
    label: "apiKey",
    tooltipKey: "field.deepl.apiKey.tooltip",
  },
];
const DEEPL_APIKEY_PLACEHOLDER_SUBSTRING = "__NONE__";
const DLL_DIRECTORY_POLICY_PROBE_FILE_NAME = "__dll_scan_probe__.dll";
const CONFIG_STATUS_TONE_CLASSES = [
  "is-neutral",
  "is-warning",
  "is-error",
  "is-success",
];
const CONFIG_STATUS_FLAG_CLASSES = [
  "is-reinstall-save-reminder",
];
const CONFIG_STATUS_FLASH_CLASS = "is-reinstall-save-reminder-flash";
const VERSION_STATUS_TONE_CLASSES = [
  "is-neutral",
  "is-warning",
  "is-success",
];
const locale = detectPreferredLocale(window.navigator);
const t = createTranslator(locale);
let configStatusFlashFrame = null;

const state = {
  manifest: null,
  rootHandle: null,
  inspection: null,
  busy: false,
  busyAction: null,
  logs: [],
  existingInstallationDetected: false,
  loadedConfigs: null,
  configDraft: null,
  configEditable: false,
  configAlertMessage: "",
  configStatusMessage: t("config.status.initial"),
  configUnsavedMessage: "",
  configUnsavedReminderFlashPending: false,
  configErrors: new Set(),
  translatorVersion: null,
  installedTranslatorVersion: null,
  installedVersionChecked: false,
  dllHashCatalog: null,
  dllHashCatalogError: "",
  dllScan: null,
  dllScanBusy: false,
  dllScanNeedsFilePicker: false,
  dllScanProgressCount: 0,
  dllScanRunId: 0,
};

const pickFolderButton = document.querySelector("#pick-folder-button");
const installButton = document.querySelector("#install-button");
const saveConfigButton = document.querySelector("#save-config-button");
const resetConfigButton = document.querySelector("#reset-config-button");
const translatorVersion = document.querySelector("#translator-version");
const supportNote = document.querySelector("#support-note");
const configAlert = document.querySelector("#config-alert");
const folderName = document.querySelector("#folder-name");
const folderStatus = document.querySelector("#folder-status");
const folderLayout = document.querySelector("#folder-layout");
const pluginTarget = document.querySelector("#plugin-target");
const pluginsFile = document.querySelector("#plugins-file");
const packageList = document.querySelector("#package-list");
const dllScannerView = document.querySelector("#dll-scanner-view");
const scanDllFolderButton = document.querySelector("#scan-dll-folder-button");
const scanDllFolderInput = document.querySelector("#scan-dll-folder-input");
const configStatus = document.querySelector("#config-status");
const settingsConfigFields = document.querySelector("#settings-config-fields");
const translatorConfigFields = document.querySelector("#translator-config-fields");
const logList = document.querySelector("#log-list");

applyDocumentTranslations();

pickFolderButton.addEventListener("click", handlePickFolder);
installButton.addEventListener("click", handleInstall);
saveConfigButton.addEventListener("click", handleSaveConfig);
resetConfigButton.addEventListener("click", handleResetConfig);
scanDllFolderButton.addEventListener("click", handleScanDllFolderButton);
scanDllFolderInput.addEventListener("change", handleScanDllFolderInput);
configStatus.addEventListener("animationend", handleConfigStatusAnimationEnd);

render();
initialize();

function applyDocumentTranslations() {
  document.documentElement.lang = locale;

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }

  for (const element of document.querySelectorAll("[data-i18n-html]")) {
    element.innerHTML = t(element.dataset.i18nHtml);
  }

  for (const element of document.querySelectorAll("[data-i18n-title]")) {
    element.title = t(element.dataset.i18nTitle);
  }
}

async function initialize() {
  state.translatorVersion = await loadVersionInfo(INSTALL_VERSION_URL);
  await initializeDllHashCatalog();

  if (!supportsInstallation()) {
    pushLog(t("error.browserCannotInstall"), "error");
    render();
    return;
  }

  try {
    state.manifest = await loadManifest(INSTALL_MANIFEST_URL, { t });
    pushLog(
      t("log.bundleLoaded", {
        count: state.manifest.install.files.length + 3,
      }),
      "info",
    );

    if (state.rootHandle) {
      await refreshInstalledConfigSnapshot({ logOutcome: false });
    }
  } catch (error) {
    pushLog(t("error.loadBundle", { message: error.message }), "error");
  }

  render();
}

async function initializeDllHashCatalog() {
  try {
    state.dllHashCatalog = await loadNwjsDllHashCatalog(
      new URL("./scanner/nwjs-dll-hashes.json", import.meta.url),
    );
    pushLog(t("scanner.log.catalogLoaded", {
      count: state.dllHashCatalog.hashCount,
    }), "info");
  } catch (error) {
    state.dllHashCatalogError = error.message;
    pushLog(t("scanner.error.catalogLoad", { message: error.message }), "error");
  }
}

async function handlePickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permissionGranted = await ensureReadWritePermission(handle);
    if (!permissionGranted) {
      throw new Error(t("error.permissionDenied"));
    }

    state.rootHandle = handle;
    resetSelectedFolderState();
    resetDllScan();
    pushLog(t("log.selectedFolder", { name: handle.name }), "info");
    render();

    state.inspection = await inspectGameDirectory(handle, { t });
    if (state.inspection.valid) {
      pushLog(t("log.detectedLayout", { layout: state.inspection.layoutLabel }), "success");
    } else {
      pushLog(state.inspection.reason, "warning");
    }

    startDllScan(handle);
    await refreshInstalledConfigSnapshot({ logOutcome: true });
  } catch (error) {
    if (error?.name !== "AbortError") {
      pushLog(t("error.folderSelection", { message: error.message }), "error");
    }
  }

  render();
}

function startDllScan(rootHandle) {
  if (!rootHandle) {
    return;
  }

  const scanRunId = state.dllScanRunId + 1;
  state.dllScanRunId = scanRunId;

  if (!state.dllHashCatalog) {
    state.dllScan = {
      errorMessage: state.dllHashCatalogError || t("scanner.error.catalogUnavailable"),
    };
    pushLog(t("scanner.error.scanFailed", {
      message: state.dllScan.errorMessage,
    }), "error");
    render();
    return;
  }

  state.dllScanBusy = true;
  state.dllScanNeedsFilePicker = false;
  state.dllScanProgressCount = 0;
  state.dllScan = null;
  render();

  detectDllDirectoryAccessBlocked(rootHandle)
    .then((blocked) => {
      if (!isCurrentDllScan(scanRunId, rootHandle)) {
        return null;
      }

      if (blocked) {
        state.dllScanNeedsFilePicker = true;
        pushLog(t("scanner.log.folderPickerNeeded"), "warning");
        return null;
      }

      return scanDirectoryDlls(rootHandle, state.dllHashCatalog, {
        onProgress: ({ scanned }) => {
          if (!isCurrentDllScan(scanRunId, rootHandle)) {
            return;
          }

          state.dllScanProgressCount = scanned;
          renderDllScannerStatus();
        },
      });
    })
    .then((scan) => {
      if (!scan) {
        return;
      }

      if (!isCurrentDllScan(scanRunId, rootHandle)) {
        return;
      }

      state.dllScan = scan;
      pushLog(getDllScanLogMessage(scan), getDllScanTone(scan));
    })
    .catch((error) => {
      if (!isCurrentDllScan(scanRunId, rootHandle)) {
        return;
      }

      state.dllScan = {
        errorMessage: error.message,
      };
      pushLog(t("scanner.error.scanFailed", { message: error.message }), "error");
    })
    .finally(() => {
      if (!isCurrentDllScan(scanRunId, rootHandle)) {
        return;
      }

      state.dllScanBusy = false;
      render();
    });
}

async function detectDllDirectoryAccessBlocked(rootHandle) {
  if (typeof rootHandle?.getFileHandle !== "function") {
    return false;
  }

  try {
    await rootHandle.getFileHandle(DLL_DIRECTORY_POLICY_PROBE_FILE_NAME);
    return false;
  } catch (error) {
    return isFileNameNotAllowedError(error);
  }
}

function isFileNameNotAllowedError(error) {
  return error?.name === "TypeError"
    && /name is not allowed/i.test(String(error.message ?? ""));
}

async function handleInstall() {
  if (!canInstall()) {
    return;
  }

  state.busy = true;
  state.busyAction = "install";
  render();

  try {
    const permissionGranted = await ensureReadWritePermission(state.rootHandle);
    if (!permissionGranted) {
      throw new Error(t("error.permissionDenied"));
    }

    const reinstall = hasExistingInstallation();
    const preservedConfigDraft = reinstall ? getCurrentConfigDraft() : null;
    const result = await installGame(state.rootHandle, state.manifest, {
      baseUrl: import.meta.url,
      log: pushLog,
      overwriteExistingConfigs: reinstall,
      t,
    });

    pushLog(
      t("log.installComplete", {
        count: result.filesCopied,
        path: result.supportDirectory,
      }),
      "success",
    );
    if (result.packageUpdates === 0) {
      pushLog(t("log.noPackageNameChanges"), "info");
    }

    state.inspection = await inspectGameDirectory(state.rootHandle, { t });
    await refreshInstalledConfigSnapshot({
      logOutcome: true,
      preservedConfigDraft,
    });
  } catch (error) {
    pushLog(t("error.installationFailed", { message: error.message }), "error");
  } finally {
    state.busy = false;
    state.busyAction = null;
    render();
  }
}

async function handleSaveConfig() {
  const validationError = getConfigValidationError();
  if (validationError) {
    pushLog(t("error.saveConfigFailed", { message: validationError }), "error");
    render();
    return;
  }

  if (!canSaveConfig()) {
    return;
  }

  state.busy = true;
  state.busyAction = "save-config";
  render();

  try {
    const permissionGranted = await ensureReadWritePermission(state.rootHandle);
    if (!permissionGranted) {
      throw new Error(t("error.permissionDenied"));
    }

    const result = await saveInstalledConfigs(state.rootHandle, state.manifest, state.configDraft, { t });
    pushLog(
      t("log.configSaved", { path: result.supportDirectory }),
      "success",
    );

    await refreshInstalledConfigSnapshot({ logOutcome: false });
  } catch (error) {
    pushLog(t("error.saveConfigFailed", { message: error.message }), "error");
  } finally {
    state.busy = false;
    state.busyAction = null;
    render();
  }
}

function handleResetConfig() {
  if (!state.loadedConfigs || !state.configEditable) {
    return;
  }

  state.configDraft = cloneConfigSet(state.loadedConfigs);
  state.configUnsavedMessage = "";
  state.configUnsavedReminderFlashPending = false;
  state.configErrors = new Set();
  renderConfigEditor();
  render();
  pushLog(t("log.resetConfig"), "info");
}

function handleScanDllFolderButton() {
  scanDllFolderInput.value = "";
  scanDllFolderInput.click();
}

async function handleScanDllFolderInput() {
  const files = Array.from(scanDllFolderInput.files ?? []);
  if (files.length === 0) {
    return;
  }

  const selectedFolderName = getPickedFolderName(files);
  if (state.rootHandle?.name && selectedFolderName && selectedFolderName !== state.rootHandle.name) {
    const message = t("scanner.error.folderMismatch", {
      selectedFolder: selectedFolderName,
      expectedFolder: state.rootHandle.name,
    });
    state.dllScan = {
      errorMessage: message,
    };
    pushLog(t("scanner.error.scanFailed", { message }), "error");
    render();
    return;
  }

  const scanRunId = state.dllScanRunId + 1;
  state.dllScanRunId = scanRunId;

  if (!state.dllHashCatalog) {
    state.dllScan = {
      errorMessage: state.dllHashCatalogError || t("scanner.error.catalogUnavailable"),
    };
    pushLog(t("scanner.error.scanFailed", {
      message: state.dllScan.errorMessage,
    }), "error");
    render();
    return;
  }

  state.dllScanBusy = true;
  state.dllScanNeedsFilePicker = false;
  state.dllScanProgressCount = 0;
  state.dllScan = null;
  render();

  try {
    const scan = await scanFileListDlls(files, state.dllHashCatalog, {
      onProgress: ({ scanned }) => {
        if (state.dllScanRunId !== scanRunId) {
          return;
        }

        state.dllScanProgressCount = scanned;
        renderDllScannerStatus();
      },
    });

    if (state.dllScanRunId !== scanRunId) {
      return;
    }

    state.dllScan = scan;
    state.dllScanNeedsFilePicker = false;
    pushLog(t("scanner.log.filePickerComplete", {
      dllCount: scan.dllCount,
      fileCount: files.length,
    }), getDllScanTone(scan));
  } catch (error) {
    if (state.dllScanRunId !== scanRunId) {
      return;
    }

    state.dllScan = {
      errorMessage: error.message,
    };
    pushLog(t("scanner.error.scanFailed", { message: error.message }), "error");
  } finally {
    if (state.dllScanRunId === scanRunId) {
      state.dllScanBusy = false;
      render();
    }
  }
}

async function refreshInstalledConfigSnapshot(options = {}) {
  if (!state.manifest) {
    return;
  }

  const snapshot = await loadInstalledConfigs(state.rootHandle, state.manifest, { t });
  applyConfigSnapshot(snapshot, {
    logWarnings: options.logWarnings ?? true,
    preservedConfigDraft: options.preservedConfigDraft ?? null,
  });

  if (options.logOutcome ?? false) {
    pushLog(snapshot.reason, snapshot.editable ? "info" : "warning");
  }
}

function applyConfigSnapshot(snapshot, options = {}) {
  const loadedConfigs = snapshot.configs ? cloneConfigSet(snapshot.configs) : null;
  const configDraft = createConfigDraftFromSnapshot(
    snapshot,
    loadedConfigs,
    options.preservedConfigDraft,
  );
  const preservedDraftApplied = Boolean(
    snapshot.editable
      && loadedConfigs
      && configDraft
      && options.preservedConfigDraft
      && !configDraftsEqual(loadedConfigs, configDraft),
  );

  state.existingInstallationDetected = Boolean(snapshot.installed);
  state.installedVersionChecked = Boolean(snapshot.installedVersionChecked);
  state.installedTranslatorVersion = snapshot.installedVersion ?? null;
  state.loadedConfigs = loadedConfigs;
  state.configDraft = configDraft;
  state.configEditable = Boolean(snapshot.editable);
  state.configAlertMessage = getConfigAlertMessage(snapshot);
  state.configStatusMessage = snapshot.reason;
  state.configUnsavedMessage = preservedDraftApplied
    ? t("config.status.reinstallPreserved")
    : "";
  state.configUnsavedReminderFlashPending = preservedDraftApplied;
  state.configErrors = new Set();

  renderConfigEditor();
  render();

  if (options.logWarnings ?? true) {
    for (const warning of snapshot.warnings) {
      pushLog(warning, "warning");
    }
  }
}

function getCurrentConfigDraft() {
  if (state.configDraft) {
    return cloneConfigSet(state.configDraft);
  }

  if (state.loadedConfigs) {
    return cloneConfigSet(state.loadedConfigs);
  }

  return null;
}

function createConfigDraftFromSnapshot(snapshot, loadedConfigs, preservedConfigDraft) {
  if (!loadedConfigs) {
    return null;
  }

  if (snapshot.editable && preservedConfigDraft) {
    return mergeConfigDefaults(loadedConfigs, preservedConfigDraft);
  }

  return cloneConfigSet(loadedConfigs);
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
  renderVersionInfo();
  renderConfigAlert();
  renderSupportNote();
  renderFolderDetails();
  renderDllScannerStatus();
  renderConfigStatus();
  renderLog();
  renderActionState();
}

function renderVersionInfo() {
  const installableVersion = getDisplayVersion(state.translatorVersion);
  let tone = "neutral";
  let message = t("page.version", {
    version: installableVersion,
  });

  if (state.installedVersionChecked) {
    const installedVersion = getDisplayVersion(state.installedTranslatorVersion);
    if (isVersionOutdated(state.installedTranslatorVersion, state.translatorVersion)) {
      tone = "warning";
      message = t("page.version.updateAvailable", {
        installedVersion,
        installableVersion,
      });
    } else {
      tone = "success";
      message = t("page.version.installed", {
        version: installedVersion,
      });
    }
  }

  setVersionStatusTone(tone);
  translatorVersion.textContent = message;
}

function getDisplayVersion(version) {
  return version ?? t("folder.unknown");
}

function setVersionStatusTone(tone) {
  translatorVersion.classList.remove(...VERSION_STATUS_TONE_CLASSES);
  translatorVersion.classList.add(`is-${tone}`);
}

function renderConfigAlert() {
  if (!state.configAlertMessage) {
    configAlert.textContent = "";
    configAlert.classList.remove("is-visible");
    return;
  }

  configAlert.textContent = state.configAlertMessage;
  configAlert.classList.add("is-visible");
}

function getConfigAlertMessage(snapshot) {
  if (snapshot.installed && !snapshot.editable && snapshot.reason) {
    return snapshot.reason;
  }

  return "";
}

function renderSupportNote() {
  if (!window.isSecureContext) {
    supportNote.textContent = t("support.secureContext");
    return;
  }

  if (typeof window.showDirectoryPicker !== "function") {
    supportNote.textContent = t("support.fileSystemApi");
    return;
  }

  if (!state.manifest) {
    supportNote.textContent = t("support.loadingBundle");
    return;
  }

  if (!state.rootHandle) {
    supportNote.textContent = t("support.selectFolder");
    return;
  }

  supportNote.textContent = state.inspection?.reason ?? t("support.readyToInspect");
}

function renderFolderDetails() {
  folderName.textContent = state.rootHandle?.name ?? t("folder.nothingSelected");
  folderStatus.textContent = state.inspection?.reason ?? t("folder.waitingForSelection");
  folderLayout.textContent = state.inspection?.layoutLabel ?? t("folder.unknown");
  pluginTarget.textContent = state.inspection?.pluginsDirPath ?? t("folder.unknown");
  pluginsFile.textContent = state.inspection?.pluginsFilePath ?? t("folder.unknown");

  packageList.textContent = "";

  const candidates = state.inspection?.packageCandidates ?? [];
  if (candidates.length === 0) {
    const item = document.createElement("li");
    item.textContent = t("package.noneInspected");
    packageList.append(item);
    return;
  }

  for (const candidate of candidates) {
    const item = document.createElement("li");
    item.textContent = `${candidate.path}: ${candidate.exists ? t("package.statusFound") : t("package.statusMissing")}`;
    packageList.append(item);
  }
}

function renderDllScannerStatus() {
  const { message, tone } = getDllScannerStatus();
  const catalogCoverage = getDllCatalogCoverageText();

  dllScannerView.textContent = "";

  if (hasUnverifiedDlls()) {
    dllScannerView.append(buildDetectedDllScannerView());
    return;
  }

  if (state.dllScan && state.dllScan.dllCount > 0 && tone === "success") {
    dllScannerView.append(buildSafeDllScannerView(message, catalogCoverage));
    return;
  }

  dllScannerView.append(buildScannerStatusNote(message, tone, catalogCoverage));
}

function buildScannerStatusNote(message, tone, catalogCoverage = "") {
  const status = document.createElement("p");
  status.className = `section-note scanner-status is-${tone}`;
  status.textContent = catalogCoverage
    ? `${message}\n${catalogCoverage}`
    : message;
  return status;
}

function buildSafeDllScannerView(message, catalogCoverage) {
  const details = document.createElement("details");
  details.className = "scanner-details is-success";

  const summary = document.createElement("summary");
  summary.textContent = t("scanner.status.safe");
  details.append(summary);

  if (catalogCoverage) {
    const coverage = document.createElement("p");
    coverage.className = "scanner-meta";
    coverage.textContent = catalogCoverage;
    details.append(coverage);
  }

  const note = document.createElement("p");
  note.className = "scanner-detail-note";
  note.textContent = message;
  details.append(note);

  details.append(buildDllScannerList(state.dllScan.entries));
  return details;
}

function buildDetectedDllScannerView() {
  const container = document.createElement("div");
  container.className = "scanner-details is-warning is-static";

  const heading = document.createElement("p");
  heading.className = "scanner-static-heading";
  heading.textContent = t("scanner.status.detected");
  container.append(heading);

  const warning = document.createElement("p");
  warning.className = "scanner-detected-warning";
  warning.textContent = t("scanner.warning.unverified");
  container.append(warning);

  const catalogCoverage = getDllCatalogCoverageText();
  if (catalogCoverage) {
    const coverage = document.createElement("p");
    coverage.className = "scanner-meta";
    coverage.textContent = catalogCoverage;
    container.append(coverage);
  }

  container.append(buildDllScannerList(state.dllScan.entries));
  return container;
}

function buildDllScannerList(entries) {
  const list = document.createElement("ul");
  list.className = "scanner-list";

  if (entries.length === 0) {
    const item = document.createElement("li");
    item.textContent = t("scanner.list.empty");
    list.append(item);
    return list;
  }

  for (const entry of sortDllScanEntries(entries)) {
    const item = document.createElement("li");
    item.className = `scanner-entry is-${entry.status}`;
    item.textContent = getDllScanEntryText(entry);
    list.append(item);
  }

  return list;
}

function sortDllScanEntries(entries) {
  return [...entries].sort((left, right) => {
    const priorityDifference = getDllScanEntryPriority(left) - getDllScanEntryPriority(right);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return left.path.localeCompare(right.path);
  });
}

function getDllScanEntryPriority(entry) {
  if (entry.status === "unknown" || entry.status === "error") {
    return 0;
  }

  return 1;
}

function getDllCatalogCoverageText() {
  const catalog = state.dllHashCatalog;
  if (!catalog) {
    return "";
  }

  return t("scanner.catalog.coverage", {
    startVersion: catalog.firstIncludedVersion || catalog.startVersion || t("folder.unknown"),
    latestVersion: catalog.latestVersion || t("folder.unknown"),
    releaseCount: catalog.releaseCount || catalog.includedReleases.length,
    hashCount: catalog.hashCount,
    generatedAt: formatCatalogGeneratedAt(catalog.generatedAt),
  });
}

function formatCatalogGeneratedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("folder.unknown");
  }

  return date.toISOString().slice(0, 10);
}

function getDllScannerStatus() {
  if (state.dllScanBusy) {
    return {
      tone: "neutral",
      message: t("scanner.status.scanning"),
    };
  }

  if (state.dllScan?.errorMessage) {
    return {
      tone: "error",
      message: t("scanner.status.error", {
        message: state.dllScan.errorMessage,
      }),
    };
  }

  if (state.dllScanNeedsFilePicker) {
    return {
      tone: "warning",
      message: t("scanner.status.folderPickerNeeded"),
    };
  }

  if (!state.rootHandle && !state.dllScan) {
    return {
      tone: state.dllHashCatalog ? "neutral" : "error",
      message: state.dllHashCatalog
        ? t("scanner.status.initial")
        : t("scanner.status.catalogError", {
            message: state.dllHashCatalogError || t("folder.unknown"),
          }),
    };
  }

  if (!state.dllScan) {
    return {
      tone: "neutral",
      message: t("scanner.status.initial"),
    };
  }

  if (state.dllScan.dllCount === 0) {
    return {
      tone: "success",
      message: t("scanner.status.noDlls"),
    };
  }

  if (state.dllScan.unreadableCount > 0) {
    return {
      tone: "error",
      message: t("scanner.status.unreadable", {
        unreadableCount: state.dllScan.unreadableCount,
        dllCount: state.dllScan.dllCount,
      }),
    };
  }

  if (state.dllScan.unknownCount > 0) {
    return {
      tone: "warning",
      message: t("scanner.status.unknown", {
        unknownCount: state.dllScan.unknownCount,
        dllCount: state.dllScan.dllCount,
      }),
    };
  }

  return {
    tone: "success",
    message: t("scanner.status.allowedDetails", {
      dllCount: state.dllScan.dllCount,
    }),
  };
}

function hasUnverifiedDlls() {
  return Boolean(
    state.dllScan
      && (state.dllScan.unknownCount > 0 || state.dllScan.unreadableCount > 0),
  );
}

function getDllScanEntryText(entry) {
  if (entry.status === "allowed") {
    const match = entry.matches[0];
    const matchText = match
      ? t("scanner.entry.match", {
          release: match.release,
          fileName: match.fileName,
        })
      : t("scanner.entry.allowed");
    return `${entry.path}: ${matchText}`;
  }

  if (entry.status === "error") {
    return `${entry.path}: ${t("scanner.entry.error", {
      message: entry.errorMessage || t("folder.unknown"),
    })}`;
  }

  return `${entry.path}: ${t("scanner.entry.unknown")}`;
}

function getDllScanLogMessage(scan) {
  if (scan.unreadableCount > 0) {
    return t("scanner.log.unreadable", {
      unreadableCount: scan.unreadableCount,
      dllCount: scan.dllCount,
    });
  }

  if (scan.unknownCount > 0) {
    return t("scanner.log.unknown", {
      unknownCount: scan.unknownCount,
      dllCount: scan.dllCount,
    });
  }

  return t("scanner.log.allowed", {
    dllCount: scan.dllCount,
  });
}

function getDllScanTone(scan) {
  if (scan.unreadableCount > 0) {
    return "error";
  }

  if (scan.unknownCount > 0) {
    return "warning";
  }

  return "success";
}

function renderConfigStatus() {
  let message = state.configStatusMessage;
  let summary = "";
  let tone = "neutral";
  let showReinstallSaveReminder = false;
  let flashReinstallSaveReminder = false;
  const validationError = getConfigValidationError();

  if (state.configDraft) {
    if (!state.configEditable) {
      if (state.configAlertMessage) {
        setConfigStatusTone("error");
        setConfigStatusFlags();
        configStatus.textContent = t("config.status.locked");
        return;
      }

      setConfigStatusTone("neutral");
      setConfigStatusFlags();
      configStatus.textContent = message;
      return;
    }

    if (validationError) {
      tone = "error";
      summary = t("config.status.error", { message: validationError });
    } else if (state.configErrors.size > 0) {
      tone = "error";
      summary = t(
        state.configErrors.size === 1
          ? "config.status.invalidNumber.one"
          : "config.status.invalidNumber.other",
        { count: state.configErrors.size },
      );
    } else if (hasUnsavedConfigChanges()) {
      tone = "warning";
      summary = state.configUnsavedMessage || t("config.status.unsaved");
      showReinstallSaveReminder = Boolean(state.configUnsavedMessage);
      flashReinstallSaveReminder = Boolean(
        showReinstallSaveReminder && state.configUnsavedReminderFlashPending,
      );
      state.configUnsavedReminderFlashPending = false;
    } else {
      tone = "success";
      summary = t("config.status.clean");
      state.configUnsavedReminderFlashPending = false;
    }
  }

  setConfigStatusTone(tone);
  setConfigStatusFlags({
    reinstallSaveReminder: showReinstallSaveReminder,
  });
  renderConfigStatusText(message, summary, {
    emphasizeSummary: showReinstallSaveReminder,
  });

  if (flashReinstallSaveReminder) {
    triggerConfigStatusFlash();
  }
}

function setConfigStatusTone(tone) {
  configStatus.classList.remove(...CONFIG_STATUS_TONE_CLASSES);
  configStatus.classList.add(`is-${tone}`);
}

function setConfigStatusFlags(options = {}) {
  configStatus.classList.remove(...CONFIG_STATUS_FLAG_CLASSES);
  if (!options.reinstallSaveReminder) {
    configStatus.classList.remove(CONFIG_STATUS_FLASH_CLASS);
  }

  if (options.reinstallSaveReminder) {
    configStatus.classList.add("is-reinstall-save-reminder");
  }
}

function renderConfigStatusText(message, summary, options = {}) {
  configStatus.textContent = "";

  if (!summary) {
    configStatus.textContent = message;
    return;
  }

  const messageText = document.createElement("span");
  messageText.textContent = message;

  const summaryText = document.createElement(options.emphasizeSummary ? "strong" : "span");
  summaryText.textContent = summary;
  if (options.emphasizeSummary) {
    summaryText.className = "config-status-reminder";
  }

  configStatus.append(messageText, document.createElement("br"), summaryText);
}

function handleConfigStatusAnimationEnd(event) {
  if (event.animationName === "config-save-reminder-flash") {
    configStatus.classList.remove(CONFIG_STATUS_FLASH_CLASS);
  }
}

function triggerConfigStatusFlash() {
  if (configStatusFlashFrame !== null) {
    window.cancelAnimationFrame(configStatusFlashFrame);
  }

  configStatus.classList.remove(CONFIG_STATUS_FLASH_CLASS);
  configStatusFlashFrame = window.requestAnimationFrame(() => {
    configStatusFlashFrame = window.requestAnimationFrame(() => {
      configStatusFlashFrame = null;
      if (configStatus.classList.contains("is-reinstall-save-reminder")) {
        configStatus.classList.add(CONFIG_STATUS_FLASH_CLASS);
      }
    });
  });
}

function renderConfigEditor() {
  const editorLocked = Boolean(state.configDraft) && !state.configEditable;
  settingsConfigFields.classList.toggle("is-locked", editorLocked);
  translatorConfigFields.classList.toggle("is-locked", editorLocked);
  renderSettingsConfig(settingsConfigFields, state.configDraft?.settings);
  renderTranslatorConfig(translatorConfigFields, state.configDraft?.translator);
}

function renderSettingsConfig(container, config) {
  container.textContent = "";

  if (typeof config === "undefined") {
    const placeholder = document.createElement("p");
    placeholder.className = "config-empty";
    placeholder.textContent = t("config.empty");
    container.append(placeholder);
    return;
  }

  const section = document.createElement("section");
  section.className = "config-group";

  const heading = document.createElement("h4");
  heading.className = "config-group-title";
  heading.textContent = t("config.section.translation");
  section.append(heading);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "config-toggle-grid";
  fieldGrid.append(
    buildFieldInput(
      "settings",
      SETTINGS_FIELD,
      getValueAtPath(config, SETTINGS_FIELD.path),
    ),
  );

  section.append(fieldGrid);

  const translationFieldGrid = document.createElement("div");
  translationFieldGrid.className = "config-field-grid";
  translationFieldGrid.append(
    buildFieldInput(
      "settings",
      TRANSLATION_MAX_OUTPUT_TOKENS_FIELD,
      getValueAtPath(config, TRANSLATION_MAX_OUTPUT_TOKENS_FIELD.path),
    ),
  );

  section.append(translationFieldGrid);

  section.append(buildIgnoreTranslationRegexEditor(config));
  container.append(section);

  const gameMessageSection = document.createElement("section");
  gameMessageSection.className = "config-group";

  const gameMessageHeading = document.createElement("h4");
  gameMessageHeading.className = "config-group-title";
  gameMessageHeading.textContent = t("config.section.gameMessage");
  gameMessageSection.append(gameMessageHeading);

  const gameMessageFieldGrid = document.createElement("div");
  gameMessageFieldGrid.className = "config-field-grid";
  gameMessageFieldGrid.append(
    buildFieldInput(
      "settings",
      GAME_MESSAGE_TEXT_SCALE_FIELD,
      getValueAtPath(config, GAME_MESSAGE_TEXT_SCALE_FIELD.path),
    ),
  );

  gameMessageSection.append(gameMessageFieldGrid);

  const gameMessageToggleGrid = document.createElement("div");
  gameMessageToggleGrid.className = "config-toggle-grid";
  gameMessageToggleGrid.append(
    buildFieldInput(
      "settings",
      GAME_MESSAGE_ORIGIN_AWARE_LINE_BREAKS_FIELD,
      getValueAtPath(config, GAME_MESSAGE_ORIGIN_AWARE_LINE_BREAKS_FIELD.path),
    ),
  );

  gameMessageSection.append(gameMessageToggleGrid);
  container.append(gameMessageSection);

  const otherTextSection = document.createElement("section");
  otherTextSection.className = "config-group";

  const otherTextHeading = document.createElement("h4");
  otherTextHeading.className = "config-group-title";
  otherTextHeading.textContent = t("config.section.otherText");
  otherTextSection.append(otherTextHeading);

  const otherTextFieldGrid = document.createElement("div");
  otherTextFieldGrid.className = "config-field-grid";
  otherTextFieldGrid.append(
    buildFieldInput(
      "settings",
      TEXT_SCALE_OTHERS_FIELD,
      getValueAtPath(config, TEXT_SCALE_OTHERS_FIELD.path),
    ),
  );

  otherTextSection.append(otherTextFieldGrid);
  container.append(otherTextSection);

  const updatesSection = document.createElement("section");
  updatesSection.className = "config-group";

  const updatesHeading = document.createElement("h4");
  updatesHeading.className = "config-group-title";
  updatesHeading.textContent = t("config.section.updates");
  updatesSection.append(updatesHeading);

  const updatesToggleGrid = document.createElement("div");
  updatesToggleGrid.className = "config-toggle-grid";
  updatesToggleGrid.append(
    buildFieldInput(
      "settings",
      CHECK_UPDATES_FIELD,
      getValueAtPath(config, CHECK_UPDATES_FIELD.path),
    ),
  );

  updatesSection.append(updatesToggleGrid);
  container.append(updatesSection);
}

function renderTranslatorConfig(container, config) {
  container.textContent = "";

  if (typeof config === "undefined") {
    const placeholder = document.createElement("p");
    placeholder.className = "config-empty";
    placeholder.textContent = t("config.empty");
    container.append(placeholder);
    return;
  }

  const providerSection = document.createElement("section");
  providerSection.className = "config-group";

  const providerHeading = document.createElement("h4");
  providerHeading.className = "config-group-title";
  providerHeading.textContent = t("config.section.provider");
  providerSection.append(providerHeading);
  providerSection.append(buildProviderToggle(config));

  const provider = getSelectedProvider(config);
  if (provider === "none") {
    const providerNote = document.createElement("p");
    providerNote.className = "config-group-note";
    providerNote.textContent = t("config.section.noneSettings.note");
    providerSection.append(providerNote);
    container.append(providerSection);
    return;
  }

  container.append(providerSection);

  const settingsSection = document.createElement("section");
  settingsSection.className = "config-group";
  if (provider === "local") {
    settingsSection.classList.add("local-settings-group");
  }

  const settingsHeading = document.createElement("h4");
  settingsHeading.className = "config-group-title";
  settingsHeading.textContent = provider === "deepl"
    ? t("config.section.deeplSettings")
    : t("config.section.localSettings");
  settingsSection.append(settingsHeading);

  if (provider === "local") {
    const settingsNote = document.createElement("p");
    settingsNote.className = "config-group-note";
    settingsNote.textContent = t("config.section.localSettings.note");
    settingsSection.append(settingsNote);
  }

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "config-field-grid";
  if (provider === "local") {
    fieldGrid.classList.add("local-settings-grid");
  }

  const activeFields = provider === "deepl" ? DEEPL_TRANSLATOR_FIELDS : LOCAL_TRANSLATOR_FIELDS;
  for (const field of activeFields) {
    fieldGrid.append(
      buildFieldInput(
        "translator",
        field,
        getValueAtPath(config, field.path),
      ),
    );
  }

  settingsSection.append(fieldGrid);
  container.append(settingsSection);
}

function buildProviderToggle(config) {
  const provider = getSelectedProvider(config);
  const group = document.createElement("div");
  group.className = "config-radio-group";

  for (const option of [
    { value: "local", label: "local", tooltipKey: "provider.local.tooltip" },
    { value: "deepl", label: "deepl", tooltipKey: "provider.deepl.tooltip" },
    { value: "none", label: "none", tooltipKey: "provider.none.tooltip" },
  ]) {
    const label = document.createElement("label");
    label.className = "config-radio-option";
    label.title = t(option.tooltipKey);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "translator-provider";
    input.value = option.value;
    input.checked = provider === option.value;
    input.disabled = !state.configEditable;
    input.addEventListener("change", () => {
      setValueAtPath(state.configDraft.translator, ["provider"], option.value);
      clearConfigErrorsByPrefix("translator:");
      renderConfigEditor();
      renderConfigStatus();
      renderActionState();
    });

    const text = document.createElement("code");
    text.textContent = option.label;
    text.title = t(option.tooltipKey);

    label.append(input, text);
    group.append(label);
  }

  return group;
}

function buildIgnoreTranslationRegexEditor(config) {
  const currentValue = getValueAtPath(config, IGNORE_TRANSLATION_REGEX_FIELD.path);
  const validationErrors = validateIgnoreTranslationRegexValue(currentValue);
  const wrapper = document.createElement("div");
  wrapper.className = "config-field config-regex-editor";
  wrapper.classList.add(getFieldClassName(IGNORE_TRANSLATION_REGEX_FIELD));

  const inputId = "settings-ignore-translation-regex";
  const feedbackId = `${inputId}-feedback`;

  const label = document.createElement("label");
  label.className = "config-label";
  label.setAttribute("for", inputId);
  label.title = getFieldTooltipText(IGNORE_TRANSLATION_REGEX_FIELD);

  const pathText = document.createElement("code");
  pathText.textContent = IGNORE_TRANSLATION_REGEX_FIELD.label;
  pathText.title = getFieldTooltipText(IGNORE_TRANSLATION_REGEX_FIELD);
  label.append(pathText);
  wrapper.append(label);

  const textarea = document.createElement("textarea");
  textarea.id = inputId;
  textarea.rows = getIgnoreTranslationRegexTextareaRows(currentValue);
  textarea.value = formatIgnoreTranslationRegexRules(currentValue);
  textarea.placeholder = t("field.ignoreTranslationRegex.placeholder");
  textarea.spellcheck = false;
  textarea.autocomplete = "off";
  textarea.disabled = !state.configEditable;
  textarea.title = getFieldTooltipText(IGNORE_TRANSLATION_REGEX_FIELD);
  textarea.setAttribute("aria-describedby", feedbackId);
  textarea.setAttribute("autocapitalize", "none");
  if (validationErrors.length > 0) {
    textarea.setAttribute("aria-invalid", "true");
  }
  wrapper.append(textarea);

  const feedback = document.createElement("div");
  feedback.id = feedbackId;
  feedback.className = "config-regex-feedback";
  renderIgnoreTranslationRegexFeedback(
    feedback,
    validationErrors,
    getIgnoreTranslationRegexRuleCount(currentValue),
  );
  wrapper.append(feedback);

  const description = document.createElement("p");
  description.className = "config-field-description";
  description.textContent = t(IGNORE_TRANSLATION_REGEX_FIELD.descriptionKey);
  wrapper.append(description);

  textarea.addEventListener("input", () => {
    const result = normalizeIgnoreTranslationRegexInput(textarea.value);
    setValueAtPath(state.configDraft.settings, IGNORE_TRANSLATION_REGEX_FIELD.path, result.rules);

    if (result.errors.length > 0) {
      textarea.setAttribute("aria-invalid", "true");
    } else {
      textarea.removeAttribute("aria-invalid");
    }

    renderIgnoreTranslationRegexFeedback(feedback, result.errors, result.rules.length);
    renderConfigStatus();
    renderActionState();
  });

  return wrapper;
}

function renderIgnoreTranslationRegexFeedback(container, errors, ruleCount) {
  container.textContent = "";

  if (errors.length > 0) {
    const list = document.createElement("ul");
    list.className = "config-regex-error-list";

    for (const error of errors.slice(0, 5)) {
      const item = document.createElement("li");
      item.textContent = getIgnoreTranslationRegexErrorMessage(error);
      list.append(item);
    }

    container.append(list);

    if (errors.length > 5) {
      const overflow = document.createElement("p");
      overflow.className = "config-field-error";
      overflow.textContent = t("error.ignoreTranslationRegex.more", {
        count: errors.length - 5,
      });
      container.append(overflow);
    }
    return;
  }

  const summary = document.createElement("p");
  summary.className = "config-regex-summary";
  summary.textContent = t("field.ignoreTranslationRegex.summary", { count: ruleCount });
  container.append(summary);
}

function getIgnoreTranslationRegexConfigValidationError() {
  const errors = validateIgnoreTranslationRegexValue(
    getValueAtPath(state.configDraft.settings, IGNORE_TRANSLATION_REGEX_FIELD.path),
  );
  return errors.length > 0 ? getIgnoreTranslationRegexErrorMessage(errors[0]) : null;
}

function getIgnoreTranslationRegexErrorMessage(error) {
  switch (error?.code) {
    case "notArray":
      return t("error.ignoreTranslationRegex.notArray");
    case "notString":
      return t("error.ignoreTranslationRegex.notString", {
        line: error.line,
      });
    case "quoted":
      return t("error.ignoreTranslationRegex.quoted", {
        line: error.line,
      });
    case "unsupportedFlags":
      return t("error.ignoreTranslationRegex.unsupportedFlags", {
        flags: error.flags,
        line: error.line,
        unsupportedFlags: error.unsupportedFlags || error.flags,
      });
    case "invalid":
      return t("error.ignoreTranslationRegex.invalid", {
        line: error.line,
        message: error.message,
      });
    case "empty":
      return t("error.ignoreTranslationRegex.empty", {
        line: error.line,
      });
    default:
      return t("error.ignoreTranslationRegex.invalid", {
        line: error?.line ?? "?",
        message: error?.message ?? t("folder.unknown"),
      });
  }
}

function getIgnoreTranslationRegexRuleCount(value) {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.filter((rule) => typeof rule === "string" && rule.trim()).length;
}

function getIgnoreTranslationRegexTextareaRows(value) {
  const text = formatIgnoreTranslationRegexRules(value);
  if (!text) {
    return 4;
  }

  return Math.min(10, Math.max(4, text.split(/\r\n|\n|\r/u).length + 1));
}

function buildFieldInput(configKey, field, currentValue) {
  const wrapper = document.createElement("div");
  wrapper.className = "config-field";
  wrapper.classList.add(getFieldClassName(field));
  if (field.inputKind === "checkbox") {
    wrapper.classList.add("checkbox-field");
  }
  const errorKey = `${configKey}:${field.id}`;

  const inputId = `${configKey}-${field.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "value"}`;
  if (field.inputKind === "checkbox") {
    const label = document.createElement("label");
    label.className = "config-toggle-option";
    label.setAttribute("for", inputId);
    label.title = getFieldTooltipText(field);

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "checkbox";
    input.checked = Boolean(currentValue);
    input.disabled = !state.configEditable;
    input.addEventListener("change", () => {
      setValueAtPath(state.configDraft[configKey], field.path, input.checked);
      clearFieldError(errorKey, input);
      renderConfigStatus();
      renderActionState();
    });

    const text = document.createElement("code");
    text.textContent = field.label;
    text.title = getFieldTooltipText(field);

    label.append(input, text);
    wrapper.append(label);

    if (field.descriptionKey) {
      const description = document.createElement("p");
      description.className = "config-field-description";
      description.textContent = t(field.descriptionKey);
      wrapper.append(description);
    }

    return wrapper;
  }

  const label = document.createElement("label");
  label.className = "config-label";
  label.setAttribute("for", inputId);
  label.title = getFieldTooltipText(field);

  const pathText = document.createElement("code");
  pathText.textContent = field.label;
  pathText.title = getFieldTooltipText(field);
  label.append(pathText);
  wrapper.append(label);

  const input = createFieldControl(field, inputId, currentValue);
  input.title = getFieldTooltipText(field);
  input.disabled = !state.configEditable;
  if (hasFieldValidationError(configKey, field)) {
    input.setAttribute("aria-invalid", "true");
  }
  attachFieldHandler(configKey, field, input);
  wrapper.append(input);

  const fieldValidationError = getFieldValidationError(configKey, field);
  if (fieldValidationError) {
    const errorText = document.createElement("p");
    errorText.className = "config-field-error";
    errorText.textContent = fieldValidationError;
    wrapper.append(errorText);
  }

  if (field.descriptionKey) {
    const description = document.createElement("p");
    description.className = "config-field-description";
    description.textContent = t(field.descriptionKey);
    wrapper.append(description);
  }

  return wrapper;
}

function createFieldControl(field, inputId, currentValue) {
  if (field.inputKind === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.id = inputId;
    textarea.rows = getTextareaRows(currentValue);
    textarea.value = String(currentValue ?? "");
    textarea.spellcheck = false;
    return textarea;
  }

  const input = document.createElement("input");
  input.id = inputId;
  input.spellcheck = false;

  if (field.inputKind === "number") {
    input.type = "number";
    input.step = field.integer ? "1" : "any";
    if (typeof field.min === "number") {
      input.min = String(field.min);
    }
    if (typeof field.max === "number") {
      input.max = String(field.max);
    }
    input.value = typeof currentValue === "undefined" ? "" : String(currentValue);
    return input;
  }

  input.type = field.inputKind === "secret" ? "password" : "text";
  input.autocomplete = field.inputKind === "secret" || field.inputKind === "sensitive-text"
    ? "new-password"
    : "off";
  input.value = String(currentValue ?? "");
  return input;
}

function attachFieldHandler(configKey, field, input) {
  const errorKey = `${configKey}:${field.id}`;
  if (field.inputKind === "number") {
    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (value === "") {
        markFieldInvalid(errorKey, input);
        return;
      }

      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        markFieldInvalid(errorKey, input);
        return;
      }

      setValueAtPath(state.configDraft[configKey], field.path, parsed);
      if (!isFieldNumberValueValid(field, parsed)) {
        markFieldInvalid(errorKey, input);
        renderConfigStatus();
        renderActionState();
        return;
      }

      clearFieldError(errorKey, input);
      renderConfigStatus();
      renderActionState();
    });
    return;
  }

  input.addEventListener("input", () => {
    setValueAtPath(state.configDraft[configKey], field.path, input.value);
    clearFieldError(errorKey, input);
    renderConfigStatus();
    renderActionState();
  });
}

function markFieldInvalid(fieldId, input) {
  state.configErrors.add(fieldId);
  input.setAttribute("aria-invalid", "true");
  renderConfigStatus();
  renderActionState();
}

function clearFieldError(fieldId, input) {
  state.configErrors.delete(fieldId);
  input.removeAttribute("aria-invalid");
}

function clearConfigErrorsByPrefix(prefix) {
  state.configErrors = new Set(
    [...state.configErrors].filter((fieldId) => !fieldId.startsWith(prefix)),
  );
}

function getFieldTooltipText(field) {
  if (field.tooltipKey) {
    return t(field.tooltipKey);
  }

  if (field.descriptionKey) {
    return t(field.descriptionKey);
  }

  return field.label;
}

function getFieldClassName(field) {
  const normalizedId = field.id
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `config-field--${normalizedId || "value"}`;
}

function renderLog() {
  logList.textContent = "";

  const entries = state.logs.length > 0
    ? state.logs
    : [{ message: t("log.waitingForBundle"), tone: "info" }];

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `log-entry ${entry.tone}`;
    item.textContent = entry.message;
    logList.append(item);
  }
}

function renderActionState() {
  pickFolderButton.disabled = state.busy || !supportsInstallation();
  installButton.disabled = state.busy || !canInstall();
  saveConfigButton.disabled = state.busy || !canSaveConfig();
  resetConfigButton.disabled = state.busy || !canResetConfig();
  scanDllFolderButton.hidden = false;
  scanDllFolderButton.disabled = state.dllScanBusy || !state.dllHashCatalog;
  const reinstall = hasExistingInstallation();

  pickFolderButton.title = t("tooltip.pickFolderButton");
  installButton.title = t(reinstall ? "tooltip.reinstallButton" : "tooltip.installButton");
  saveConfigButton.title = t("tooltip.saveConfigButton");
  resetConfigButton.title = t("tooltip.resetConfigButton");
  scanDllFolderButton.title = t("tooltip.scanDllFolderButton");

  installButton.textContent = state.busyAction === "install"
    ? t(reinstall ? "button.reinstalling" : "button.installing")
    : t(reinstall ? "button.reinstall" : "button.install");
  saveConfigButton.textContent = state.busyAction === "save-config"
    ? t("button.saving")
    : t("button.saveConfig");
  resetConfigButton.textContent = t("button.resetConfig");
  scanDllFolderButton.textContent = state.dllScanBusy
    ? t("scanner.status.scanning")
    : t("button.scanDllFolder");
}

function canInstall() {
  return Boolean(
    state.manifest
      && state.rootHandle
      && state.inspection?.valid
      && supportsInstallation(),
  );
}

function canSaveConfig() {
  return Boolean(
    state.manifest
      && state.rootHandle
      && state.inspection?.valid
      && state.loadedConfigs
      && state.configDraft
      && state.configEditable
      && state.configErrors.size === 0
      && !getConfigValidationError()
      && hasUnsavedConfigChanges()
      && supportsInstallation(),
  );
}

function canResetConfig() {
  return Boolean(
    state.configEditable
      && hasUnsavedConfigChanges(),
  );
}

function hasUnsavedConfigChanges() {
  return Boolean(
    state.loadedConfigs
      && state.configDraft
      && !configDraftsEqual(state.loadedConfigs, state.configDraft),
  );
}

function hasExistingInstallation() {
  return Boolean(state.existingInstallationDetected);
}

function getPickedFolderName(files) {
  const firstPath = String(files[0]?.webkitRelativePath ?? "");
  const separatorIndex = firstPath.indexOf("/");
  if (separatorIndex <= 0) {
    return "";
  }

  return firstPath.slice(0, separatorIndex);
}

function resetDllScan() {
  state.dllScan = null;
  state.dllScanBusy = false;
  state.dllScanNeedsFilePicker = false;
  state.dllScanProgressCount = 0;
}

function isCurrentDllScan(scanRunId, rootHandle) {
  return state.dllScanRunId === scanRunId && state.rootHandle === rootHandle;
}

function resetSelectedFolderState() {
  state.inspection = null;
  state.existingInstallationDetected = false;
  state.loadedConfigs = null;
  state.configDraft = null;
  state.configEditable = false;
  state.configAlertMessage = "";
  state.configStatusMessage = t("config.status.initial");
  state.configUnsavedMessage = "";
  state.configUnsavedReminderFlashPending = false;
  state.configErrors = new Set();
  state.installedTranslatorVersion = null;
  state.installedVersionChecked = false;
  renderConfigEditor();
}

function getSelectedProvider(config) {
  const provider = String(getValueAtPath(config, ["provider"]) ?? "").trim().toLowerCase();
  if (provider === "deepl" || provider === "local" || provider === "none") {
    return provider;
  }
  return "local";
}

function getConfigValidationError() {
  const settingsValidationError = getSettingsConfigValidationError();
  if (settingsValidationError) {
    return settingsValidationError;
  }

  return getTranslatorConfigValidationError();
}

function getTranslatorConfigValidationError() {
  if (!state.configDraft?.translator) {
    return null;
  }

  if (getSelectedProvider(state.configDraft.translator) !== "deepl") {
    return null;
  }

  const apiKey = String(getValueAtPath(state.configDraft.translator, ["settings", "deepl", "apiKey"]) ?? "");
  if (apiKey.includes(DEEPL_APIKEY_PLACEHOLDER_SUBSTRING)) {
    return t("error.deeplPlaceholder", { value: DEEPL_APIKEY_PLACEHOLDER_SUBSTRING });
  }

  return null;
}

function hasFieldValidationError(configKey, field) {
  return Boolean(getFieldValidationError(configKey, field));
}

function getFieldValidationError(configKey, field) {
  const config = state.configDraft?.[configKey];
  if (config) {
    const value = getValueAtPath(config, field.path);
    if (field.required && typeof value === "undefined") {
      return getMissingFieldValidationMessage(field);
    }

    if (field.inputKind === "number" && typeof value !== "undefined" && !isFieldNumberValueValid(field, Number(value))) {
      return getNumberFieldValidationMessage(field);
    }
  }

  if (configKey === "translator" && field.id === "settings.deepl.apiKey") {
    return getTranslatorConfigValidationError();
  }

  return null;
}

function getSettingsConfigValidationError() {
  if (!state.configDraft?.settings) {
    return null;
  }

  for (const field of [
    TRANSLATION_MAX_OUTPUT_TOKENS_FIELD,
    GAME_MESSAGE_TEXT_SCALE_FIELD,
    TEXT_SCALE_OTHERS_FIELD,
  ]) {
    const value = getValueAtPath(state.configDraft.settings, field.path);
    if (typeof value !== "undefined" && !isFieldNumberValueValid(field, Number(value))) {
      return getNumberFieldValidationMessage(field);
    }

    if (field.required && typeof value === "undefined") {
      return getMissingFieldValidationMessage(field);
    }
  }

  const ignoreTranslationRegexValidationError = getIgnoreTranslationRegexConfigValidationError();
  if (ignoreTranslationRegexValidationError) {
    return ignoreTranslationRegexValidationError;
  }

  return null;
}

function isFieldNumberValueValid(field, value) {
  return validateNumberValue(value, {
    integer: field.integer,
    min: field.min,
    max: field.max,
  });
}

function getNumberFieldValidationMessage(field) {
  if (field.validationMessageKey) {
    return t(field.validationMessageKey, {
      min: field.min,
      max: field.max,
    });
  }

  return t("config.status.invalidNumber.one");
}

function getMissingFieldValidationMessage(field) {
  return t("error.requiredConfigFieldMissing", {
    field: field.id,
  });
}

function getTextareaRows(value) {
  const text = String(value ?? "");
  if (text.includes("\n")) {
    return Math.min(8, text.split("\n").length + 1);
  }

  return text.length > 160 ? 5 : 3;
}
