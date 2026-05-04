import { createTranslator } from "./i18n.mjs";

export const LOADER_PLUGIN_NAME = "live-translator-loader";
export const VERSION_FILE_NAME = "version.json";
export const INSTALL_MANIFEST_URL = new URL(
  "./live-translator-installer/install-manifest.json",
  import.meta.url,
);
export const INSTALL_VERSION_URL = new URL(
  `./live-translator-installer/${VERSION_FILE_NAME}`,
  import.meta.url,
);
export const PUBLISHED_VERSION_URL = new URL(
  "./info/translator-version.json",
  import.meta.url,
);
export const PUBLISHED_VERSION_UNAVAILABLE = "server_latest_version_unavailable";
export const CONFIG_FILE_MAP = Object.freeze({
  settings: "settings.json",
  translator: "translator.json",
});

const CONFIG_FILE_NAMES = new Set(Object.values(CONFIG_FILE_MAP));
const DEFAULT_PLUGIN_ENTRY = "{\"name\":\"live-translator-loader\",\"status\":true,\"description\":\"Entry point for the live translation system\",\"parameters\":{}},";
const DEFAULT_T = createTranslator("en");

export function patchEmptyPackageName(text) {
  if (!/("name"\s*:\s*)""/.test(text)) {
    return { changed: false, text };
  }

  return {
    changed: true,
    text: text.replace(/("name"\s*:\s*)""/, '$1"Game"'),
  };
}

export function injectPluginEntry(text, entry, warningMessage = "Unable to inject plugin entry into plugins.js automatically.") {
  if (text.includes(LOADER_PLUGIN_NAME)) {
    return { changed: false, alreadyPresent: true, text };
  }

  const updated = text.replace(/\[/, `[${entry}`);
  if (updated === text) {
    return {
      changed: false,
      alreadyPresent: false,
      text,
      warning: warningMessage,
    };
  }

  return {
    changed: true,
    alreadyPresent: false,
    text: updated,
  };
}

export async function loadManifest(url = INSTALL_MANIFEST_URL, options = {}) {
  const t = getTranslator(options);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(t("core.loadManifestFailed", { status: response.status }));
  }

  return normalizeInstallManifest(await response.json(), url);
}

function normalizeInstallManifest(manifest, manifestUrl) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("install-manifest.json is invalid.");
  }

  const install = manifest.install && typeof manifest.install === "object"
    ? manifest.install
    : {};
  const runtime = manifest.runtime && typeof manifest.runtime === "object"
    ? manifest.runtime
    : {};
  const settings = install.settings && typeof install.settings === "object"
    ? install.settings
    : {};

  return {
    ...manifest,
    loader: normalizeSupportFilePath(manifest.loader),
    loaderFile: normalizeSupportFilePath(manifest.loader),
    supportDirectory: normalizeSupportDirectoryName(manifest.supportDirectory),
    pluginEntry: manifest.pluginEntry ?? DEFAULT_PLUGIN_ENTRY,
    bundleUrl: new URL("./", manifestUrl).href,
    install: {
      ...install,
      files: normalizeSupportFileList(install.files),
      obsolete: normalizeSupportFileList(install.obsolete ?? []),
      settings: {
        developmentSource: normalizeSupportFilePath(settings.developmentSource),
        releaseSource: normalizeSupportFilePath(settings.releaseSource),
        destination: normalizeSupportFilePath(settings.destination),
      },
    },
    runtime: {
      ...runtime,
      requiredAssets: normalizeSupportFileList(runtime.requiredAssets ?? []),
      optionalAssets: normalizeSupportFileList(runtime.optionalAssets ?? []),
      loaderHelpers: normalizeSupportFileList(runtime.loaderHelpers ?? []),
      scriptLoadOrder: normalizeSupportFileList(runtime.scriptLoadOrder ?? []),
    },
  };
}

export async function loadVersionInfo(url = INSTALL_VERSION_URL) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const version = typeof data?.version === "string"
      ? data.version.trim()
      : "";

    return version || null;
  } catch {
    return null;
  }
}

