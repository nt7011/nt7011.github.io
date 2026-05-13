import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createRecommendedVersionPath,
  createVersionSections,
  createVersionPath,
  normalizeAvailableVersionsManifest,
  resolveVersionSections,
} from "../version-index.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");

async function readSiteFile(...segments) {
  return readFile(path.join(repoRoot, ...segments), "utf8");
}

function createLatestTranslatorAliasHtml(versionHtml, recommendedVersion) {
  return versionHtml
    .replaceAll('href="./styles.css"', `href="./${recommendedVersion}/styles.css"`)
    .replaceAll('src="./app.mjs"', `src="./${recommendedVersion}/app.mjs"`)
    .replaceAll('href="../../cheats/"', 'href="../cheats/"')
    .replaceAll('href="../../"', 'href="../"');
}

test("root index lists the approved translator version", async () => {
  const html = await readSiteFile("index.html");

  assert.match(html, /Web based installer/);
  assert.match(html, /RPG Maker MV\/MZ Live Translator/);
  assert.match(html, /Available versions/);
  assert.match(html, /id="version-index-sections"/);
  assert.match(html, /src="\.\/version-index\.mjs"/);
  assert.match(html, /data-version-i18n="page\.eyebrow"/);
  assert.match(html, /data-version-i18n="page\.heading"/);
  assert.doesNotMatch(html, /Choose an approved translator installer version/);
  assert.doesNotMatch(html, /version-index-status/);
  assert.doesNotMatch(html, /Approved versions loaded/);
  assert.doesNotMatch(html, /id="pick-folder-button"/);
  assert.doesNotMatch(html, /src="\.\/app\.mjs"/);
  assert.doesNotMatch(html, /href="translator\/"/);
  assert.doesNotMatch(html, /href="translator\/3\.2\.10\/"/);
});

test("translator routes serve the installer page with depth-correct assets", async () => {
  const latestHtml = await readSiteFile("translator", "index.html");
  const versionHtml = await readSiteFile("translator", "3.2.10", "index.html");
  const availableVersions = JSON.parse(await readSiteFile("available-versions.json"));

  assert.match(latestHtml, /id="pick-folder-button"/);
  assert.match(latestHtml, /<div class="layout-sidebar">\s*<a class="back-button" href="\.\.\/"[\s\S]*?<section class="panel primary-panel">/);
  assert.match(latestHtml, /&larr; Back to Version Select/);
  assert.match(latestHtml, /<section class="panel detected-panel">[\s\S]*?<section class="panel precacher-panel"[\s\S]*?<section class="panel cheats-panel"/);
  assert.match(latestHtml, /class="back-button" href="\.\.\/"/);
  assert.match(latestHtml, /href="\.\/3\.2\.10\/styles\.css"/);
  assert.match(latestHtml, /src="\.\/3\.2\.10\/app\.mjs"/);
  assert.match(latestHtml, /href="\.\.\/cheats\/"/);

  assert.match(versionHtml, /id="pick-folder-button"/);
  assert.match(versionHtml, /<div class="layout-sidebar">\s*<a class="back-button" href="\.\.\/\.\.\/"[\s\S]*?<section class="panel primary-panel">/);
  assert.match(versionHtml, /&larr; Back to Version Select/);
  assert.match(versionHtml, /<section class="panel detected-panel">[\s\S]*?<section class="panel precacher-panel"[\s\S]*?<section class="panel cheats-panel"/);
  assert.match(versionHtml, /class="back-button" href="\.\.\/\.\.\/"/);
  assert.match(versionHtml, /href="\.\/styles\.css"/);
  assert.match(versionHtml, /src="\.\/app\.mjs"/);
  assert.match(versionHtml, /href="\.\.\/\.\.\/cheats\/"/);
  assert.equal(
    latestHtml,
    createLatestTranslatorAliasHtml(versionHtml, availableVersions.recommended),
  );
});

test("translator version metadata matches the approved version folder", async () => {
  const availableVersions = JSON.parse(await readSiteFile("available-versions.json"));
  const bundledVersion = JSON.parse(await readSiteFile(
    "translator",
    "3.2.10",
    "live-translator-installer",
    "version.json",
  ));
  const versionedInstallerCore = await readSiteFile("translator", "3.2.10", "installer-core.mjs");

  assert.equal(availableVersions.recommended, "3.2.10");
  assert.equal(availableVersions["recommended-beta"], "");
  assert.deepEqual(availableVersions.stable, ["3.2.10"]);
  assert.deepEqual(availableVersions.prerelease, []);
  assert.deepEqual({
    version: availableVersions.recommended,
    recommended: availableVersions.recommended,
    "recommended-beta": availableVersions["recommended-beta"],
  }, {
    version: "3.2.10",
    recommended: "3.2.10",
    "recommended-beta": "",
  });
  assert.equal(bundledVersion.version, "3.2.10");
  assert.match(versionedInstallerCore, /`\.\/live-translator-installer\/\$\{VERSION_FILE_NAME\}`/);
  assert.match(versionedInstallerCore, /\.\.\/\.\.\/info\/translator-version\.json/);
});

