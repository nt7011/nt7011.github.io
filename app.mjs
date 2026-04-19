import {
  ensureReadWritePermission,
  inspectGameDirectory,
  installGame,
  loadInstalledConfigs,
  loadManifest,
  saveInstalledConfigs,
} from "./installer-core.mjs";
import {
  cloneConfigSet,
  configDraftsEqual,
  getValueAtPath,
  setValueAtPath,
} from "./config-editor.mjs";

const SETTINGS_FIELD = {
  id: "translation.disableCjkFilter",
  path: ["translation", "disableCjkFilter"],
  inputKind: "checkbox",
  label: "disableCjkFilter",
  description: "When turned on, only translates ingame text in Chinese, Japanese, or Korean",
};

const LOCAL_TRANSLATOR_FIELDS = [
  { id: "settings.local.address", path: ["settings", "local", "address"], inputKind: "text", label: "address" },
  { id: "settings.local.port", path: ["settings", "local", "port"], inputKind: "number", label: "port" },
  { id: "settings.local.model", path: ["settings", "local", "model"], inputKind: "text", label: "model" },
  {
    id: "settings.local.system_prompt",
    path: ["settings", "local", "system_prompt"],
    inputKind: "textarea",
    label: "system_prompt",
  },
  { id: "settings.local.temperature", path: ["settings", "local", "temperature"], inputKind: "number", label: "temperature" },
  { id: "settings.local.top_p", path: ["settings", "local", "top_p"], inputKind: "number", label: "top_p" },
  { id: "settings.local.top_k", path: ["settings", "local", "top_k"], inputKind: "number", label: "top_k" },
  { id: "settings.local.min_p", path: ["settings", "local", "min_p"], inputKind: "number", label: "min_p" },
  {
    id: "settings.local.repeat_penalty",
    path: ["settings", "local", "repeat_penalty"],
    inputKind: "number",
    label: "repeat_penalty",
  },
];

const DEEPL_TRANSLATOR_FIELDS = [
  { id: "settings.deepl.language", path: ["settings", "deepl", "language"], inputKind: "text", label: "language" },
  { id: "settings.deepl.apiKey", path: ["settings", "deepl", "apiKey"], inputKind: "sensitive-text", label: "apiKey" },
];
const DEEPL_APIKEY_PLACEHOLDER_SUBSTRING = "__NONE__";

const state = {
  manifest: null,
  rootHandle: null,
  inspection: null,
  busy: false,
  busyAction: null,
  logs: [],
  loadedConfigs: null,
  configDraft: null,
  configStatusMessage: "Select a game folder to load installed settings.json and translator.json.",
  configErrors: new Set(),
};

const pickFolderButton = document.querySelector("#pick-folder-button");
const installButton = document.querySelector("#install-button");
const saveConfigButton = document.querySelector("#save-config-button");
const resetConfigButton = document.querySelector("#reset-config-button");
const supportNote = document.querySelector("#support-note");
const folderName = document.querySelector("#folder-name");
const folderStatus = document.querySelector("#folder-status");
const folderLayout = document.querySelector("#folder-layout");
const pluginTarget = document.querySelector("#plugin-target");
const pluginsFile = document.querySelector("#plugins-file");
const packageList = document.querySelector("#package-list");
const configStatus = document.querySelector("#config-status");
const settingsConfigFields = document.querySelector("#settings-config-fields");
const translatorConfigFields = document.querySelector("#translator-config-fields");
const logList = document.querySelector("#log-list");

pickFolderButton.addEventListener("click", handlePickFolder);
installButton.addEventListener("click", handleInstall);
saveConfigButton.addEventListener("click", handleSaveConfig);
resetConfigButton.addEventListener("click", handleResetConfig);

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

    await refreshInstalledConfigSnapshot({ logOutcome: true });
  } catch (error) {
    if (error?.name !== "AbortError") {
      pushLog(`Folder selection failed: ${error.message}`, "error");
    }
  }

  render();
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
    await refreshInstalledConfigSnapshot({ logOutcome: true });
  } catch (error) {
    pushLog(`Installation failed: ${error.message}`, "error");
  } finally {
    state.busy = false;
    state.busyAction = null;
    render();
  }
}