export async function loadPublishedVersionInfo(url = PUBLISHED_VERSION_URL, options = {}) {
  const versionUrl = new URL(url);
  versionUrl.searchParams.set(
    options.cacheBustParam ?? "installCheck",
    String(options.cacheBustValue ?? Date.now()),
  );

  const version = await loadVersionInfo(versionUrl);
  return version === PUBLISHED_VERSION_UNAVAILABLE ? null : version;
}

export function getInstallVersionMismatch(installableVersion, publishedVersion) {
  const published = normalizeVersion(publishedVersion);
  if (!published) {
    return null;
  }

  const installable = normalizeVersion(installableVersion);
  if (installable === published) {
    return null;
  }

  return {
    installableVersion: installable,
    publishedVersion: published,
  };
}

export async function loadInstalledConfigs(rootHandle, manifest, options = {}) {
  const t = getTranslator(options);
  if (!rootHandle) {
    return {
      available: false,
      editable: false,
      installed: false,
      installedVersionChecked: false,
      installedVersion: null,
      missingFields: [],
      requiresReinstall: false,
      configs: null,
      supportDirectoryPath: null,
      reason: t("core.selectFolderToLoadConfigs"),
      warnings: [],
    };
  }

  const inspection = await inspectGameDirectory(rootHandle, { t });
  if (!inspection.valid) {
    return {
      available: false,
      editable: false,
      installed: false,
      installedVersionChecked: false,
      installedVersion: null,
      missingFields: [],
      requiresReinstall: false,
      configs: null,
      supportDirectoryPath: null,
      reason: inspection.reason,
      warnings: [],
    };
  }

  const supportDirectoryPath = `${inspection.pluginsDirPath}/${manifest.supportDirectory}`;
  const supportDirHandle = await tryGetDirectoryHandle(
    inspection.pluginsDirHandle,
    manifest.supportDirectory,
  );
  if (!supportDirHandle) {
    return {
      available: false,
      editable: false,
      installed: false,
      installedVersionChecked: false,
      installedVersion: null,
      missingFields: [],
      requiresReinstall: false,
      configs: null,
      supportDirectoryPath,
      reason: t("core.noInstalledConfig", { path: supportDirectoryPath }),
      warnings: [],
    };
  }

  const versionInfo = await loadInstalledVersionInfo(
    supportDirHandle,
    `${supportDirectoryPath}/${VERSION_FILE_NAME}`,
    t,
  );
  const baseSnapshot = {
    installedVersionChecked: true,
    installedVersion: versionInfo.version,
  };
  const warnings = [...versionInfo.warnings];

  const configs = {};
  for (const [key, fileName] of Object.entries(CONFIG_FILE_MAP)) {
    const fileHandle = await tryGetFileHandle(supportDirHandle, fileName);
    if (!fileHandle) {
      return {
        available: false,
        editable: false,
        installed: true,
        ...baseSnapshot,
        missingFields: [],
        requiresReinstall: false,
        configs: null,
        supportDirectoryPath,
        reason: t("core.installedConfigIncomplete", { path: `${supportDirectoryPath}/${fileName}` }),
        warnings,
      };
    }

    try {
      const data = await readTextFile(fileHandle);
      configs[key] = JSON.parse(data.text);
    } catch (error) {
      return {
        available: false,
        editable: false,
        installed: true,
        ...baseSnapshot,
        missingFields: [],
        requiresReinstall: false,
        configs: null,
        supportDirectoryPath,
        reason: t("core.couldNotParseConfig", {
          path: `${supportDirectoryPath}/${fileName}`,
          message: error.message,
        }),
        warnings,
      };
    }
  }

  const defaultConfigs = await loadBundledDefaultConfigs(manifest, options);
  const missingFields = getMissingConfigFields(defaultConfigs, configs);
  if (missingFields.length > 0) {
    return {
      available: true,
      editable: false,
      installed: true,
      ...baseSnapshot,
      missingFields,
      requiresReinstall: true,
      configs,
      supportDirectoryPath,
      reason: t("core.installedConfigMissingFields", {
        fields: missingFields.join(", "),
      }),
      warnings,
    };
  }

  return {
    available: true,
    editable: true,
    installed: true,
    ...baseSnapshot,
    missingFields: [],
    requiresReinstall: false,
    configs,
    supportDirectoryPath,
    reason: t("core.editingInstalledConfigs", { path: supportDirectoryPath }),
    warnings,
  };
}

