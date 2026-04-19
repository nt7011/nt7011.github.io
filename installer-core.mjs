export const LOADER_PLUGIN_NAME = "live-translator-loader";
export const CONFIG_FILE_MAP = Object.freeze({
  settings: "settings.json",
  translator: "translator.json",
});

const CONFIG_FILE_NAMES = new Set(Object.values(CONFIG_FILE_MAP));

export function patchEmptyPackageName(text) {
  if (!/("name"\s*:\s*)""/.test(text)) {
    return { changed: false, text };
  }

  return {
    changed: true,
    text: text.replace(/("name"\s*:\s*)""/, '$1"Game"'),
  };
}

export function injectPluginEntry(text, entry) {
  if (text.includes(LOADER_PLUGIN_NAME)) {
    return { changed: false, alreadyPresent: true, text };
  }

  const updated = text.replace(/\[/, `[${entry}`);
  if (updated === text) {
    return {
      changed: false,
      alreadyPresent: false,
      text,
      warning: "Unable to inject plugin entry into plugins.js automatically.",
    };
  }

  return {
    changed: true,
    alreadyPresent: false,
    text: updated,
  };
}

export async function loadManifest(url = new URL("./installer-manifest.json", import.meta.url)) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load installer manifest: ${response.status}`);
  }

  return response.json();
}

export async function loadInstalledConfigs(rootHandle, manifest) {
  if (!rootHandle) {
    return {
      available: false,
      configs: null,
      supportDirectoryPath: null,
      reason: "Select a game folder to load installed settings.json and translator.json.",
      warnings: [],
    };
  }

  const inspection = await inspectGameDirectory(rootHandle);
  if (!inspection.valid) {
    return {
      available: false,
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
      configs: null,
      supportDirectoryPath,
      reason: `No installed live-translator config found in ${supportDirectoryPath}. Install the plugin first.`,
      warnings: [],
    };
  }

  const configs = {};
  for (const [key, fileName] of Object.entries(CONFIG_FILE_MAP)) {
    const fileHandle = await tryGetFileHandle(supportDirHandle, fileName);
    if (!fileHandle) {
      return {
        available: false,
        configs: null,
        supportDirectoryPath,
        reason: `Installed config is incomplete. Missing ${supportDirectoryPath}/${fileName}.`,
        warnings: [],
      };
    }

    try {
      const data = await readTextFile(fileHandle);
      configs[key] = JSON.parse(data.text);
    } catch (error) {
      return {
        available: false,
        configs: null,
        supportDirectoryPath,
        reason: `Could not parse ${supportDirectoryPath}/${fileName}: ${error.message}.`,
        warnings: [],
      };
    }
  }

  return {
    available: true,
    configs,
    supportDirectoryPath,
    reason: `Editing installed settings.json and translator.json in ${supportDirectoryPath}.`,
    warnings: [],
  };
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

export async function inspectGameDirectory(rootHandle) {
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
      layoutLabel: "Unknown",
      pluginsDirPath: "Missing",
      pluginsFilePath: "Missing",
      packageCandidates,
      reason: "Could not find js/plugins or www/js/plugins in the selected folder.",
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
      reason: `Found ${selectedLayout.pluginsDirPath}, but ${selectedLayout.pluginsFilePath} is missing.`,
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
    reason: "Ready to install.",
  };
}

export async function installGame(rootHandle, manifest, options = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const log = options.log ?? (() => {});
  const inspection = await inspectGameDirectory(rootHandle);
  if (!inspection.valid) {
    throw new Error(inspection.reason);
  }

  const bundle = await fetchInstallerBundle(manifest, baseUrl);
  log(`Detected ${inspection.layoutLabel} folder structure.`, "info");

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
        log(`Found empty name field in ${candidate.path}, setting to "Game".`, "warning");

        const backupFileName = `${candidate.fileName}.backup`;
        const backupHandle = await tryGetFileHandle(candidate.parentHandle, backupFileName);
        if (!backupHandle) {
          const createdBackupHandle = await candidate.parentHandle.getFileHandle(backupFileName, {
            create: true,
          });
          await writeBytes(createdBackupHandle, packageData.bytes);
          log(`Backup created: ${candidate.path}.backup`, "info");
        }

        const patchedPackage = patchEmptyPackageName(packageData.text);
        if (patchedPackage.changed) {
          await writeTextFile(candidate.handle, patchedPackage.text, packageData.hasBom);
          packageUpdates += 1;
          log(`Updated name field to "Game" in ${candidate.path}.`, "success");
        }
      } else if (hasNameProperty && currentName.trim() !== "") {
        log(`${candidate.path} name field is already set to "${currentName}".`, "info");
      } else {
        log(`No empty name field found in ${candidate.path}.`, "info");
      }
    } catch (error) {
      log(`Warning: Could not process ${candidate.path}: ${error.message}`, "warning");
    }
  }

  if (!foundAnyPackage) {
    log("package.json not found. This is normal for some RPG Maker versions.", "warning");
  }

  const loaderHandle = await inspection.pluginsDirHandle.getFileHandle(manifest.loaderFile, {
    create: true,
  });
  await writeBytes(loaderHandle, bundle.loader.bytes);
  log(`Copied ${manifest.loaderFile} into ${inspection.pluginsDirPath}.`, "success");

  const existingSupportDir = await tryGetDirectoryHandle(
    inspection.pluginsDirHandle,
    manifest.supportDirectory,
  );
  const supportDirHandle = existingSupportDir
    ?? (await inspection.pluginsDirHandle.getDirectoryHandle(manifest.supportDirectory, {
      create: true,
    }));

  if (!existingSupportDir) {
    log(`Created plugin support directory at ${inspection.pluginsDirPath}/${manifest.supportDirectory}.`, "info");
  }

  let supportFilesCopied = 0;
  for (const file of bundle.supportFiles) {
    const existingSupportFileHandle = await tryGetFileHandle(supportDirHandle, file.name);
    if (CONFIG_FILE_NAMES.has(file.name) && existingSupportFileHandle) {
      log(`Kept existing ${file.name} in ${inspection.pluginsDirPath}/${manifest.supportDirectory}.`, "info");
      continue;
    }

    const supportFileHandle = existingSupportFileHandle
      ?? (await supportDirHandle.getFileHandle(file.name, { create: true }));
    await writeBytes(supportFileHandle, file.bytes);
    supportFilesCopied += 1;
    log(`Copied ${file.name} into ${inspection.pluginsDirPath}/${manifest.supportDirectory}.`, "success");
  }

  const pluginsData = await readTextFile(inspection.pluginsFileHandle);
  let pluginEntryAdded = false;

  if (pluginsData.text.includes(LOADER_PLUGIN_NAME)) {
    log(`Plugin entry already exists in ${inspection.pluginsFilePath}.`, "warning");
  } else {
    log(`Adding plugin entry to ${inspection.pluginsFilePath}.`, "info");

    const pluginsBackupHandle = await inspection.jsDirHandle.getFileHandle("plugins.js.backup", {
      create: true,
    });
    await writeBytes(pluginsBackupHandle, pluginsData.bytes);
    log(`Backup created: ${inspection.pluginsFilePath}.backup`, "info");

    const updatedPlugins = injectPluginEntry(pluginsData.text, manifest.pluginEntry);
    if (!updatedPlugins.changed) {
      throw new Error(updatedPlugins.warning);
    }

    await writeTextFile(inspection.pluginsFileHandle, updatedPlugins.text, pluginsData.hasBom);
    pluginEntryAdded = true;
    log(`Plugin entry added to ${inspection.pluginsFilePath}.`, "success");
  }

  return {
    packageUpdates,
    pluginEntryAdded,
    filesCopied: 1 + supportFilesCopied,
    supportDirectory: `${inspection.pluginsDirPath}/${manifest.supportDirectory}`,
  };
}

export async function saveInstalledConfigs(rootHandle, manifest, configs) {
  const inspection = await inspectGameDirectory(rootHandle);
  if (!inspection.valid) {
    throw new Error(inspection.reason);
  }

  const supportDirectoryPath = `${inspection.pluginsDirPath}/${manifest.supportDirectory}`;
  const supportDirHandle = await tryGetDirectoryHandle(
    inspection.pluginsDirHandle,
    manifest.supportDirectory,
  );
  if (!supportDirHandle) {
    throw new Error(`No installed live-translator config found in ${supportDirectoryPath}. Install the plugin first.`);
  }

  for (const [key, fileName] of Object.entries(CONFIG_FILE_MAP)) {
    const fileHandle = await tryGetFileHandle(supportDirHandle, fileName);
    if (!fileHandle) {
      throw new Error(`Installed config is incomplete. Missing ${supportDirectoryPath}/${fileName}.`);
    }

    const existingData = await readTextFile(fileHandle);
    await writeTextFile(fileHandle, serializeConfigFile(configs[key]), existingData.hasBom);
  }

  return {
    savedFiles: [...CONFIG_FILE_NAMES],
    supportDirectory: supportDirectoryPath,
  };
}

async function fetchInstallerBundle(manifest, baseUrl) {
  const bundleDirectory = manifest.bundleDirectory.replace(/\/+$/, "");
  const loader = {
    name: manifest.loaderFile,
    bytes: await fetchAssetBytes(new URL(`${bundleDirectory}/${manifest.loaderFile}`, baseUrl)),
  };

  const supportFiles = await Promise.all(
    manifest.supportFiles.map(async (name) => ({
      name,
      bytes: await fetchAssetBytes(new URL(`${bundleDirectory}/${name}`, baseUrl)),
    })),
  );

  return { loader, supportFiles };
}

async function fetchAssetBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load installer asset ${url.pathname}: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
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