async function handleSaveConfig() {
  const validationError = getConfigValidationError();
  if (validationError) {
    pushLog(`Saving configuration failed: ${validationError}`, "error");
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
      throw new Error("Read and write permission was not granted for the selected folder.");
    }

    const result = await saveInstalledConfigs(state.rootHandle, state.manifest, state.configDraft);
    pushLog(
      `Saved settings.json and translator.json in ${result.supportDirectory}.`,
      "success",
    );

    await refreshInstalledConfigSnapshot({ logOutcome: false });
  } catch (error) {
    pushLog(`Saving configuration failed: ${error.message}`, "error");
  } finally {
    state.busy = false;
    state.busyAction = null;
    render();
  }
}

function handleResetConfig() {
  if (!state.loadedConfigs) {
    return;
  }

  state.configDraft = cloneConfigSet(state.loadedConfigs);
  state.configErrors = new Set();
  renderConfigEditor();
  render();
  pushLog("Discarded unsaved configuration changes.", "info");
}

async function refreshInstalledConfigSnapshot(options = {}) {
  if (!state.manifest) {
    return;
  }

  const snapshot = await loadInstalledConfigs(state.rootHandle, state.manifest);
  applyConfigSnapshot(snapshot, {
    logWarnings: options.logWarnings ?? true,
  });

  if (options.logOutcome ?? false) {
    pushLog(snapshot.reason, snapshot.available ? "info" : "warning");
  }
}

function applyConfigSnapshot(snapshot, options = {}) {
  state.loadedConfigs = snapshot.available ? cloneConfigSet(snapshot.configs) : null;
  state.configDraft = snapshot.available ? cloneConfigSet(snapshot.configs) : null;
  state.configStatusMessage = snapshot.reason;
  state.configErrors = new Set();

  renderConfigEditor();
  render();

  if (options.logWarnings ?? true) {
    for (const warning of snapshot.warnings) {
      pushLog(warning, "warning");
    }
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
  renderConfigStatus();
  renderLog();
  renderActionState();
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
    supportNote.textContent = "Select the game folder that contains Game.exe.";
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

function renderConfigStatus() {
  let message = state.configStatusMessage;
  const validationError = getConfigValidationError();

  if (state.configDraft) {
    if (validationError) {
      message += ` Error: ${validationError}`;
    } else if (state.configErrors.size > 0) {
      message += ` Fix ${state.configErrors.size} invalid number field${state.configErrors.size === 1 ? "" : "s"} before saving.`;
    } else if (hasUnsavedConfigChanges()) {
      message += " Unsaved changes.";
    } else {
      message += " No unsaved changes.";
    }
  }

  configStatus.textContent = message;
}

function renderConfigEditor() {
  renderSettingsConfig(settingsConfigFields, state.configDraft?.settings);
  renderTranslatorConfig(translatorConfigFields, state.configDraft?.translator);
}

function renderSettingsConfig(container, config) {
  container.textContent = "";

  if (typeof config === "undefined") {
    const placeholder = document.createElement("p");
    placeholder.className = "config-empty";
    placeholder.textContent = "Installed configuration will appear here after the plugin is present in the selected folder.";
    container.append(placeholder);
    return;
  }

  const section = document.createElement("section");
  section.className = "config-group";

  const heading = document.createElement("h4");
  heading.className = "config-group-title";
  heading.textContent = "Translation";
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
  container.append(section);
}

function renderTranslatorConfig(container, config) {
  container.textContent = "";

  if (typeof config === "undefined") {
    const placeholder = document.createElement("p");
    placeholder.className = "config-empty";
    placeholder.textContent = "Installed configuration will appear here after the plugin is present in the selected folder.";
    container.append(placeholder);
    return;
  }

  const providerSection = document.createElement("section");
  providerSection.className = "config-group";

  const providerHeading = document.createElement("h4");
  providerHeading.className = "config-group-title";
  providerHeading.textContent = "Provider";
  providerSection.append(providerHeading);
  providerSection.append(buildProviderToggle(config));
  container.append(providerSection);

  const provider = getSelectedProvider(config);
  const settingsSection = document.createElement("section");
  settingsSection.className = "config-group";

  const settingsHeading = document.createElement("h4");
  settingsHeading.className = "config-group-title";
  settingsHeading.textContent = provider === "deepl" ? "DeepL Settings" : "Local Settings";
  settingsSection.append(settingsHeading);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "config-field-grid";

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
    { value: "local", label: "local" },
    { value: "deepl", label: "deepl" },
  ]) {
    const label = document.createElement("label");
    label.className = "config-radio-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "translator-provider";
    input.value = option.value;
    input.checked = provider === option.value;
    input.addEventListener("change", () => {
      setValueAtPath(state.configDraft.translator, ["provider"], option.value);
      clearConfigErrorsByPrefix("translator:");
      renderConfigEditor();
      renderConfigStatus();
      renderActionState();
    });

    const text = document.createElement("code");
    text.textContent = option.label;

    label.append(input, text);
    group.append(label);
  }

  return group;
}

