import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");

test("Pages workflow publishes translator version data inside the installer bundle", async () => {
  const workflow = await readFile(
    path.join(repoRoot, ".github", "workflows", "update-translator-pages.yml"),
    "utf8",
  );

  assert.match(workflow, /rm -f version\.json/);
  assert.match(workflow, /cp _upstream\/version\.json \.\/live-translator-installer\/version\.json/);
  assert.match(workflow, /::warning::Missing version\.json/);
  assert.doesNotMatch(workflow, /test -f live-translator-installer\/version\.json/);
  assert.doesNotMatch(workflow, /::error::Missing version\.json/);
  assert.doesNotMatch(workflow, /cp _upstream\/version\.json \.\/version\.json/);
});
