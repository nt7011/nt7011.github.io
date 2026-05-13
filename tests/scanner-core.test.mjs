import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeHashCatalog,
  scanDirectoryDlls,
  scanFileListDlls,
} from "../translator/3.2.10/scanner/scanner-core.mjs";

test("normalizeHashCatalog keeps catalog version metadata", () => {
  const catalog = normalizeHashCatalog({
    schemaVersion: 1,
    source: "https://dl.nwjs.io/",
    generatedAt: "2026-04-26T00:00:00.000Z",
    startVersion: "v0.32.0-beta1",
    firstIncludedVersion: "v0.32.0",
    latestVersion: "v0.111.0",
    releaseCount: 195,
    fileReferenceCount: 7714,
    includedReleases: ["v0.32.0", "v0.111.0"],
    skipped: [{ release: "v0.32.0-beta1", reason: "hash file missing" }],
    hashes: [
      {
        hash: "a".repeat(64),
        files: [
          {
            release: "v0.111.0",
            path: "nwjs-v0.111.0-win-x64/nw.dll",
            fileName: "nw.dll",
          },
        ],
      },
    ],
  });

  assert.equal(catalog.startVersion, "v0.32.0-beta1");
  assert.equal(catalog.firstIncludedVersion, "v0.32.0");
  assert.equal(catalog.latestVersion, "v0.111.0");
  assert.equal(catalog.releaseCount, 195);
  assert.equal(catalog.fileReferenceCount, 7714);
  assert.deepEqual(catalog.includedReleases, ["v0.32.0", "v0.111.0"]);
  assert.deepEqual(catalog.skipped, [{ release: "v0.32.0-beta1", reason: "hash file missing" }]);
  assert.equal(catalog.hashes.has("a".repeat(64)), true);
});

test("scanDirectoryDlls recursively scans DLL files and reports allowed and unknown hashes", async () => {
  const root = createFakeDirectory("Game");
  const nested = root.addDirectory("swiftshader");
  root.setFileBytes("nw.dll", new TextEncoder().encode("official dll"));
  root.setFileBytes("notes.txt", new TextEncoder().encode("not scanned"));
  nested.setFileBytes("custom.dll", new TextEncoder().encode("custom dll"));

  const allowedHash = await sha256Hex(new TextEncoder().encode("official dll"));
  const scan = await scanDirectoryDlls(root, {
    hashes: [
      {
        hash: allowedHash,
        files: [
          {
            release: "v0.111.0",
            path: "nwjs-v0.111.0-win-x64/nw.dll",
            fileName: "nw.dll",
          },
        ],
      },
    ],
  });

  assert.equal(scan.dllCount, 2);
  assert.equal(scan.allowedCount, 1);
  assert.equal(scan.unknownCount, 1);
  assert.equal(scan.unreadableCount, 0);
  assert.deepEqual(
    scan.entries
      .map((entry) => [entry.path, entry.status])
      .sort((left, right) => left[0].localeCompare(right[0])),
    [
      ["nw.dll", "allowed"],
      ["swiftshader/custom.dll", "unknown"],
    ],
  );
});

test("scanDirectoryDlls recognizes directory handles without kind", async () => {
  const root = createFakeDirectory("Game", { omitKind: true });
  const nested = root.addDirectory("www");
  nested.setFileBytes("nw.dll", new TextEncoder().encode("official dll"));

  const allowedHash = await sha256Hex(new TextEncoder().encode("official dll"));
  const scan = await scanDirectoryDlls(root, {
    hashes: [
      {
        hash: allowedHash,
        files: [
          {
            release: "v0.111.0",
            path: "nwjs-v0.111.0-win-x64/nw.dll",
            fileName: "nw.dll",
          },
        ],
      },
    ],
  });

  assert.equal(scan.dllCount, 1);
  assert.equal(scan.allowedCount, 1);
  assert.equal(scan.entries[0].path, "www/nw.dll");
});

test("scanFileListDlls scans DLL File objects selected through a file input", async () => {
  const rootDll = createFakePickedFile("nw.dll", "Game/nw.dll", "official dll");
  const nestedDll = createFakePickedFile("custom.dll", "Game/swiftshader/custom.dll", "custom dll");
  const note = createFakePickedFile("notes.txt", "Game/notes.txt", "not scanned");

  const allowedHash = await sha256Hex(new TextEncoder().encode("official dll"));
  const scan = await scanFileListDlls([rootDll, nestedDll, note], {
    hashes: [
      {
        hash: allowedHash,
        files: [
          {
            release: "v0.111.0",
            path: "nwjs-v0.111.0-win-x64/nw.dll",
            fileName: "nw.dll",
          },
        ],
      },
    ],
  });

  assert.equal(scan.dllCount, 2);
  assert.equal(scan.allowedCount, 1);
  assert.equal(scan.unknownCount, 1);
  assert.equal(scan.unreadableCount, 0);
  assert.deepEqual(
    scan.entries
      .map((entry) => [entry.path, entry.status])
      .sort((left, right) => left[0].localeCompare(right[0])),
    [
      ["Game/nw.dll", "allowed"],
      ["Game/swiftshader/custom.dll", "unknown"],
    ],
  );
});

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createFakeDirectory(name, options = {}) {
  return new FakeDirectoryHandle(name, options);
}

function createFakePickedFile(name, webkitRelativePath, text) {
  return {
    name,
    webkitRelativePath,
    async arrayBuffer() {
      const bytes = new TextEncoder().encode(text);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

class FakeDirectoryHandle {
  constructor(name, options = {}) {
    if (!options.omitKind) {
      this.kind = "directory";
    }
    this.name = name;
    this.options = options;
    this.directories = new Map();
    this.files = new Map();
  }

  addDirectory(name) {
    const directory = new FakeDirectoryHandle(name, this.options);
    this.directories.set(name, directory);
    return directory;
  }

  setFileBytes(name, bytes) {
    this.files.set(name, new Uint8Array(bytes));
  }

  async *entries() {
    for (const entry of this.directories.entries()) {
      yield entry;
    }

    for (const name of this.files.keys()) {
      yield [name, new FakeFileHandle(this, name)];
    }
  }

  async getDirectoryHandle(name) {
    const directory = this.directories.get(name);
    if (!directory) {
      throw new Error(`Missing fake directory: ${name}`);
    }

    return directory;
  }
}

class FakeFileHandle {
  constructor(parent, name) {
    if (!parent.options.omitKind) {
      this.kind = "file";
    }
    this.parent = parent;
    this.name = name;
  }

  async getFile() {
    const bytes = this.parent.files.get(this.name);
    return {
      async arrayBuffer() {
        const copy = new Uint8Array(bytes);
        return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
      },
    };
  }
}
