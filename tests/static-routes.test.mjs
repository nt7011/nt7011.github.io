import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");

async function readSiteFile(...segments) {
  return readFile(path.join(repoRoot, ...segments), "utf8");
}

test("root index lists the approved translator version", async () => {
  const html = await readSiteFile("index.html");

  assert.match(html, /Approved versions/);
  assert.match(html, /href="translator\/3\.2\.10\/"/);
  assert.match(html, /href="translator\/"/);
  assert.doesNotMatch(html, /id="pick-folder-button"/);
  assert.doesNotMatch(html, /src="\.\/app\.mjs"/);
});

test("translator routes serve the installer page with depth-correct assets", async () => {
  const latestHtml = await readSiteFile("translator", "index.html");
  const versionHtml = await readSiteFile("translator", "3.2.10", "index.html");

  assert.match(latestHtml, /id="pick-folder-button"/);
  assert.match(latestHtml, /href="\.\.\/styles\.css"/);
  assert.match(latestHtml, /src="\.\.\/app\.mjs"/);
  assert.match(latestHtml, /href="\.\.\/cheats\/"/);

  assert.match(versionHtml, /id="pick-folder-button"/);
  assert.match(versionHtml, /href="\.\.\/\.\.\/styles\.css"/);
  assert.match(versionHtml, /src="\.\.\/\.\.\/app\.mjs"/);
  assert.match(versionHtml, /href="\.\.\/\.\.\/cheats\/"/);
});

test("checked-in translator version metadata matches the approved route", async () => {
  const publicVersion = JSON.parse(await readSiteFile("info", "translator-version.json"));
  const bundledVersion = JSON.parse(await readSiteFile("live-translator-installer", "version.json"));

  assert.equal(publicVersion.version, "3.2.10");
  assert.equal(bundledVersion.version, "3.2.10");
});