export function isVersionOutdated(installedVersion, installableVersion) {
  const installable = normalizeVersion(installableVersion);
  if (!installable) {
    return false;
  }

  return normalizeVersion(installedVersion) !== installable;
}

export async function ensureReadWritePermission(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) {
    return true;
  }

  const options = { mode: "readwrite" };
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }

  return (await handle.requestPermission(options)) === "granted";
}

export async function inspectGameDirectory(rootHandle, options = {}) {
  const t = getTranslator(options);
  const packageCandidates = [];
  const rootPackageHandle = await tryGetFileHandle(rootHandle, "package.json");
  packageCandidates.push({
    path: "package.json",
    fileName: "package.json",
    parentHandle: rootHandle,
    handle: rootPackageHandle,
    exists: Boolean(rootPackageHandle),
  });

  const wwwHandle = await tryGetDirectoryHandle(rootHandle, "www");
  if (wwwHandle) {
    const wwwPackageHandle = await tryGetFileHandle(wwwHandle, "package.json");
    packageCandidates.push({
      path: "www/package.json",
      fileName: "package.json",
      parentHandle: wwwHandle,
      handle: wwwPackageHandle,
      exists: Boolean(wwwPackageHandle),
    });
  } else {
    packageCandidates.push({
      path: "www/package.json",
      fileName: "package.json",
      parentHandle: null,
      handle: null,
      exists: false,
    });
  }

  const candidates = [];
  if (wwwHandle) {
    const wwwJsHandle = await tryGetDirectoryHandle(wwwHandle, "js");
    const wwwPluginsDirHandle = wwwJsHandle
      ? await tryGetDirectoryHandle(wwwJsHandle, "plugins")
      : null;

    if (wwwPluginsDirHandle) {
      candidates.push({
        layoutLabel: "www/js/plugins",
        pluginsDirPath: "www/js/plugins",
        pluginsFilePath: "www/js/plugins.js",
        jsDirHandle: wwwJsHandle,
        pluginsDirHandle: wwwPluginsDirHandle,
        pluginsFileHandle: wwwJsHandle
          ? await tryGetFileHandle(wwwJsHandle, "plugins.js")
          : null,
      });
    }
  }

  const jsHandle = await tryGetDirectoryHandle(rootHandle, "js");
  const rootPluginsDirHandle = jsHandle ? await tryGetDirectoryHandle(jsHandle, "plugins") : null;
  if (rootPluginsDirHandle) {
    candidates.push({
      layoutLabel: "js/plugins",
      pluginsDirPath: "js/plugins",
      pluginsFilePath: "js/plugins.js",
      jsDirHandle: jsHandle,
      pluginsDirHandle: rootPluginsDirHandle,
      pluginsFileHandle: jsHandle ? await tryGetFileHandle(jsHandle, "plugins.js") : null,
    });
  }

  const selectedLayout = candidates[0] ?? null;
  if (!selectedLayout) {
    return {
      valid: false,
      rootName: rootHandle.name,
      layoutLabel: t("folder.unknown"),
      pluginsDirPath: t("folder.missing"),
      pluginsFilePath: t("folder.missing"),
      packageCandidates,
      reason: t("core.couldNotFindPlugins"),
    };
  }

  if (!selectedLayout.pluginsFileHandle) {
    return {
      valid: false,
      rootName: rootHandle.name,
      layoutLabel: selectedLayout.layoutLabel,
      pluginsDirPath: selectedLayout.pluginsDirPath,
      pluginsFilePath: selectedLayout.pluginsFilePath,
      packageCandidates,
      reason: t("core.foundPluginsButMissingFile", {
        pluginsDirPath: selectedLayout.pluginsDirPath,
        pluginsFilePath: selectedLayout.pluginsFilePath,
      }),
    };
  }

  return {
    valid: true,
    rootName: rootHandle.name,
    layoutLabel: selectedLayout.layoutLabel,
    pluginsDirPath: selectedLayout.pluginsDirPath,
    pluginsFilePath: selectedLayout.pluginsFilePath,
    packageCandidates,
    jsDirHandle: selectedLayout.jsDirHandle,
    pluginsDirHandle: selectedLayout.pluginsDirHandle,
    pluginsFileHandle: selectedLayout.pluginsFileHandle,
    reason: t("core.readyToInstall"),
  };
}

