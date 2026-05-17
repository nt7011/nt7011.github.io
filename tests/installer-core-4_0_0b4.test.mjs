import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTALL_FILE_INDEX_URL,
  INSTALL_MANIFEST_URL,
  INSTALL_VERSION_URL,
  LEGACY_LOADER_PLUGIN_NAME,
  LOADER_PLUGIN_NAME,
  getInstallVersionMismatch,
  installGame,
  loadManifest,
  loadPublishedVersionInfo,
} from "../translator/4.0.0b4/installer-core.mjs";

const testBundleUrl = "https://example.test/translator/4.0.0b4/live-translator/";

function createFourZeroManifest(overrides = {}) {
  const files = overrides.install?.files ?? [
    "live-translator-loader.js",
    "install-manifest.json",
    "version.json",
    "config-templates/settings.release.json",
    "translator.json",
    "gui/index.html",
  ];

  return {
    schemaVersion: 2,
    supportDirectory: "live-translator",
    loader: "live-translator-loader.js",
    loaderFile: "live-translator-loader.js",
    pluginEntryName: LOADER_PLUGIN_NAME,
    legacyPluginEntryName: LEGACY_LOADER_PLUGIN_NAME,
    pluginEntry: `{"name":"${LOADER_PLUGIN_NAME}","status":true,"description":"Entry point","parameters":{}},`,
    bundleUrl: testBundleUrl,
    runtime: {
      requiredAssets: ["translator.json", "settings.json"],
      optionalAssets: ["precacher/precache.json"],
      loaderHelpers: ["loader/path-resolver.js"],
      scriptLoadOrder: ["bootstrap.js"],
    },
    ...overrides,
    install: {
      files,
      settings: {
        developmentSource: "config-templates/settings.release.json",
        releaseSource: "config-templates/settings.release.json",
        destination: "settings.json",
      },
      obsolete: ["hooks/old.js"],
      ...overrides.install,
    },
  };
}

test("4.0.0b4 installer URLs point at the live-translator payload", () => {
  assert.equal(INSTALL_MANIFEST_URL.pathname.endsWith("/translator/4.0.0b4/live-translator/install-manifest.json"), true);
  assert.equal(INSTALL_FILE_INDEX_URL.pathname.endsWith("/translator/4.0.0b4/live-translator-files.json"), true);
  assert.equal(INSTALL_VERSION_URL.pathname.endsWith("/translator/4.0.0b4/live-translator/version.json"), true);
});

test("4.0.0b4 loadManifest uses the generated file index for live-translator payloads", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(String(url)).pathname;
    requests.push({ pathname, cache: options?.cache });
    return createFetchResponse({
      "/translator/4.0.0b4/live-translator/install-manifest.json": JSON.stringify({
        schemaVersion: 2,
        supportDirectory: "live-translator",
        loader: "live-translator-loader.js",
        obsoleteSupportPaths: ["hooks/old.js"],
        runtime: {
          requiredAssets: ["translator.json", "settings.json"],
          optionalAssets: ["precacher/precache.json"],
          loaderHelpers: ["loader/path-resolver.js"],
          scriptLoadOrder: ["bootstrap.js"],
        },
      }),
      "/translator/4.0.0b4/live-translator-files.json": JSON.stringify({
        files: [
          "config-templates/settings.release.json",
          "translator.json",
          "version.json",
          "gui/index.html",
        ],
      }),
    }, url);
  };

  try {
    const manifest = await loadManifest(
      "https://example.test/translator/4.0.0b4/live-translator/install-manifest.json",
    );

    assert.equal(manifest.bundleUrl, testBundleUrl);
    assert.equal(manifest.pluginEntryName, LOADER_PLUGIN_NAME);
    assert.equal(manifest.legacyPluginEntryName, LEGACY_LOADER_PLUGIN_NAME);
    assert.equal(manifest.pluginEntry, `{"name":"${LOADER_PLUGIN_NAME}","status":true,"description":"Entry point for the live translation system","parameters":{}},`);
    assert.deepEqual(manifest.install.files, [
      "live-translator-loader.js",
      "install-manifest.json",
      "config-templates/settings.release.json",
      "translator.json",
      "version.json",
      "gui/index.html",
    ]);
    assert.deepEqual(manifest.install.obsolete, ["hooks/old.js"]);
    assert.deepEqual(manifest.install.settings, {
      developmentSource: "config-templates/settings.release.json",
      releaseSource: "config-templates/settings.release.json",
      destination: "settings.json",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    {
      pathname: "/translator/4.0.0b4/live-translator/install-manifest.json",
      cache: "no-store",
    },
    {
      pathname: "/translator/4.0.0b4/live-translator-files.json",
      cache: "no-store",
    },
  ]);
});

