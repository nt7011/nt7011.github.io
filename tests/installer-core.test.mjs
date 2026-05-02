import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getMissingConfigFields,
  injectPluginEntry,
  installGame,
  isVersionOutdated,
  loadInstalledConfigs,
  loadManifest,
  loadVersionInfo,
  patchEmptyPackageName,
} from "../installer-core.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");
const testBundleUrl = "https://example.test/live-translator-installer/";

function createTestManifest(overrides = {}) {
  const install = overrides.install ?? {};
  const runtime = overrides.runtime ?? {};

  return {
    schemaVersion: 2,
    supportDirectory: "live-translator",
    loader: "live-translator-loader.js",
    loaderFile: "live-translator-loader.js",
    pluginEntry: '{"name":"live-translator-loader","status":true,"description":"Entry point","parameters":{}},',
    bundleUrl: testBundleUrl,
    ...overrides,
    install: {
      files: ["translator.json"],
      obsolete: [],
      settings: {
        developmentSource: "settings.json",
        releaseSource: "config-templates/settings.release.json",
        destination: "settings.json",
      },
      ...install,
    },
    runtime: {
      requiredAssets: ["translator.json", "settings.json"],
      optionalAssets: ["precacher/precache.json"],
      loaderHelpers: [],
      scriptLoadOrder: [],
      ...runtime,
    },
  };
}

test("patchEmptyPackageName only updates empty name fields", () => {
  const changed = patchEmptyPackageName('{"name":"","window":{"title":"Demo"}}');
  assert.equal(changed.changed, true);
  assert.equal(changed.text, '{"name":"Game","window":{"title":"Demo"}}');

  const untouched = patchEmptyPackageName('{"name":"Already Set"}');
  assert.equal(untouched.changed, false);
  assert.equal(untouched.text, '{"name":"Already Set"}');
});

test("injectPluginEntry inserts the loader entry once", () => {
  const entry = '{"name":"live-translator-loader","status":true,"description":"Entry point","parameters":{}},';
  const injected = injectPluginEntry('[{"name":"AnotherPlugin"}]', entry);
  assert.equal(injected.changed, true);
  assert.equal(
    injected.text,
    `[${entry}{"name":"AnotherPlugin"}]`,
  );

  const alreadyPresent = injectPluginEntry(`[${entry}]`, entry);
  assert.equal(alreadyPresent.changed, false);
  assert.equal(alreadyPresent.alreadyPresent, true);
});

test("getMissingConfigFields reports missing leaf paths from bundled defaults", () => {
  const missingFields = getMissingConfigFields(
    {
      settings: {
        translation: {
          disableCjkFilter: false,
          maxOutputTokens: 512,
        },
        gameMessage: {
          textScale: 100,
          originAwareLineBreaks: false,
        },
        textScaleOthers: 100,
      },
      translator: {
        provider: "local",
        settings: {
          deepl: {
            apiKey: "________NONE________",
          },
        },
      },
    },
    {
      settings: {
        translation: {
          disableCjkFilter: false,
        },
      },
      translator: {
        provider: "local",
        settings: {},
      },
    },
  );

  assert.deepEqual(missingFields, [
    "settings.json:translation.maxOutputTokens",
    "settings.json:gameMessage.textScale",
    "settings.json:gameMessage.originAwareLineBreaks",
    "settings.json:textScaleOthers",
    "translator.json:settings.deepl.apiKey",
  ]);
});