export async function installGame(rootHandle, manifest, options = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const log = options.log ?? (() => {});
  const overwriteExistingConfigs = options.overwriteExistingConfigs ?? false;
  const t = getTranslator(options);
  const inspection = await inspectGameDirectory(rootHandle, { t });
  if (!inspection.valid) {
    throw new Error(inspection.reason);
  }

  const bundle = await fetchInstallerBundle(manifest, baseUrl, t);
  log(t("core.detectedFolderStructure", { layout: inspection.layoutLabel }), "info");

  let foundAnyPackage = false;
  let packageUpdates = 0;
  for (const candidate of inspection.packageCandidates) {
    if (!candidate.exists || !candidate.handle || !candidate.parentHandle) {
      continue;
    }

    foundAnyPackage = true;

    try {
      const packageData = await readTextFile(candidate.handle);
      const packageJson = JSON.parse(packageData.text);
      const hasNameProperty = Object.prototype.hasOwnProperty.call(packageJson, "name");
      const currentName = hasNameProperty ? String(packageJson.name ?? "") : null;

      if (hasNameProperty && currentName !== null && currentName.trim() === "") {
        log(t("core.foundEmptyName", { path: candidate.path }), "warning");

        const backupFileName = `${candidate.fileName}.backup`;
        const backupHandle = await tryGetFileHandle(candidate.parentHandle, backupFileName);
        if (!backupHandle) {
          const createdBackupHandle = await candidate.parentHandle.getFileHandle(backupFileName, {
            create: true,
          });
          await writeBytes(createdBackupHandle, packageData.bytes);
          log(t("core.backupCreated", { path: `${candidate.path}.backup` }), "info");
        }

        const patchedPackage = patchEmptyPackageName(packageData.text);
        if (patchedPackage.changed) {
          await writeTextFile(candidate.handle, patchedPackage.text, packageData.hasBom);
          packageUpdates += 1;
          log(t("core.updatedName", { path: candidate.path }), "success");
        }
      } else if (hasNameProperty && currentName.trim() !== "") {
        log(t("core.nameAlreadySet", {
          path: candidate.path,
          name: currentName,
        }), "info");
      } else {
        log(t("core.noEmptyName", { path: candidate.path }), "info");
      }
    } catch (error) {
      log(t("core.couldNotProcessPackage", {
        path: candidate.path,
        message: error.message,
      }), "warning");
    }
  }

  if (!foundAnyPackage) {
    log(t("core.packageJsonNotFound"), "warning");
  }

  const loaderHandle = await inspection.pluginsDirHandle.getFileHandle(manifest.loaderFile, {
    create: true,
  });
  await writeBytes(loaderHandle, bundle.loader.bytes);
  log(t("core.copiedLoader", {
    fileName: manifest.loaderFile,
    path: inspection.pluginsDirPath,
  }), "success");

  const existingSupportDir = await tryGetDirectoryHandle(
    inspection.pluginsDirHandle,
    manifest.supportDirectory,
  );
  const supportDirHandle = existingSupportDir
    ?? (await inspection.pluginsDirHandle.getDirectoryHandle(manifest.supportDirectory, {
      create: true,
    }));

  if (!existingSupportDir) {
    log(t("core.createdSupportDirectory", {
      path: `${inspection.pluginsDirPath}/${manifest.supportDirectory}`,
    }), "info");
  }

  let supportFilesCopied = 0;
  for (const file of bundle.supportFiles) {
    supportFilesCopied += await writeSupportBundleFile(supportDirHandle, file, {
      log,
      overwriteExistingConfigs,
      supportDirectoryPath: `${inspection.pluginsDirPath}/${manifest.supportDirectory}`,
      t,
    });
  }

  supportFilesCopied += await writeSupportBundleFile(supportDirHandle, bundle.settings, {
    log,
    overwriteExistingConfigs,
    supportDirectoryPath: `${inspection.pluginsDirPath}/${manifest.supportDirectory}`,
    t,
  });

  await removeObsoleteSupportPaths(supportDirHandle, manifest, {
    log,
    supportDirectoryPath: `${inspection.pluginsDirPath}/${manifest.supportDirectory}`,
    t,
  });

  let versionFilesCopied = 0;
  if (bundle.version) {
    const versionFileHandle = await supportDirHandle.getFileHandle(bundle.version.name, {
      create: true,
    });
    await writeBytes(versionFileHandle, bundle.version.bytes);
    versionFilesCopied = 1;
    log(t("core.copiedVersionFile", {
      fileName: bundle.version.name,
      path: `${inspection.pluginsDirPath}/${manifest.supportDirectory}`,
    }), "success");
  }

  const pluginsData = await readTextFile(inspection.pluginsFileHandle);
  let pluginEntryAdded = false;

  if (pluginsData.text.includes(LOADER_PLUGIN_NAME)) {
    log(t("core.pluginEntryAlreadyExists", { path: inspection.pluginsFilePath }), "info");
  } else {
    log(t("core.addingPluginEntry", { path: inspection.pluginsFilePath }), "info");

    const pluginsBackupHandle = await inspection.jsDirHandle.getFileHandle("plugins.js.backup", {
      create: true,
    });
    await writeBytes(pluginsBackupHandle, pluginsData.bytes);
    log(t("core.backupCreated", { path: `${inspection.pluginsFilePath}.backup` }), "info");

    const updatedPlugins = injectPluginEntry(
      pluginsData.text,
      manifest.pluginEntry,
      t("core.injectPluginEntryFailure"),
    );
    if (!updatedPlugins.changed) {
      throw new Error(updatedPlugins.warning);
    }

    await writeTextFile(inspection.pluginsFileHandle, updatedPlugins.text, pluginsData.hasBom);
    pluginEntryAdded = true;
    log(t("core.pluginEntryAdded", { path: inspection.pluginsFilePath }), "success");
  }

  return {
    packageUpdates,
    pluginEntryAdded,
    filesCopied: 1 + versionFilesCopied + supportFilesCopied,
    supportDirectory: `${inspection.pluginsDirPath}/${manifest.supportDirectory}`,
  };
}