test("version manifest helpers normalize categories into unique route entries", () => {
  const manifest = normalizeAvailableVersionsManifest({
    Recommended: " 3.2.10 ",
    "recommended-beta": "3.3.0b10",
    Stable: ["3.2.10", "3.2.9", "3.2.9"],
    Prerelease: ["3.3.0-beta.1"],
  });

  assert.deepEqual(manifest, {
    recommended: "3.2.10",
    recommendedBeta: "3.3.0b10",
    stable: ["3.2.10", "3.2.9"],
    prerelease: ["3.3.0-beta.1"],
  });

  const sections = createVersionSections(manifest);
  assert.deepEqual({
    recommended: sections.recommended.map((entry) => ({
      version: entry.version,
      href: entry.href,
      category: entry.category,
    })),
    recommendedBeta: sections.recommendedBeta.map((entry) => ({
      version: entry.version,
      href: entry.href,
      category: entry.category,
    })),
    prerelease: sections.prerelease.map((entry) => ({
      version: entry.version,
      href: entry.href,
      category: entry.category,
    })),
    stable: sections.stable.map((entry) => ({
      version: entry.version,
      href: entry.href,
      category: entry.category,
    })),
  }, {
    recommended: [
      { version: "3.2.10", href: "translator/", category: "recommended" },
    ],
    recommendedBeta: [
      { version: "3.3.0b10", href: "translator/3.3.0b10/", category: "recommendedBeta" },
    ],
    prerelease: [
      { version: "3.3.0-beta.1", href: "translator/3.3.0-beta.1/", category: "prerelease" },
    ],
    stable: [
      { version: "3.2.10", href: "translator/3.2.10/", category: "stable" },
      { version: "3.2.9", href: "translator/3.2.9/", category: "stable" },
    ],
  });
});

test("version routes are enabled only when the listed directory is available", async () => {
  const sections = createVersionSections({
    recommended: "3.2.10",
    "recommended-beta": "3.3.0b10",
    stable: ["missing-version"],
    prerelease: ["../unsafe"],
  });
  const requestedUrls = [];
  const resolved = await resolveVersionSections(sections, {
    baseUrl: "https://example.test/site/",
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      return {
        ok: !String(url).includes("missing-version"),
      };
    },
  });

  assert.equal(createVersionPath("3.2.10"), "translator/3.2.10/");
  assert.equal(createRecommendedVersionPath("3.2.10"), "translator/");
  assert.equal(createVersionPath("../unsafe"), null);
  assert.deepEqual(requestedUrls, [
    "https://example.test/site/translator/",
    "https://example.test/site/translator/3.2.10/",
    "https://example.test/site/translator/3.3.0b10/",
    "https://example.test/site/translator/missing-version/",
  ]);
  assert.deepEqual({
    recommended: resolved.recommended.map((entry) => ({
      version: entry.version,
      href: entry.href,
      available: entry.available,
      availabilityKey: entry.availabilityKey,
    })),
    recommendedBeta: resolved.recommendedBeta.map((entry) => ({
      version: entry.version,
      href: entry.href,
      available: entry.available,
      availabilityKey: entry.availabilityKey,
    })),
    prerelease: resolved.prerelease.map((entry) => ({
      version: entry.version,
      href: entry.href,
      available: entry.available,
      availabilityKey: entry.availabilityKey,
    })),
    stable: resolved.stable.map((entry) => ({
      version: entry.version,
      href: entry.href,
      available: entry.available,
      availabilityKey: entry.availabilityKey,
    })),
  }, {
    recommended: [
      {
        version: "3.2.10",
        href: "translator/",
        available: true,
        availabilityKey: "status.available",
      },
    ],
    recommendedBeta: [
      {
        version: "3.3.0b10",
        href: "translator/3.3.0b10/",
        available: true,
        availabilityKey: "status.available",
      },
    ],
    prerelease: [
      {
        version: "../unsafe",
        href: null,
        available: false,
        availabilityKey: "status.unavailable",
      },
    ],
    stable: [
      {
        version: "missing-version",
        href: "translator/missing-version/",
        available: false,
        availabilityKey: "status.unavailable",
      },
    ],
  });
});
