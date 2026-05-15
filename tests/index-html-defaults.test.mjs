import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(...segments) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

function assertStaticDefaults(html) {
  assert.match(
    html,
    /<p id="translator-version" class="version-note is-neutral" aria-live="polite">Latest Stable: Unknown\s+About to Install: Unknown\s+Current Version: Unknown<\/p>/u,
  );
  assert.match(
    html,
    /<p id="support-note" class="support-note" data-i18n="support\.loadingBundle">Loading the installer bundle\.<\/p>/u,
  );
  assert.match(
    html,
    /<div id="dll-scanner-view" class="scanner-view" aria-live="polite">\s*<p class="section-note scanner-status is-neutral" data-i18n="scanner\.status\.loading">Loading the DLL scanner\.<\/p>\s*<\/div>/u,
  );
  assert.match(
    html,
    /<h2 data-i18n="section\.configuration">Live Translation Settings<\/h2>/u,
  );
  assert.match(
    html,
    /<p id="config-status" class="section-note is-neutral" data-i18n="config\.status\.loading">Loading configuration tools\.<\/p>/u,
  );
}

test("4.0.0b2 installer HTML defaults match the loading state", () => {
  const betaHtml = readProjectFile("translator", "4.0.0b2", "index.html");

  assertStaticDefaults(betaHtml);
  assert.match(
    betaHtml,
    /<section id="config-editor-section"[^>]*\shidden(?:\s|>)/u,
  );
  assert.doesNotMatch(
    betaHtml,
    /<p class="config-empty" data-i18n="config\.empty">/u,
  );
});