export async function saveInstalledConfigs(rootHandle, manifest, configs, options = {}) {
  const t = getTranslator(options);
  const inspection = await inspectGameDirectory(rootHandle, { t });
  if (!inspection.valid) {
    throw new Error(inspection.reason);
  }

  const supportDirectoryPath = `${inspection.pluginsDirPath}/${manifest.supportDirectory}`;
  const supportDirHandle = await tryGetDirectoryHandle(
    inspection.pluginsDirHandle,
    manifest.supportDirectory,
  );
  if (!supportDirHandle) {
    throw new Error(t("core.noInstalledConfig", { path: supportDirectoryPath }));
  }

  for (const [key, fileName] of Object.entries(CONFIG_FILE_MAP)) {
    const fileHandle = await tryGetFileHandle(supportDirHandle, fileName);
    if (!fileHandle) {
      throw new Error(t("core.installedConfigIncomplete", {
        path: `${supportDirectoryPath}/${fileName}`,
      }));
    }

    const existingData = await readTextFile(fileHandle);
    await writeTextFile(fileHandle, serializeConfigFile(configs[key]), existingData.hasBom);
  }

  return {
    savedFiles: [...CONFIG_FILE_NAMES],
    supportDirectory: supportDirectoryPath,
  };
}

async function writeSupportBundleFile(supportDirHandle, file, options = {}) {
  const {
    log = () => {},
    overwriteExistingConfigs = false,
    supportDirectoryPath,
    t,
  } = options;
  const existingSupportFileHandle = await tryGetFileHandleAtPath(supportDirHandle, file.name);
  const rootConfigFile = isRootConfigFile(file.name);
  const replacingExistingConfig = Boolean(
    existingSupportFileHandle
      && rootConfigFile
      && overwriteExistingConfigs,
  );

  if (rootConfigFile && existingSupportFileHandle && !replacingExistingConfig) {
    log(t("core.keptExistingSupportFile", {
      fileName: file.name,
      path: supportDirectoryPath,
    }), "info");
    return 0;
  }

  const supportFileHandle = existingSupportFileHandle
    ?? (await getFileHandleAtPath(supportDirHandle, file.name, { create: true }));
  await writeBytes(supportFileHandle, file.bytes);
  log(t(replacingExistingConfig ? "core.replacedSupportFile" : "core.copiedSupportFile", {
    fileName: file.name,
    path: supportDirectoryPath,
  }), "success");
  return 1;
}

