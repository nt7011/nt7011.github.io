export const DEFAULT_HASH_CATALOG_URL = new URL("./nwjs-dll-hashes.json", import.meta.url);

const DLL_FILE_PATTERN = /\.dll$/i;
const SHA_256_ALGORITHM = "SHA-256";
const SHA_256_KEY = "sha256";

export async function loadNwjsDllHashCatalog(
  url = DEFAULT_HASH_CATALOG_URL,
  options = {},
) {
  const response = await fetch(url, {
    cache: options.cache ?? "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load NW.js DLL hash catalog: ${response.status}`);
  }

  return normalizeHashCatalog(await response.json());
}

export function normalizeHashCatalog(catalog) {
  const entries = Array.isArray(catalog?.hashes) ? catalog.hashes : [];
  const hashMap = new Map();

  for (const entry of entries) {
    const hash = normalizeHash(entry?.hash);
    if (!hash) {
      continue;
    }

    const files = Array.isArray(entry.files)
      ? entry.files
          .map(normalizeCatalogFile)
          .filter(Boolean)
      : [];

    hashMap.set(hash, {
      hash,
      files,
    });
  }

  return {
    schemaVersion: catalog?.schemaVersion ?? 1,
    source: String(catalog?.source ?? ""),
    generatedAt: String(catalog?.generatedAt ?? ""),
    startVersion: typeof catalog?.startVersion === "string" ? catalog.startVersion : "",
    latestVersion: typeof catalog?.latestVersion === "string" ? catalog.latestVersion : "",
    releaseCount: Number.isInteger(catalog?.releaseCount) ? catalog.releaseCount : 0,
    fileReferenceCount: Number.isInteger(catalog?.fileReferenceCount)
      ? catalog.fileReferenceCount
      : entries.reduce((count, entry) => (
          count + (Array.isArray(entry?.files) ? entry.files.length : 0)
        ), 0),
    includedReleases: Array.isArray(catalog?.includedReleases)
      ? catalog.includedReleases.filter((release) => typeof release === "string")
      : [],
    skipped: Array.isArray(catalog?.skipped) ? catalog.skipped : [],
    algorithm: SHA_256_KEY,
    hashCount: hashMap.size,
    fileCount: entries.reduce((count, entry) => (
      count + (Array.isArray(entry?.files) ? entry.files.length : 0)
    ), 0),
    hashes: hashMap,
  };
}

export async function scanDirectoryDlls(rootHandle, catalog, options = {}) {
  if (!rootHandle) {
    throw new TypeError("A directory handle is required.");
  }

  const hashCatalog = catalog?.hashes instanceof Map
    ? catalog
    : normalizeHashCatalog(catalog);
  const onProgress = typeof options.onProgress === "function"
    ? options.onProgress
    : null;
  const entries = [];

  for await (const fileEntry of walkFiles(rootHandle)) {
    if (!DLL_FILE_PATTERN.test(fileEntry.name)) {
      continue;
    }

    const scanEntry = await scanDllFile(fileEntry, hashCatalog);
    entries.push(scanEntry);
    onProgress?.({
      scanned: entries.length,
      entry: scanEntry,
    });
  }

  const allowedCount = entries.filter((entry) => entry.status === "allowed").length;
  const unknownCount = entries.filter((entry) => entry.status === "unknown").length;
  const unreadableCount = entries.filter((entry) => entry.status === "error").length;

  return {
    dllCount: entries.length,
    allowedCount,
    unknownCount,
    unreadableCount,
    entries,
  };
}

async function scanDllFile(fileEntry, catalog) {
  try {
    const file = await fileEntry.handle.getFile();
    const hash = await hashFile(file);
    const match = catalog.hashes.get(hash);

    return {
      path: fileEntry.path,
      fileName: fileEntry.name,
      status: match ? "allowed" : "unknown",
      hash,
      matches: match?.files ?? [],
    };
  } catch (error) {
    return {
      path: fileEntry.path,
      fileName: fileEntry.name,
      status: "error",
      hash: null,
      matches: [],
      errorMessage: error?.message ?? String(error),
    };
  }
}

async function hashFile(file) {
  const digest = await globalThis.crypto.subtle.digest(
    SHA_256_ALGORITHM,
    await file.arrayBuffer(),
  );

  return bytesToHex(new Uint8Array(digest));
}

async function* walkFiles(directoryHandle, basePath = "") {
  for await (const [name, handle] of getDirectoryEntries(directoryHandle)) {
    const path = basePath ? `${basePath}/${name}` : name;

    if (isDirectoryHandle(handle)) {
      yield* walkFiles(handle, path);
      continue;
    }

    if (isFileHandle(handle)) {
      yield {
        name,
        path,
        handle,
      };
    }
  }
}

async function* getDirectoryEntries(directoryHandle) {
  if (typeof directoryHandle.entries === "function") {
    yield* directoryHandle.entries();
    return;
  }

  if (typeof directoryHandle.values === "function") {
    for await (const handle of directoryHandle.values()) {
      yield [handle.name, handle];
    }
    return;
  }

  throw new TypeError("Directory handle does not expose iterable entries.");
}

function isDirectoryHandle(handle) {
  return handle?.kind === "directory"
    || typeof handle?.getDirectoryHandle === "function";
}

function isFileHandle(handle) {
  return handle?.kind === "file"
    || typeof handle?.getFile === "function";
}

function normalizeCatalogFile(file) {
  const release = typeof file?.release === "string" ? file.release.trim() : "";
  const path = typeof file?.path === "string" ? file.path.trim() : "";
  const fileName = typeof file?.fileName === "string" ? file.fileName.trim() : "";

  if (!release || !path) {
    return null;
  }

  return {
    release,
    path,
    fileName: fileName || getBaseName(path),
  };
}

function normalizeHash(value) {
  const hash = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function getBaseName(path) {
  return path.split(/[\\/]/).pop() ?? path;
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
