import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "..");

test("Pages workflow publishes translator version data for install and static checks", async () => {
  const workflow = await readFile(
    path.join(repoRoot, ".github", "workflows", "update-translator-pages.yml"),
    "utf8",
  );

  assert.match(workflow, /rm -f version\.json/);
  assert.match(workflow, /available-versions\.json/);
  assert.match(workflow, /recommended/);
  assert.match(workflow, /recommended-beta/);
  assert.match(workflow, /recommendedBeta/);
  assert.match(workflow, /stable/);
  assert.match(workflow, /prerelease/);
  assert.match(workflow, /release_branch="release"/);
  assert.match(workflow, /tag="dist-\$version"/);
  assert.match(workflow, /git clone --depth 1 --branch "\$release_branch" --no-tags https:\/\/github\.com\/nt7011\/RPG-Maker-Live-Translator\.git "\$source_dir"/);
  assert.match(workflow, /git -C "\$source_dir" fetch --depth 1 origin "refs\/tags\/\$tag:refs\/tags\/\$tag"/);
  assert.match(workflow, /git -C "\$source_dir" checkout --detach "\$tag"/);
  assert.match(workflow, /translator\/\$version/);
  assert.match(workflow, /find translator -path '\*\/live-translator-installer'/);
  assert.match(workflow, /cp "\$source_dir\/version\.json" "\$source_dir\/live-translator-installer\/version\.json"/);
  assert.match(workflow, /printf '\{\\n  "version": "%s"\\n\}\\n' "\$version"/);
  assert.match(workflow, /mkdir -p "\$target"/);
  assert.match(workflow, /cp -R "\$source_dir\/live-translator-installer" "\$target\/live-translator-installer"/);
  assert.match(workflow, /mkdir -p info/);
  assert.match(workflow, /Recommended version page \$\{recommendedPage\} is missing\./);
  assert.match(workflow, /fs\.writeFileSync\("translator\/index\.html", latestTranslatorPage\)/);
  assert.match(workflow, /replaceAll\('href="\.\/styles\.css"', `href="\.\/\$\{data\.recommended\}\/styles\.css"`\)/);
  assert.match(workflow, /replaceAll\('src="\.\/app\.mjs"', `src="\.\/\$\{data\.recommended\}\/app\.mjs"`\)/);
  assert.match(workflow, /fs\.writeFileSync\("info\/translator-version\.json"/);
  assert.match(workflow, /version: data\.recommended/);
  assert.match(workflow, /recommended: data\.recommended/);
  assert.match(workflow, /"recommended-beta": data\.recommendedBeta/);
  assert.match(workflow, /::warning::Missing version\.json/);
  assert.match(workflow, /::error::Missing live-translator-installer in \$tag\./);
  assert.doesNotMatch(workflow, /branch="dist-\$version"/);
  assert.doesNotMatch(workflow, /git clone --depth 1 --branch "\$branch"/);
  assert.doesNotMatch(workflow, /rm -f info\/translator-version\.json/);
  assert.doesNotMatch(workflow, /test -f live-translator-installer\/version\.json/);
  assert.doesNotMatch(workflow, /ref: release/);
  assert.doesNotMatch(workflow, /repository: nt7011\/RPG-Maker-Live-Translator/);
  assert.doesNotMatch(workflow, /::error::Missing version\.json/);
  assert.doesNotMatch(workflow, /cp "\$target\/live-translator-installer\/version\.json" \.\/info\/translator-version\.json/);
  assert.doesNotMatch(workflow, /_upstream\/live-translator-installer/);
  assert.doesNotMatch(workflow, /_upstream\/version\.json/);
  assert.doesNotMatch(workflow, /cp _upstream\/version\.json \.\/version\.json/);
  assert.doesNotMatch(workflow, /cp -R _upstream\/live-translator-installer \.\/live-translator-installer/);
});