async function removeObsoleteSupportPaths(supportDirHandle, manifest, options = {}) {
  const {
    log = () => {},
    supportDirectoryPath,
    t,
  } = options;
  const obsoletePaths = manifest.install?.obsolete ?? [];
  const protectedPaths = new Set(manifest.runtime?.optionalAssets ?? []);

  for (const obsoletePath of obsoletePaths) {
    if (isProtectedSupportPath(obsoletePath, protectedPaths)) {
      log(t("core.skippedProtectedObsoletePath", {
        fileName: obsoletePath,
        path: supportDirectoryPath,
      }), "info");
      continue;
    }

    const removed = await removeEntryAtPath(supportDirHandle, obsoletePath);
    if (removed) {
      log(t("core.removedObsoleteSupportPath", {
        fileName: obsoletePath,
        path: supportDirectoryPath,
      }), "success");
    }
  }
}

async function fetchInstallerBundle(manifest, baseUrl, t) {
  const bundleUrl = getBundleUrl(manifest, baseUrl);
  const loader = {
    name: manifest.loaderFile,
    bytes: await fetchAssetBytes(new URL(manifest.loaderFile, bundleUrl), t),
  };
  const versionBytes = await fetchOptionalAssetBytes(new URL(VERSION_FILE_NAME, bundleUrl));
  const version = versionBytes
    ? {
        name: VERSION_FILE_NAME,
        bytes: versionBytes,
      }
    : null;

  const supportFiles = await Promise.all(
    manifest.install.files.map(async (name) => {
      const normalizedName = normalizeSupportFilePath(name);
      return {
        name: normalizedName,
        bytes: await fetchAssetBytes(new URL(normalizedName, bundleUrl), t),
      };
    }),
  );
  const settings = await fetchSettingsBundleFile(manifest, bundleUrl, t);

  return { loader, settings, supportFiles, version };
}

async function loadBundledDefaultConfigs(manifest, options = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const t = getTranslator(options);
  const bundleUrl = getBundleUrl(manifest, baseUrl);
  const defaults = {};

  for (const [configKey, fileName] of Object.entries(CONFIG_FILE_MAP)) {
    const text = configKey === "settings"
      ? await fetchSettingsBundleText(manifest, bundleUrl, t)
      : await fetchAssetText(new URL(fileName, bundleUrl), t);

    defaults[configKey] = JSON.parse(text);
  }

  return defaults;
}

async function loadInstalledVersionInfo(supportDirHandle, versionPath, t) {
  const versionHandle = await tryGetFileHandle(supportDirHandle, VERSION_FILE_NAME);
  if (!versionHandle) {
    return {
      version: null,
      warnings: [],
    };
  }

  try {
    const data = await readTextFile(versionHandle);
    const parsed = JSON.parse(data.text);
    const version = normalizeVersion(parsed?.version);

    return {
      version,
      warnings: [],
    };
  } catch (error) {
    return {
      version: null,
      warnings: [t("core.couldNotParseVersion", {
        path: versionPath,
        message: error.message,
      })],
    };
  }
}

