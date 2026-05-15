import {
  ensureReadWritePermission,
  INSTALL_MANIFEST_URL,
  INSTALL_VERSION_URL,
  PUBLISHED_VERSION_URL,
  getInstallVersionMismatch,
  inspectGameDirectory,
  installGame,
  isVersionOutdated,
  loadInstalledConfigs,
  loadManifest,
  loadPublishedVersionInfo,
  loadVersionInfo,
  saveInstalledConfigs,
} from "./installer-core.mjs";
import {
  cloneConfigSet,
  configDraftsEqual,
  formatIgnoreTranslationRegexRules,
  formatPlaintextSubstitutionRules,
  formatTranslationRegexReplacementRules,
  getValueAtPath,
  mergeConfigDefaults,
  normalizeIgnoreTranslationRegexInput,
  normalizePlaintextSubstitutionInput,
  normalizeTranslationRegexReplacementInput,
  setValueAtPath,
  validateIgnoreTranslationRegexValue,
  validatePlaintextSubstitutionValue,
  validateTranslationRegexReplacementValue,
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

const DISABLE_GUI_AUTO_LAUNCH_FIELD = {
  id: "disableGuiAutoLaunch",
  path: ["disableGuiAutoLaunch"],
  inputKind: "checkbox",
  label: "disableGuiAutoLaunch",
  descriptionKey: "field.disableGuiAutoLaunch.description",
  tooltipKey: "field.disableGuiAutoLaunch.tooltip",
};
const DIAGNOSTICS_PERFORMANCE_MODE_FIELD = {
  id: "diagnostics.performanceMode",
  path: ["diagnostics", "performanceMode"],
  inputKind: "checkbox",
  label: "performanceMode",
  descriptionKey: "field.diagnostics.performanceMode.description",
  tooltipKey: "field.diagnostics.performanceMode.tooltip",
};
const REINSTALL_DEFAULT_CONFIG_PATHS = [
  ["settings", ...CHECK_UPDATES_FIELD.path],
];
const UPGRADE_DEFAULT_CONFIG_PATHS = [
  ["settings", "enableForesight"],
  ["settings", "diagnostics", "performanceMode"],
  ["settings", "showForesightSpoilers"],
  ["settings", "ignoreTranslationRegex"],
  ["settings", "overrideTranslationRegex"],
  ["settings", "substitutePlaintextBeforeTranslation"],
];

const ENABLE_FORESIGHT_FIELD = {
  id: "enableForesight",
  path: ["enableForesight"],
  inputKind: "checkbox",
  label: "enableForesight",
  descriptionKey: "field.enableForesight.description",
  tooltipKey: "field.enableForesight.tooltip",
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
  placeholderKey: "field.ignoreTranslationRegex.placeholder",
  summaryKey: "field.ignoreTranslationRegex.summary",
  tooltipKey: "field.ignoreTranslationRegex.tooltip",
};

const OVERRIDE_TRANSLATION_REGEX_FIELD = {
  id: "overrideTranslationRegex",
  path: ["overrideTranslationRegex"],
  inputKind: "regex-pair-list",
  label: "overrideTranslationRegex",
  descriptionKey: "field.overrideTranslationRegex.description",
  placeholderKey: "field.overrideTranslationRegex.placeholder",
  summaryKey: "field.overrideTranslationRegex.summary",
  tooltipKey: "field.overrideTranslationRegex.tooltip",
};

const SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_FIELD = {
  id: "substitutePlaintextBeforeTranslation",
  path: ["substitutePlaintextBeforeTranslation"],
  inputKind: "plaintext-pair-list",
  label: "substitutePlaintextBeforeTranslation",
  descriptionKey: "field.substitutePlaintextBeforeTranslation.description",
  placeholderKey: "field.substitutePlaintextBeforeTranslation.placeholder",
  summaryKey: "field.substitutePlaintextBeforeTranslation.summary",
  tooltipKey: "field.substitutePlaintextBeforeTranslation.tooltip",
};

const RULE_LIST_FIELD_BEHAVIOR = {
  ignoreTranslationRegex: {
    format: formatIgnoreTranslationRegexRules,
    normalize: normalizeIgnoreTranslationRegexInput,
    validate: validateIgnoreTranslationRegexValue,
  },
  overrideTranslationRegex: {
    format: formatTranslationRegexReplacementRules,
    normalize: normalizeTranslationRegexReplacementInput,
    validate: validateTranslationRegexReplacementValue,
  },
  substitutePlaintextBeforeTranslation: {
    format: formatPlaintextSubstitutionRules,
    normalize: normalizePlaintextSubstitutionInput,
    validate: validatePlaintextSubstitutionValue,
  },
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
  manifestLoadComplete: false,
  manifestLoadError: "",
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
  latestStableVersion: null,
  installedTranslatorVersion: null,
  installedVersionChecked: false,
  dllHashCatalog: null,
  dllHashCatalogLoaded: false,
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
const configEditorSection = document.querySelector("#config-editor-section");
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
  state.latestStableVersion = await loadPublishedVersionInfo(PUBLISHED_VERSION_URL);
  await initializeDllHashCatalog();

  if (!supportsInstallation()) {
    pushLog(t("error.browserCannotInstall"), "error");
    render();
    return;
  }

  try {
    state.manifest = await loadManifest(INSTALL_MANIFEST_URL, { t });
    state.manifestLoadError = "";
    pushLog(
      t("log.bundleLoaded", {
        count: state.manifest.install.files.length + (state.manifest.install.settings ? 1 : 0),
      }),
      "info",
    );

    if (state.rootHandle) {
      await refreshInstalledConfigSnapshot({ logOutcome: false });
    }
  } catch (error) {
    state.manifestLoadError = error.message;
    pushLog(t("error.loadBundle", { message: error.message }), "error");
  } finally {
    state.manifestLoadComplete = true;
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
  } finally {
    state.dllHashCatalogLoaded = true;
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
    await assertInstallableVersionIsCurrent();

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

async function assertInstallableVersionIsCurrent() {
  const publishedVersion = await loadPublishedVersionInfo(PUBLISHED_VERSION_URL);
  state.latestStableVersion = publishedVersion;
  renderVersionInfo();

  const mismatch = getInstallVersionMismatch(state.translatorVersion, publishedVersion);
  if (!mismatch) {
    return;
  }

  throw new Error(t("error.outdatedInstallerPage", {
    installableVersion: getDisplayVersion(mismatch.installableVersion),
    publishedVersion: getDisplayVersion(mismatch.publishedVersion),
  }));
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

  const snapshot = await loadInstalledConfigs(state.rootHandle, state.manifest, {
    defaultMissingConfigPaths: UPGRADE_DEFAULT_CONFIG_PATHS,
    t,
  });
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
  const defaultedConfigs = snapshot.defaultedConfigs ? cloneConfigSet(snapshot.defaultedConfigs) : null;
  const configDraft = createConfigDraftFromSnapshot(
    snapshot,
    loadedConfigs,
    options.preservedConfigDraft,
    defaultedConfigs,
  );
  const defaultedDraftApplied = Boolean(
    snapshot.editable
      && loadedConfigs
      && defaultedConfigs
      && configDraft
      && !configDraftsEqual(loadedConfigs, configDraft),
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
    : defaultedDraftApplied
      ? t("config.status.upgradeDefaults")
    : "";
  state.configUnsavedReminderFlashPending = preservedDraftApplied || defaultedDraftApplied;
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

function createConfigDraftFromSnapshot(snapshot, loadedConfigs, preservedConfigDraft, defaultedConfigs) {
  if (!loadedConfigs) {
    return null;
  }

  if (snapshot.editable && preservedConfigDraft) {
    return mergeConfigDefaults(loadedConfigs, preservedConfigDraft, {
      useDefaultForPaths: REINSTALL_DEFAULT_CONFIG_PATHS,
    });
  }

  if (snapshot.editable && defaultedConfigs) {
    return cloneConfigSet(defaultedConfigs);
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
  const latestStableVersion = getDisplayVersion(state.latestStableVersion);
  const installableVersion = getDisplayVersion(state.translatorVersion);
  let tone = "neutral";
  const currentVersion = state.installedVersionChecked
    ? getDisplayVersion(state.installedTranslatorVersion)
    : t("folder.unknown");
  const versionForUpdateCheck = state.latestStableVersion ?? state.translatorVersion;

  if (getInstallVersionMismatch(state.translatorVersion, state.latestStableVersion)) {
    tone = "warning";
  } else if (state.installedVersionChecked) {
    tone = isVersionOutdated(state.installedTranslatorVersion, versionForUpdateCheck)
      ? "warning"
      : "success";
  }

  setVersionStatusTone(tone);
  translatorVersion.textContent = t("page.version.summary", {
    latestStableVersion,
    installableVersion,
    currentVersion,
  });
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

  if (!state.manifestLoadComplete) {
    supportNote.textContent = t("support.loadingBundle");
    return;
  }

  if (state.manifestLoadError) {
    supportNote.textContent = t("error.loadBundle", { message: state.manifestLoadError });
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
    if (!state.dllHashCatalogLoaded) {
      return {
        tone: "neutral",
        message: t("scanner.status.loading"),
      };
    }

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

  if (!state.configDraft) {
    if (!supportsInstallation()) {
      setConfigStatusTone("error");
      setConfigStatusFlags();
      configStatus.textContent = t("error.browserCannotInstall");
      return;
    }

    if (!state.manifestLoadComplete) {
      setConfigStatusTone("neutral");
      setConfigStatusFlags();
      configStatus.textContent = t("config.status.loading");
      return;
    }

    if (state.manifestLoadError) {
      setConfigStatusTone("error");
      setConfigStatusFlags();
      configStatus.textContent = t("error.loadBundle", { message: state.manifestLoadError });
      return;
    }
  }

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
  const hasSettingsConfig = typeof state.configDraft?.settings !== "undefined";
  const hasTranslatorConfig = typeof state.configDraft?.translator !== "undefined";
  const editorLocked = Boolean(state.configDraft) && !state.configEditable;

  configEditorSection.hidden = !hasSettingsConfig && !hasTranslatorConfig;
  settingsConfigFields.hidden = !hasSettingsConfig;
  translatorConfigFields.hidden = !hasTranslatorConfig;
  translatorConfigFields.classList.toggle(
    "config-fields--standalone",
    hasTranslatorConfig && !hasSettingsConfig,
  );
  settingsConfigFields.classList.toggle("is-locked", editorLocked);
  translatorConfigFields.classList.toggle("is-locked", editorLocked);
  renderSettingsConfig(settingsConfigFields, state.configDraft?.settings);
  renderTranslatorConfig(
    translatorConfigFields,
    state.configDraft?.translator,
    state.configDraft?.settings,
  );
}

function renderSettingsConfig(container, config) {
  container.textContent = "";

  if (typeof config === "undefined") {
    return;
  }

  const translationSection = createConfigGroup("config.section.translation");
  translationSection.append(buildConfigFieldRow([
    { configKey: "settings", config, field: SETTINGS_FIELD },
    { configKey: "settings", config, field: ENABLE_FORESIGHT_FIELD },
  ]));
  container.append(translationSection);

  const textDisplaySection = createConfigGroup("config.section.textDisplay");
  textDisplaySection.append(buildConfigFieldRow([
    { configKey: "settings", config, field: GAME_MESSAGE_TEXT_SCALE_FIELD },
    { configKey: "settings", config, field: TEXT_SCALE_OTHERS_FIELD },
    { configKey: "settings", config, field: GAME_MESSAGE_ORIGIN_AWARE_LINE_BREAKS_FIELD },
  ]));
  container.append(textDisplaySection);

  container.append(buildTextManipulationPanel(config));

  const appBehaviorSection = createConfigGroup("config.section.appBehavior");
  appBehaviorSection.append(buildConfigFieldRow([
    { configKey: "settings", config, field: DISABLE_GUI_AUTO_LAUNCH_FIELD },
    { configKey: "settings", config, field: DIAGNOSTICS_PERFORMANCE_MODE_FIELD },
    { configKey: "settings", config, field: CHECK_UPDATES_FIELD },
  ]));
  container.append(appBehaviorSection);
}

function renderTranslatorConfig(container, config, settingsConfig) {
  container.textContent = "";

  if (typeof config === "undefined") {
    return;
  }

  const providerSection = createConfigGroup("config.section.provider");
  providerSection.append(buildProviderToggle(config));

  const provider = getSelectedProvider(config);
  if (provider === "none") {
    appendConfigGroupNote(providerSection, t("config.section.noneSettings.note"));
    container.append(providerSection);
    return;
  }

  container.append(providerSection);

  const settingsSection = createConfigGroup(
    provider === "deepl" ? "config.section.deeplSettings" : "config.section.localSettings",
    ...(provider === "local" ? ["local-settings-group"] : []),
  );

  if (provider === "local") {
    appendConfigGroupNote(settingsSection, t("config.section.localSettings.note"));
  } else if (provider === "deepl") {
    appendConfigGroupNote(settingsSection, t("provider.deepl.description"));
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

    if (provider === "local" && field.id === "settings.local.repeat_penalty") {
      fieldGrid.append(
        buildFieldInput(
          "settings",
          TRANSLATION_MAX_OUTPUT_TOKENS_FIELD,
          getValueAtPath(settingsConfig, TRANSLATION_MAX_OUTPUT_TOKENS_FIELD.path),
        ),
      );
    }
  }

  settingsSection.append(fieldGrid);
  container.append(settingsSection);
}

function createConfigGroup(titleKey, ...classNames) {
  const section = document.createElement("section");
  section.className = ["config-group", ...classNames].filter(Boolean).join(" ");

  const heading = document.createElement("h4");
  heading.className = "config-group-title";
  heading.textContent = t(titleKey);
  section.append(heading);

  return section;
}

function appendConfigGroupNote(section, text) {
  const note = document.createElement("p");
  note.className = "config-group-note";
  note.textContent = text;
  section.append(note);
}

function buildConfigFieldRow(items) {
  const row = document.createElement("div");
  row.className = "config-field-row";

  for (const item of items) {
    row.append(
      buildFieldInput(
        item.configKey,
        item.field,
        getValueAtPath(item.config, item.field.path),
      ),
    );
  }

  return row;
}

function buildTextManipulationPanel(config) {
  const panel = document.createElement("details");
  panel.className = "config-group config-collapsible";
  panel.open = hasTextManipulationRules(config);

  const summary = document.createElement("summary");
  summary.className = "config-collapsible-summary";

  const title = document.createElement("span");
  title.className = "config-group-title config-collapsible-title";
  title.textContent = t("config.section.textManipulation");
  summary.append(title);

  const content = document.createElement("div");
  content.className = "config-collapsible-content";
  content.append(
    buildRuleListEditor(config, IGNORE_TRANSLATION_REGEX_FIELD),
    buildRuleListEditor(config, OVERRIDE_TRANSLATION_REGEX_FIELD),
    buildRuleListEditor(config, SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_FIELD),
  );

  panel.append(summary, content);
  return panel;
}

function hasTextManipulationRules(config) {
  return [
    IGNORE_TRANSLATION_REGEX_FIELD,
    OVERRIDE_TRANSLATION_REGEX_FIELD,
    SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_FIELD,
  ].some((field) => hasRuleListContent(getValueAtPath(config, field.path)));
}

function hasRuleListContent(value) {
  if (Array.isArray(value)) {
    return getRuleListRuleCount(value) > 0;
  }

  return typeof value !== "undefined" && value !== null;
}

function buildProviderToggle(config) {
  const provider = getSelectedProvider(config);
  const group = document.createElement("div");
  group.className = "config-field-row config-field-row--provider";

  for (const option of [
    {
      value: "local",
      label: "local (LM Studio)",
      tooltipKey: "provider.local.tooltip",
    },
    {
      value: "deepl",
      label: "deepl",
      tooltipKey: "provider.deepl.tooltip",
    },
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

    const wrapper = document.createElement("div");
    wrapper.className = "config-field config-field--provider-option";
    wrapper.append(label);
    group.append(wrapper);
  }

  return group;
}

function buildRuleListEditor(config, field) {
  const behavior = getRuleListFieldBehavior(field);
  const currentValue = getValueAtPath(config, field.path);
  const validationErrors = behavior.validate(currentValue);
  const wrapper = document.createElement("div");
  wrapper.className = "config-field config-regex-editor";
  wrapper.classList.add(getFieldClassName(field));

  const inputId = `settings-${field.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}`;
  const feedbackId = `${inputId}-feedback`;

  const label = document.createElement("label");
  label.className = "config-label";
  label.setAttribute("for", inputId);
  label.title = getFieldTooltipText(field);

  const pathText = document.createElement("code");
  pathText.textContent = field.label;
  pathText.title = getFieldTooltipText(field);
  label.append(pathText);
  wrapper.append(label);

  const textarea = document.createElement("textarea");
  textarea.id = inputId;
  textarea.rows = getRuleListTextareaRows(field, currentValue);
  textarea.value = behavior.format(currentValue);
  textarea.placeholder = field.placeholderKey ? t(field.placeholderKey) : "";
  textarea.spellcheck = false;
  textarea.autocomplete = "off";
  textarea.disabled = !state.configEditable;
  textarea.title = getFieldTooltipText(field);
  textarea.setAttribute("aria-describedby", feedbackId);
  textarea.setAttribute("autocapitalize", "none");
  if (validationErrors.length > 0) {
    textarea.setAttribute("aria-invalid", "true");
  }
  wrapper.append(textarea);

  const feedback = document.createElement("div");
  feedback.id = feedbackId;
  feedback.className = "config-regex-feedback";
  renderRuleListFeedback(
    feedback,
    field,
    validationErrors,
    getRuleListRuleCount(currentValue),
  );
  wrapper.append(feedback);

  const description = document.createElement("p");
  description.className = "config-field-description";
  description.textContent = t(field.descriptionKey);
  wrapper.append(description);

  textarea.addEventListener("input", () => {
    const result = behavior.normalize(textarea.value);
    setValueAtPath(state.configDraft.settings, field.path, result.rules);

    if (result.errors.length > 0) {
      textarea.setAttribute("aria-invalid", "true");
    } else {
      textarea.removeAttribute("aria-invalid");
    }

    renderRuleListFeedback(feedback, field, result.errors, result.rules.length);
    renderConfigStatus();
    renderActionState();
  });

  return wrapper;
}

function renderRuleListFeedback(container, field, errors, ruleCount) {
  container.textContent = "";

  if (errors.length > 0) {
    const list = document.createElement("ul");
    list.className = "config-regex-error-list";

    for (const error of errors.slice(0, 5)) {
      const item = document.createElement("li");
      item.textContent = getRuleListErrorMessage(field, error);
      list.append(item);
    }

    container.append(list);

    if (errors.length > 5) {
      const overflow = document.createElement("p");
      overflow.className = "config-field-error";
      overflow.textContent = t("error.ruleList.more", {
        count: errors.length - 5,
        field: field.label,
      });
      container.append(overflow);
    }
    return;
  }

  const summary = document.createElement("p");
  summary.className = "config-regex-summary";
  summary.textContent = t(field.summaryKey, { count: ruleCount });
  container.append(summary);
}

function getRuleListFieldBehavior(field) {
  return RULE_LIST_FIELD_BEHAVIOR[field.id];
}

function getRuleListConfigValidationError(field) {
  const behavior = getRuleListFieldBehavior(field);
  const errors = behavior.validate(
    getValueAtPath(state.configDraft.settings, field.path),
  );
  return errors.length > 0 ? getRuleListErrorMessage(field, errors[0]) : null;
}

function getRuleListErrorMessage(field, error) {
  if (field.id === IGNORE_TRANSLATION_REGEX_FIELD.id) {
    return getIgnoreTranslationRegexErrorMessage(error);
  }

  switch (error?.code) {
    case "notArray":
      return t("error.ruleList.notArray", {
        field: field.label,
      });
    case "notObject":
      return t("error.ruleList.notObject", {
        field: field.label,
        line: error.line,
      });
    case "notString":
      return t("error.ruleList.notString", {
        field: field.label,
        line: error.line,
      });
    case "regexNotString":
      return t("error.ruleList.regexNotString", {
        field: field.label,
        line: error.line,
      });
    case "plaintextNotString":
      return t("error.ruleList.plaintextNotString", {
        field: field.label,
        line: error.line,
      });
    case "replacementNotString":
      return t("error.ruleList.replacementNotString", {
        field: field.label,
        line: error.line,
      });
    case "missingSeparator":
      return t("error.ruleList.missingSeparator", {
        field: field.label,
        line: error.line,
      });
    case "quoted":
      return t("error.ruleList.quoted", {
        field: field.label,
        line: error.line,
      });
    case "unsupportedFlags":
      return t("error.ruleList.unsupportedFlags", {
        field: field.label,
        flags: error.flags,
        line: error.line,
        unsupportedFlags: error.unsupportedFlags || error.flags,
      });
    case "invalid":
      return t("error.ruleList.invalid", {
        field: field.label,
        line: error.line,
        message: error.message,
      });
    case "empty":
      return t("error.ruleList.empty", {
        field: field.label,
        line: error.line,
      });
    default:
      return t("error.ruleList.invalid", {
        field: field.label,
        line: error?.line ?? "?",
        message: error?.message ?? t("folder.unknown"),
      });
  }
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

function getRuleListRuleCount(value) {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.filter((rule) => {
    if (typeof rule === "string") {
      return Boolean(rule.trim());
    }

    return Boolean(rule && typeof rule === "object");
  }).length;
}

function getRuleListTextareaRows(field, value) {
  const behavior = getRuleListFieldBehavior(field);
  const text = behavior.format(value);
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

  for (const field of [
    IGNORE_TRANSLATION_REGEX_FIELD,
    OVERRIDE_TRANSLATION_REGEX_FIELD,
    SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_FIELD,
  ]) {
    const ruleListValidationError = getRuleListConfigValidationError(field);
    if (ruleListValidationError) {
      return ruleListValidationError;
    }
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
