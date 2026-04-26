#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ROOT_URL = "https://dl.nwjs.io/";
export const DEFAULT_START_VERSION = "v0.32.0-beta1";
export const DEFAULT_OUTPUT_FILE = new URL("./nwjs-dll-hashes.json", import.meta.url);

const HASH_FILE_CANDIDATES = Object.freeze([
  { fileName: "SHASUMS256.txt", algorithm: "sha256", hashLength: 64 },
  { fileName: "MD5SUMS", algorithm: "md5", hashLength: 32 },
]);
const DLL_PATH_PATTERN = /\.dll$/i;
const RELEASE_LINK_PATTERN = /href="(v[^"/]+\/)"/gi;

export async function downloadNwjsDllHashes(options = {}) {
  const rootUrl = normalizeRootUrl(options.rootUrl ?? DEFAULT_ROOT_URL);
  const startVersion = options.startVersion ?? DEFAULT_START_VERSION;
  const concurrency = options.concurrency ?? 8;
  const log = typeof options.log === "function" ? options.log : () => {};

  const index = await fetchText(rootUrl);
  const releases = parseReleaseIndex(index)
    .filter((release) => compareNwjsBuildVersions(release, startVersion) >= 0)
    .sort(compareNwjsBuildVersions);

  const collected = new Map();
  const skipped = [];
  const includedReleases = [];
  let releaseCount = 0;
  let fileReferenceCount = 0;

  await processWithConcurrency(releases, concurrency, async (release) => {
    const hashFile = await fetchBestHashFile(rootUrl, release);
    if (!hashFile) {
      skipped.push({
        release,
        reason: "hash file missing",
      });
      return;
    }

    if (hashFile.algorithm !== "sha256") {
      skipped.push({
        release,
        reason: `${hashFile.fileName} uses ${hashFile.algorithm}; scanner uses sha256`,
      });
      return;
    }

    const dllEntries = parseChecksumFile(hashFile.text, {
      algorithm: hashFile.algorithm,
      hashLength: hashFile.hashLength,
    }).filter((entry) => DLL_PATH_PATTERN.test(entry.path));

    if (dllEntries.length === 0) {
      skipped.push({
        release,
        reason: `${hashFile.fileName} has no DLL file hashes`,
      });
      return;
    }

    releaseCount += 1;
    includedReleases.push(release);
    fileReferenceCount += dllEntries.length;
    for (const entry of dllEntries) {
      addCatalogFile(collected, entry.hash, {
        release,
        path: entry.path,
        fileName: getBaseName(entry.path),
      });
    }

    log(`${release}: ${dllEntries.length} DLL hashes from ${hashFile.fileName}`);
  });

  const hashes = [...collected.values()]
    .sort((left, right) => left.hash.localeCompare(right.hash))
    .map((entry) => ({
      hash: entry.hash,
      files: entry.files.sort(compareCatalogFiles),
    }));

  return {
    schemaVersion: 1,
    source: rootUrl,
    generatedAt: new Date().toISOString(),
    startVersion,
    firstIncludedVersion: includedReleases.sort(compareNwjsBuildVersions).at(0) ?? null,
    latestVersion: includedReleases.sort(compareNwjsBuildVersions).at(-1) ?? null,
    includedReleases,
    algorithm: "sha256",
    releaseCount,
    hashCount: hashes.length,
    fileReferenceCount,
    skipped,
    hashes,
  };
}

export function parseReleaseIndex(html) {
  const releases = new Set();
  let match;

  while ((match = RELEASE_LINK_PATTERN.exec(html)) !== null) {
    const release = match[1].replace(/\/$/, "");
    if (release !== "live-build" && parseNwjsBuildVersion(release)) {
      releases.add(release);
    }
  }

  return [...releases];
}