async function fetchAssetBytes(url, t) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(t("core.fetchAssetFailed", {
      path: url.pathname,
      status: response.status,
    }));
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function fetchOptionalAssetBytes(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchAssetText(url, t) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(t("core.fetchAssetFailed", {
      path: url.pathname,
      status: response.status,
    }));
  }

  return response.text();
}

async function fetchSettingsBundleFile(manifest, bundleUrl, t) {
  const settings = manifest.install.settings;
  const source = await fetchSettingsSource(settings, bundleUrl, t);

  return {
    name: settings.destination,
    bytes: source.bytes,
  };
}

async function fetchSettingsBundleText(manifest, bundleUrl, t) {
  const source = await fetchSettingsSource(manifest.install.settings, bundleUrl, t);
  return source.text;
}

async function fetchSettingsSource(settings, bundleUrl, t) {
  const developmentUrl = new URL(settings.developmentSource, bundleUrl);
  const developmentResponse = await fetch(developmentUrl, { cache: "no-store" });
  if (developmentResponse.ok) {
    const bytes = new Uint8Array(await developmentResponse.arrayBuffer());
    return {
      bytes,
      text: decodeTextBytes(bytes),
    };
  }

  const releaseUrl = new URL(settings.releaseSource, bundleUrl);
  const releaseResponse = await fetch(releaseUrl, { cache: "no-store" });
  if (!releaseResponse.ok) {
    throw new Error(t("core.fetchAssetFailed", {
      path: releaseUrl.pathname,
      status: releaseResponse.status,
    }));
  }

  const bytes = new Uint8Array(await releaseResponse.arrayBuffer());
  return {
    bytes,
    text: decodeTextBytes(bytes),
  };
}

function getBundleUrl(manifest, baseUrl) {
  if (manifest.bundleUrl) {
    return new URL(manifest.bundleUrl);
  }

  return new URL("./live-translator-installer/", baseUrl);
}