test("loadVersionInfo returns the bundled version when version.json is present", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options?.cache, "no-store");
    return createFetchResponse({
      "/version.json": JSON.stringify({ version: "1.12" }),
    }, url);
  };

  try {
    const version = await loadVersionInfo("https://example.test/version.json");
    assert.equal(version, "1.12");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadVersionInfo returns null when version.json is missing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({}, url);

  try {
    const version = await loadVersionInfo("https://example.test/version.json");
    assert.equal(version, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadManifest normalizes the bundle install manifest schema", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({
    "/live-translator-installer/install-manifest.json": JSON.stringify({
      schemaVersion: 2,
      supportDirectory: "live-translator",
      loader: "live-translator-loader.js",
      install: {
        files: ["translator.json", "runtime/paths.js"],
        obsolete: ["hooks.js"],
        settings: {
          developmentSource: "settings.json",
          releaseSource: "config-templates/settings.release.json",
          destination: "settings.json",
        },
      },
      runtime: {
        loaderHelpers: ["loader/path-resolver.js"],
        requiredAssets: ["translator.json", "settings.json"],
        optionalAssets: ["precacher/precache.json"],
        scriptLoadOrder: ["logger.js", "config.js"],
      },
    }),
  }, url);

  try {
    const manifest = await loadManifest(
      "https://example.test/live-translator-installer/install-manifest.json",
    );

    assert.equal(manifest.loaderFile, "live-translator-loader.js");
    assert.equal(manifest.bundleUrl, "https://example.test/live-translator-installer/");
    assert.deepEqual(manifest.install.files, ["translator.json", "runtime/paths.js"]);
    assert.deepEqual(manifest.runtime.optionalAssets, ["precacher/precache.json"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("isVersionOutdated compares installed version against newest version", () => {
  assert.equal(isVersionOutdated("2.3", "2.4"), true);
  assert.equal(isVersionOutdated("2.10", "2.9"), true);
  assert.equal(isVersionOutdated("2.3.0", "2.3"), true);
  assert.equal(isVersionOutdated(null, "2.4"), true);
  assert.equal(isVersionOutdated("awergerf", "local_debug"), true);
  assert.equal(isVersionOutdated("local_debug", "local_debug"), false);
  assert.equal(isVersionOutdated("2.3", null), false);
});

test("installGame overwrites existing config files during reinstall", async () => {
  const rootHandle = createFakeDirectory("Game");
  const jsHandle = rootHandle.addDirectory("js");
  const pluginsHandle = jsHandle.addDirectory("plugins");
  const supportHandle = pluginsHandle.addDirectory("live-translator");

  rootHandle.setFileText("package.json", '{"name":"Game"}\n');
  jsHandle.setFileText("plugins.js", "[]\n");
  supportHandle.setFileText("settings.json", '{ "gameMessage": {} }\n');
  supportHandle.setFileText("translator.json", '{ "provider": "deepl" }\n');

  const manifest = createTestManifest();

  const defaultSettings = '{\n    "translation": {\n        "maxOutputTokens": 512\n    },\n    "gameMessage": {\n        "textScale": 100\n    }\n}\n';
  const defaultTranslator = '{\n    "provider": "local"\n}\n';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({
    "/version.json": JSON.stringify({ version: "2.4" }),
    "/live-translator-installer/live-translator-loader.js": 'console.log("loader");\n',
    "/live-translator-installer/settings.json": defaultSettings,
    "/live-translator-installer/translator.json": defaultTranslator,
  }, url);

  try {
    await installGame(rootHandle, manifest, {
      baseUrl: "https://example.test/app.mjs",
      overwriteExistingConfigs: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    supportHandle.readFileText("settings.json"),
    defaultSettings,
  );
  assert.equal(
    supportHandle.readFileText("translator.json"),
    defaultTranslator,
  );
  assert.equal(
    supportHandle.readFileText("version.json"),
    JSON.stringify({ version: "2.4" }),
  );
});

test("installGame copies nested support files", async () => {
  const rootHandle = createFakeDirectory("Game");
  const jsHandle = rootHandle.addDirectory("js");
  const pluginsHandle = jsHandle.addDirectory("plugins");

  rootHandle.setFileText("package.json", '{"name":"Game"}\n');
  jsHandle.setFileText("plugins.js", "[]\n");

  const manifest = createTestManifest({
    install: {
      files: [
        "translator.json",
        "precacher/precacher.js",
        "precacher/pretranslator.js",
        "precacher-ui/app.js",
        "precacher-ui/index.html",
        "precacher-ui/style.css",
        "precacher-ui-launcher.js",
      ],
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({
    "/version.json": JSON.stringify({ version: "2.4" }),
    "/live-translator-installer/live-translator-loader.js": 'console.log("loader");\n',
    "/live-translator-installer/settings.json": "{}\n",
    "/live-translator-installer/translator.json": "{}\n",
    "/live-translator-installer/precacher/precacher.js": 'console.log("precacher");\n',
    "/live-translator-installer/precacher/pretranslator.js": 'console.log("pretranslator");\n',
    "/live-translator-installer/precacher-ui/app.js": 'console.log("ui app");\n',
    "/live-translator-installer/precacher-ui/index.html": "<!doctype html>\n",
    "/live-translator-installer/precacher-ui/style.css": "body {}\n",
    "/live-translator-installer/precacher-ui-launcher.js": 'console.log("launcher");\n',
  }, url);

  let result;
  try {
    result = await installGame(rootHandle, manifest, {
      baseUrl: "https://example.test/app.mjs",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const supportHandle = pluginsHandle.getDirectory("live-translator");
  assert.equal(
    supportHandle.readFileTextAtPath("precacher/precacher.js"),
    'console.log("precacher");\n',
  );
  assert.equal(
    supportHandle.readFileTextAtPath("precacher/pretranslator.js"),
    'console.log("pretranslator");\n',
  );
  assert.equal(
    supportHandle.readFileTextAtPath("precacher-ui/app.js"),
    'console.log("ui app");\n',
  );
  assert.equal(
    supportHandle.readFileTextAtPath("precacher-ui/index.html"),
    "<!doctype html>\n",
  );
  assert.equal(
    supportHandle.readFileTextAtPath("precacher-ui/style.css"),
    "body {}\n",
  );
  assert.equal(
    supportHandle.readFileText("precacher-ui-launcher.js"),
    'console.log("launcher");\n',
  );
  assert.equal(result.filesCopied, manifest.install.files.length + 3);
});

test("installGame removes obsolete files while preserving optional assets", async () => {
  const rootHandle = createFakeDirectory("Game");
  const jsHandle = rootHandle.addDirectory("js");
  const pluginsHandle = jsHandle.addDirectory("plugins");
  const supportHandle = pluginsHandle.addDirectory("live-translator");
  const oldPrecacherUiHandle = supportHandle.addDirectory("precacher-ui");
  const precacherHandle = supportHandle.addDirectory("precacher");

  rootHandle.setFileText("package.json", '{"name":"Game"}\n');
  jsHandle.setFileText("plugins.js", "[]\n");
  supportHandle.setFileText("settings.json", "{}\n");
  supportHandle.setFileText("translator.json", "{}\n");
  oldPrecacherUiHandle.setFileText("app.js", "old ui\n");
  precacherHandle.setFileText("precache.json", "{\"keep\":true}\n");

  const manifest = createTestManifest({
    install: {
      files: [
        "translator.json",
        "precacher/app.js",
      ],
      obsolete: [
        "precacher-ui/app.js",
        "precacher/precache.json",
      ],
    },
    runtime: {
      optionalAssets: ["precacher/precache.json"],
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({
    "/version.json": JSON.stringify({ version: "2.4" }),
    "/live-translator-installer/live-translator-loader.js": 'console.log("loader");\n',
    "/live-translator-installer/settings.json": "{\"settings\":true}\n",
    "/live-translator-installer/translator.json": "{\"provider\":\"local\"}\n",
    "/live-translator-installer/precacher/app.js": "new app\n",
  }, url);

  try {
    await installGame(rootHandle, manifest, {
      baseUrl: "https://example.test/app.mjs",
      overwriteExistingConfigs: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.throws(
    () => supportHandle.readFileTextAtPath("precacher-ui/app.js"),
    /Missing fake file/,
  );
  assert.equal(
    supportHandle.readFileTextAtPath("precacher/precache.json"),
    "{\"keep\":true}\n",
  );
  assert.equal(
    supportHandle.readFileTextAtPath("precacher/app.js"),
    "new app\n",
  );
});

test("loadInstalledConfigs reports the installed version file", async () => {
  const rootHandle = createFakeDirectory("Game");
  const jsHandle = rootHandle.addDirectory("js");
  const pluginsHandle = jsHandle.addDirectory("plugins");
  const supportHandle = pluginsHandle.addDirectory("live-translator");

  jsHandle.setFileText("plugins.js", "[]\n");
  supportHandle.setFileText("settings.json", "{}\n");
  supportHandle.setFileText("translator.json", "{}\n");
  supportHandle.setFileText("version.json", JSON.stringify({ version: "2.3" }));

  const manifest = createTestManifest();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => createFetchResponse({
    "/live-translator-installer/settings.json": "{}\n",
    "/live-translator-installer/translator.json": "{}\n",
  }, url);

  try {
    const snapshot = await loadInstalledConfigs(rootHandle, manifest, {
      baseUrl: "https://example.test/app.mjs",
    });

    assert.equal(snapshot.installedVersionChecked, true);
    assert.equal(snapshot.installedVersion, "2.3");
    assert.equal(snapshot.editable, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("install-manifest.json references files present in the copied support bundle", async () => {
  const bundleDirectory = path.join(repoRoot, "live-translator-installer");
  const manifestPath = path.join(bundleDirectory, "install-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const installFiles = new Set(manifest.install.files);
  const obsoleteFiles = new Set(manifest.install.obsolete ?? []);
  const producedFiles = new Set([
    ...installFiles,
    manifest.install.settings.destination,
  ]);

  await readFile(path.join(bundleDirectory, manifest.loader));
  await readFile(path.join(bundleDirectory, manifest.install.settings.developmentSource));
  await readFile(path.join(bundleDirectory, manifest.install.settings.releaseSource));

  for (const file of manifest.install.files) {
    await readFile(path.join(bundleDirectory, file));
  }

  assert.deepEqual(
    manifest.runtime.loaderHelpers.filter((file) => !installFiles.has(file)),
    [],
  );
  assert.deepEqual(
    manifest.runtime.scriptLoadOrder.filter((file) => !installFiles.has(file)),
    [],
  );
  assert.deepEqual(
    manifest.runtime.requiredAssets.filter((file) => !producedFiles.has(file)),
    [],
  );
  assert.deepEqual(
    manifest.install.files.filter((file) => obsoleteFiles.has(file)),
    [],
  );
  assert.deepEqual(
    manifest.runtime.optionalAssets.filter((file) => obsoleteFiles.has(file)),
    [],
  );
});

function createFetchResponse(assets, url) {
  const pathname = new URL(String(url)).pathname;
  const body = assets[pathname];

  if (typeof body === "undefined") {
    return {
      ok: false,
      status: 404,
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