function buildFieldInput(configKey, field, currentValue) {
  const wrapper = document.createElement("div");
  wrapper.className = "config-field";
  if (field.inputKind === "checkbox") {
    wrapper.classList.add("checkbox-field");
  }
  const errorKey = `${configKey}:${field.id}`;

  const inputId = `${configKey}-${field.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "value"}`;
  if (field.inputKind === "checkbox") {
    const label = document.createElement("label");
    label.className = "config-toggle-option";
    label.setAttribute("for", inputId);

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "checkbox";
    input.checked = Boolean(currentValue);
    input.addEventListener("change", () => {
      setValueAtPath(state.configDraft[configKey], field.path, input.checked);
      clearFieldError(errorKey, input);
      renderConfigStatus();
      renderActionState();
    });

    const text = document.createElement("code");
    text.textContent = field.label;

    label.append(input, text);
    wrapper.append(label);

    if (field.description) {
      const description = document.createElement("p");
      description.className = "config-field-description";
      description.textContent = field.description;
      wrapper.append(description);
    }

    return wrapper;
  }

  const label = document.createElement("label");
  label.className = "config-label";
  label.setAttribute("for", inputId);

  const pathText = document.createElement("code");
  pathText.textContent = field.label;
  label.append(pathText);
  wrapper.append(label);

  const input = createFieldControl(field, inputId, currentValue);
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

  if (field.description) {
    const description = document.createElement("p");
    description.className = "config-field-description";
    description.textContent = field.description;
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
    input.step = "any";
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

function renderActionState() {
  pickFolderButton.disabled = state.busy || !supportsInstallation();
  installButton.disabled = state.busy || !canInstall();
  saveConfigButton.disabled = state.busy || !canSaveConfig();
  resetConfigButton.disabled = state.busy || !hasUnsavedConfigChanges();

  installButton.textContent = state.busyAction === "install" ? "Installing..." : "Install";
  saveConfigButton.textContent = state.busyAction === "save-config" ? "Saving..." : "Save Config";
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
      && state.configErrors.size === 0
      && !getConfigValidationError()
      && hasUnsavedConfigChanges()
      && supportsInstallation(),
  );
}

function hasUnsavedConfigChanges() {
  return Boolean(
    state.loadedConfigs
      && state.configDraft
      && !configDraftsEqual(state.loadedConfigs, state.configDraft),
  );
}

function getSelectedProvider(config) {
  return getValueAtPath(config, ["provider"]) === "deepl" ? "deepl" : "local";
}

function getConfigValidationError() {
  if (!state.configDraft?.translator) {
    return null;
  }

  if (getSelectedProvider(state.configDraft.translator) !== "deepl") {
    return null;
  }

  const apiKey = String(getValueAtPath(state.configDraft.translator, ["settings", "deepl", "apiKey"]) ?? "");
  if (apiKey.includes(DEEPL_APIKEY_PLACEHOLDER_SUBSTRING)) {
    return `DeepL apiKey cannot contain "${DEEPL_APIKEY_PLACEHOLDER_SUBSTRING}".`;
  }

  return null;
}

function hasFieldValidationError(configKey, field) {
  return Boolean(getFieldValidationError(configKey, field));
}

function getFieldValidationError(configKey, field) {
  if (configKey === "translator" && field.id === "settings.deepl.apiKey") {
    return getConfigValidationError();
  }

  return null;
}

function getTextareaRows(value) {
  const text = String(value ?? "");
  if (text.includes("\n")) {
    return Math.min(8, text.split("\n").length + 1);
  }

  return text.length > 160 ? 5 : 3;
}