async function readTextFile(fileHandle) {
  const file = await fileHandle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const decoder = new TextDecoder("utf-8");
  let text = decoder.decode(bytes);
  if (hasBom && text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  return { bytes, text, hasBom };
}

function decodeTextBytes(bytes) {
  const decoder = new TextDecoder("utf-8");
  let text = decoder.decode(bytes);
  if (bytes.length >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf
    && text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  return text;
}

async function writeTextFile(fileHandle, text, hasBom) {
  const encodedText = encodeTextBytes(text);
  const bytes = hasBom
    ? prependUtf8Bom(encodedText)
    : encodedText;

  await writeBytes(fileHandle, bytes);
}

async function writeBytes(fileHandle, bytes) {
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function prependUtf8Bom(bytes) {
  const output = new Uint8Array(bytes.length + 3);
  output.set([0xef, 0xbb, 0xbf], 0);
  output.set(bytes, 3);
  return output;
}

function encodeTextBytes(text) {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

function serializeConfigFile(config) {
  return `${JSON.stringify(config, null, 4)}\n`;
}

function normalizeVersion(version) {
  return typeof version === "string" ? version.trim() || null : null;
}

export function getMissingConfigFields(defaultConfigs, installedConfigs) {
  const missingFields = [];

  for (const [configKey, fileName] of Object.entries(CONFIG_FILE_MAP)) {
    if (!Object.prototype.hasOwnProperty.call(defaultConfigs ?? {}, configKey)) {
      continue;
    }

    const configMissingPaths = collectMissingConfigPaths(
      defaultConfigs[configKey],
      installedConfigs?.[configKey],
      [],
    );

    for (const missingPath of configMissingPaths) {
      missingFields.push(`${fileName}:${formatConfigPath(missingPath)}`);
    }
  }

  return missingFields;
}

function getTranslator(options = {}) {
  return typeof options.t === "function" ? options.t : DEFAULT_T;
}

function collectMissingConfigPaths(template, actual, path) {
  if (!isPlainObject(template)) {
    return typeof actual === "undefined" ? [path] : [];
  }

  const actualObject = isPlainObject(actual) ? actual : {};
  const missingPaths = [];

  for (const [key, value] of Object.entries(template)) {
    if (!Object.prototype.hasOwnProperty.call(actualObject, key)) {
      missingPaths.push(...expandLeafPaths(value, [...path, key]));
      continue;
    }

    missingPaths.push(...collectMissingConfigPaths(value, actualObject[key], [...path, key]));
  }

  return missingPaths;
}

function expandLeafPaths(template, path) {
  if (!isPlainObject(template)) {
    return [path];
  }

  return Object.entries(template).flatMap(([key, value]) => (
    expandLeafPaths(value, [...path, key])
  ));
}

function formatConfigPath(path) {
  return path.reduce((label, segment) => (
    typeof segment === "number"
      ? `${label}[${segment}]`
      : label
        ? `${label}.${segment}`
        : segment
  ), "");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function tryGetDirectoryHandle(parentHandle, name) {
  try {
    return await parentHandle.getDirectoryHandle(name);
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return null;
    }
    throw error;
  }
}

async function tryGetFileHandle(parentHandle, name) {
  try {
    return await parentHandle.getFileHandle(name);
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return null;
    }
    throw error;
  }
}

async function tryGetFileHandleAtPath(parentHandle, filePath) {
  const segments = getSupportPathSegments(filePath);
  let directoryHandle = parentHandle;

  for (const directoryName of segments.slice(0, -1)) {
    directoryHandle = await tryGetDirectoryHandle(directoryHandle, directoryName);
    if (!directoryHandle) {
      return null;
    }
  }

  return tryGetFileHandle(directoryHandle, segments[segments.length - 1]);
}

async function removeEntryAtPath(parentHandle, filePath) {
  const segments = getSupportPathSegments(filePath);
  let directoryHandle = parentHandle;

  for (const directoryName of segments.slice(0, -1)) {
    directoryHandle = await tryGetDirectoryHandle(directoryHandle, directoryName);
    if (!directoryHandle) {
      return false;
    }
  }

  try {
    await directoryHandle.removeEntry(segments[segments.length - 1], { recursive: true });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

async function getFileHandleAtPath(parentHandle, filePath, options = {}) {
  const segments = getSupportPathSegments(filePath);
  let directoryHandle = parentHandle;

  for (const directoryName of segments.slice(0, -1)) {
    directoryHandle = await directoryHandle.getDirectoryHandle(
      directoryName,
      options.create ? { create: true } : {},
    );
  }

  return directoryHandle.getFileHandle(segments[segments.length - 1], options);
}

function isRootConfigFile(filePath) {
  return !/[\\/]/.test(filePath) && CONFIG_FILE_NAMES.has(filePath);
}

function isProtectedSupportPath(filePath, protectedPaths) {
  for (const protectedPath of protectedPaths) {
    if (protectedPath === filePath || protectedPath.startsWith(`${filePath}/`)) {
      return true;
    }
  }

  return false;
}

function getSupportPathSegments(filePath) {
  return normalizeSupportFilePath(filePath).split("/");
}

function normalizeSupportFileList(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }

  return paths.map((filePath) => normalizeSupportFilePath(filePath));
}

function normalizeSupportDirectoryName(name) {
  const normalized = normalizeSupportFilePath(name);
  if (/[\\/]/.test(normalized)) {
    throw new Error(`Invalid support directory in install manifest: ${name}`);
  }

  return normalized;
}

function normalizeSupportFilePath(filePath) {
  const normalizedPath = String(filePath ?? "").trim().replace(/\\/g, "/");
  const segments = normalizedPath.split("/");

  if (
    !normalizedPath
      || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid support file path in installer manifest: ${filePath}`);
  }

  return segments.join("/");
}