export function parseChecksumFile(text, options = {}) {
  const hashLength = options.hashLength ?? 64;
  const pattern = new RegExp(`^([a-fA-F0-9]{${hashLength}})\\s+\\*?(.+?)\\s*$`);
  const entries = [];

  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (!match) {
      continue;
    }

    entries.push({
      algorithm: options.algorithm ?? "sha256",
      hash: match[1].toLowerCase(),
      path: match[2].trim(),
    });
  }

  return entries;
}

export function compareNwjsBuildVersions(left, right) {
  const parsedLeft = parseNwjsBuildVersion(left);
  const parsedRight = parseNwjsBuildVersion(right);
  if (!parsedLeft || !parsedRight) {
    return String(left).localeCompare(String(right));
  }

  for (const key of ["major", "minor", "patch"]) {
    if (parsedLeft[key] !== parsedRight[key]) {
      return parsedLeft[key] - parsedRight[key];
    }
  }

  if (parsedLeft.preRelease === parsedRight.preRelease) {
    return 0;
  }

  if (!parsedLeft.preRelease) {
    return 1;
  }

  if (!parsedRight.preRelease) {
    return -1;
  }

  return comparePreRelease(parsedLeft.preRelease, parsedRight.preRelease);
}

export function parseNwjsBuildVersion(version) {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)(\d+)?)?$/i.exec(String(version ?? "").trim());
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    preRelease: match[4]
      ? {
          label: match[4].toLowerCase(),
          number: typeof match[5] === "string" ? Number(match[5]) : 0,
        }
      : null,
  };
}

async function fetchBestHashFile(rootUrl, release) {
  for (const candidate of HASH_FILE_CANDIDATES) {
    const url = new URL(`${release}/${candidate.fileName}`, rootUrl);
    const response = await fetch(url);
    if (!response.ok) {
      continue;
    }

    return {
      ...candidate,
      text: await response.text(),
    };
  }

  return null;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function processWithConcurrency(items, concurrency, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });

  await Promise.all(workers);
}

function addCatalogFile(catalog, hash, file) {
  const existing = catalog.get(hash) ?? {
    hash,
    files: [],
    fileKeys: new Set(),
  };
  const key = `${file.release}\n${file.path}`;

  if (!existing.fileKeys.has(key)) {
    existing.fileKeys.add(key);
    existing.files.push(file);
  }

  catalog.set(hash, existing);
}

function compareCatalogFiles(left, right) {
  const releaseComparison = compareNwjsBuildVersions(left.release, right.release);
  if (releaseComparison !== 0) {
    return releaseComparison;
  }

  return left.path.localeCompare(right.path);
}

function comparePreRelease(left, right) {
  const labelComparison = left.label.localeCompare(right.label);
  if (labelComparison !== 0) {
    return labelComparison;
  }

  return left.number - right.number;
}

function getBaseName(filePath) {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function normalizeRootUrl(rootUrl) {
  const value = String(rootUrl);
  return value.endsWith("/") ? value : `${value}/`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = await downloadNwjsDllHashes({
    rootUrl: options.rootUrl,
    startVersion: options.startVersion,
    concurrency: options.concurrency,
    log: options.quiet ? null : console.error,
  });

  const outputFile = options.outputFile ?? fileURLToPath(DEFAULT_OUTPUT_FILE);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(catalog, null, 2)}\n`);
  console.error(
    `Wrote ${catalog.hashCount} unique SHA-256 DLL hashes from ${catalog.releaseCount} NW.js releases to ${outputFile}.`,
  );
}

function parseArgs(args) {
  const options = {
    rootUrl: DEFAULT_ROOT_URL,
    startVersion: DEFAULT_START_VERSION,
    outputFile: fileURLToPath(DEFAULT_OUTPUT_FILE),
    concurrency: 8,
    quiet: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      options.rootUrl = requireValue(args, index += 1, arg);
    } else if (arg === "--start") {
      options.startVersion = requireValue(args, index += 1, arg);
    } else if (arg === "--output") {
      options.outputFile = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--concurrency") {
      options.concurrency = Number(requireValue(args, index += 1, arg));
      if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
        throw new Error("--concurrency must be a positive integer.");
      }
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
