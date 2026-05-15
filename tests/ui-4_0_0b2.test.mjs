import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(...segments) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("4.0.0b2 hides the empty config editor section in static markup", () => {
  const betaHtml = readProjectFile("translator", "4.0.0b2", "index.html");
  const stableHtml = readProjectFile("translator", "3.2.10", "index.html");

  assert.match(
    betaHtml,
    /<section id="config-editor-section"[^>]*\shidden(?:\s|>)/u,
  );
  assert.doesNotMatch(
    betaHtml,
    /<p class="config-empty" data-i18n="config.empty">/u,
  );
  assert.match(
    stableHtml,
    /<p class="config-empty" data-i18n="config.empty">/u,
  );
});
