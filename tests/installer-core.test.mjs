import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { injectPluginEntry, patchEmptyPackageName } from "../installer-core.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");

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

test("installer-manifest.json tracks the copied support bundle", async () => {
  const manifestPath = path.join(repoRoot, "installer-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  const bundleDirectory = path.join(repoRoot, manifest.bundleDirectory);
  const actualFiles = await readdir(bundleDirectory, { withFileTypes: true });
  const copiedFiles = actualFiles
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !["install", "installer.ps1", "installer.sh", manifest.loaderFile].includes(name))
    .sort();

  const manifestFiles = [...manifest.supportFiles].sort();
  assert.deepEqual(manifestFiles, copiedFiles);
});