test("4.0.0b4 published stable version ignores recommended-beta", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.pathname, "/info/translator-version.json");
    assert.equal(parsedUrl.searchParams.get("installCheck"), "12345");
    assert.equal(options?.cache, "no-store");
    return createFetchResponse({
      "/info/translator-version.json": JSON.stringify({
        recommended: "3.2.10",
        "recommended-beta": "4.0.0b4",
      }),
    }, url);
  };

  try {
    const publishedVersion = await loadPublishedVersionInfo(
      "https://example.test/info/translator-version.json",
      { cacheBustValue: 12345 },
    );

    assert.equal(publishedVersion, "3.2.10");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("4.0.0b4 published beta version checks follow recommended-beta", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.pathname, "/info/translator-version.json");
    assert.equal(parsedUrl.searchParams.get("installCheck"), "12345");
    assert.equal(options?.cache, "no-store");
    return createFetchResponse({
      "/info/translator-version.json": JSON.stringify({
        recommended: "3.2.10",
        "recommended-beta": "4.0.0b4",
      }),
    }, url);
  };

  try {
    const publishedVersion = await loadPublishedVersionInfo(
      "https://example.test/info/translator-version.json",
      { cacheBustValue: 12345, channel: "beta" },
    );

    assert.equal(publishedVersion, "4.0.0b4");
    assert.equal(getInstallVersionMismatch("4.0.0b4", publishedVersion), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("4.0.0b4 installGame copies live-translator into the support folder and upgrades legacy plugin entry", async () => {
  const rootHandle = createFakeDirectory("Game");
  const jsHandle = rootHandle.addDirectory("js");
  const pluginsHandle = jsHandle.addDirectory("plugins");
  const supportHandle = pluginsHandle.addDirectory("live-translator");
  const oldHooksHandle = supportHandle.addDirectory("hooks");
  rootHandle.addDirectory("live-translator-installer").setFileText("old.txt", "old\n");

  rootHandle.setFileText("package.json", '{"name":"Game"}\n');
  jsHandle.setFileText("plugins.js", `[{"name":"${LEGACY_LOADER_PLUGIN_NAME}","status":true}]\n`);
  supportHandle.setFileText("settings.json", "{\"existing\":true}\n");
  oldHooksHandle.setFileText("old.js", "old hook\n");

  const manifest = createFourZeroManifest();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({
    "/translator/4.0.0b4/live-translator/live-translator-loader.js": 'console.log("loader");\n',
    "/translator/4.0.0b4/live-translator/install-manifest.json": "{}\n",
    "/translator/4.0.0b4/live-translator/version.json": "{\"version\":\"4.0.0b4\"}\n",
    "/translator/4.0.0b4/live-translator/config-templates/settings.release.json": "{\"existing\":false}\n",
    "/translator/4.0.0b4/live-translator/translator.json": "{\"provider\":\"local\"}\n",
    "/translator/4.0.0b4/live-translator/gui/index.html": "<!doctype html>\n",
  }, url);

  let result;
  try {
    result = await installGame(rootHandle, manifest, {
      baseUrl: "https://example.test/translator/4.0.0b4/app.mjs",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.throws(
    () => pluginsHandle.readFileText("live-translator-loader.js"),
    /Missing fake file: live-translator-loader\.js/,
  );
  assert.equal(
    supportHandle.readFileText("live-translator-loader.js"),
    'console.log("loader");\n',
  );
  assert.equal(supportHandle.readFileText("settings.json"), "{\"existing\":true}\n");
  assert.equal(
    supportHandle.readFileTextAtPath("config-templates/settings.release.json"),
    "{\"existing\":false}\n",
  );
  assert.equal(supportHandle.readFileText("translator.json"), "{\"provider\":\"local\"}\n");
  assert.equal(supportHandle.readFileTextAtPath("gui/index.html"), "<!doctype html>\n");
  assert.equal(supportHandle.readFileText("version.json"), "{\"version\":\"4.0.0b4\"}\n");
  assert.throws(
    () => supportHandle.readFileTextAtPath("hooks/old.js"),
    /Missing fake file: old\.js/,
  );
  assert.throws(
    () => rootHandle.getDirectory("live-translator-installer"),
    /Missing fake directory: live-translator-installer/,
  );
  assert.equal(
    jsHandle.readFileText("plugins.js"),
    `[{"name":"${LOADER_PLUGIN_NAME}","status":true}]\n`,
  );
  assert.deepEqual(result, {
    packageUpdates: 0,
    pluginEntryAdded: true,
    filesCopied: 6,
    supportDirectory: "js/plugins/live-translator",
  });
});

test("4.0.0b4 installGame creates settings.json from the release template when root settings are absent", async () => {
  const rootHandle = createFakeDirectory("Game");
  const jsHandle = rootHandle.addDirectory("js");
  const pluginsHandle = jsHandle.addDirectory("plugins");

  rootHandle.setFileText("package.json", '{"name":"Game"}\n');
  jsHandle.setFileText("plugins.js", "[]\n");

  const manifest = createFourZeroManifest();
  const releaseSettings = '{\n  "checkUpdates": true\n}\n';
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(new URL(String(url)).pathname);
    return createFetchResponse({
      "/translator/4.0.0b4/live-translator/live-translator-loader.js": 'console.log("loader");\n',
      "/translator/4.0.0b4/live-translator/install-manifest.json": "{}\n",
      "/translator/4.0.0b4/live-translator/version.json": "{\"version\":\"4.0.0b4\"}\n",
      "/translator/4.0.0b4/live-translator/config-templates/settings.release.json": releaseSettings,
      "/translator/4.0.0b4/live-translator/translator.json": "{\"provider\":\"local\"}\n",
      "/translator/4.0.0b4/live-translator/gui/index.html": "<!doctype html>\n",
    }, url);
  };

  let result;
  try {
    result = await installGame(rootHandle, manifest, {
      baseUrl: "https://example.test/translator/4.0.0b4/app.mjs",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const supportHandle = pluginsHandle.getDirectory("live-translator");
  assert.equal(supportHandle.readFileText("settings.json"), releaseSettings);
  assert.equal(
    supportHandle.readFileTextAtPath("config-templates/settings.release.json"),
    releaseSettings,
  );
  assert.equal(
    requests.includes("/translator/4.0.0b4/live-translator/settings.json"),
    false,
  );
  assert.equal(result.filesCopied, 7);
});

function createFetchResponse(assets, url) {
  const pathname = new URL(String(url)).pathname;
  const body = assets[pathname];

  if (typeof body === "undefined") {
    return {
      ok: false,
      status: 404,
      async json() {
        return {};
      },
      async text() {
        return "";
      },
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
    };
  }

  return {
    ok: true,
    status: 200,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
    async arrayBuffer() {
      return new TextEncoder().encode(body).buffer;
    },
  };
}

function createFakeDirectory(name) {
  return new FakeDirectoryHandle(name);
}

class FakeDirectoryHandle {
  constructor(name) {
    this.name = name;
    this.directories = new Map();
    this.files = new Map();
  }

  addDirectory(name) {
    const directory = new FakeDirectoryHandle(name);
    this.directories.set(name, directory);
    return directory;
  }

  getDirectory(name) {
    const directory = this.directories.get(name);
    if (!directory) {
      throw new Error(`Missing fake directory: ${name}`);
    }

    return directory;
  }

  setFileText(name, text) {
    this.files.set(name, new TextEncoder().encode(text));
  }

  readFileText(name) {
    const bytes = this.files.get(name);
    if (!bytes) {
      throw new Error(`Missing fake file: ${name}`);
    }

    return new TextDecoder().decode(bytes);
  }

  readFileTextAtPath(filePath) {
    const segments = filePath.split(/[\\/]+/);
    let directory = this;

    for (const directoryName of segments.slice(0, -1)) {
      directory = directory.getDirectory(directoryName);
    }

    return directory.readFileText(segments[segments.length - 1]);
  }

  async getDirectoryHandle(name, options = {}) {
    const existingDirectory = this.directories.get(name);
    if (existingDirectory) {
      return existingDirectory;
    }

    if (options.create) {
      return this.addDirectory(name);
    }

    throw createNotFoundError();
  }

  async getFileHandle(name, options = {}) {
    if (this.files.has(name)) {
      return new FakeFileHandle(this, name);
    }

    if (options.create) {
      this.setFileText(name, "");
      return new FakeFileHandle(this, name);
    }

    throw createNotFoundError();
  }

  async removeEntry(name) {
    if (this.files.delete(name)) {
      return;
    }

    if (this.directories.delete(name)) {
      return;
    }

    throw createNotFoundError();
  }
}

class FakeFileHandle {
  constructor(parent, name) {
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

  async createWritable() {
    return {
      write: async (value) => {
        this.parent.files.set(this.name, normalizeWritableValue(value));
      },
      close: async () => {},
    };
  }
}

function normalizeWritableValue(value) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  throw new TypeError(`Unsupported writable value: ${typeof value}`);
}

function createNotFoundError() {
  const error = new Error("Not found");
  error.name = "NotFoundError";
  return error;
}
