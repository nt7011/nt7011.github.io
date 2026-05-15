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
  assert.match(workflow, /stable/);
  assert.match(workflow, /prerelease/);
  assert.match(workflow, /const recommendedBeta = normalizeVersion\(manifest\["recommended-beta"\]\)/);
  assert.match(workflow, /available-versions\.json must define one recommended-beta version\./);
  assert.match(workflow, /release_branch="release"/);
  assert.match(workflow, /tag="dist-\$version"/);
  assert.match(workflow, /payload_dir="live-translator"/);
  assert.match(workflow, /if \[ "\$version" = "3\.2\.10" \]; then/);
  assert.match(workflow, /payload_dir="live-translator-installer"/);
  assert.match(workflow, /file_index="\$target\/live-translator-files\.json"/);
  assert.match(workflow, /git clone --depth 1 --branch "\$release_branch" --no-tags https:\/\/github\.com\/nt7011\/RPG-Maker-Live-Translator\.git "\$source_dir"/);
  assert.match(workflow, /git -C "\$source_dir" fetch --depth 1 origin "refs\/tags\/\$tag:refs\/tags\/\$tag"/);
  assert.match(workflow, /git -C "\$source_dir" checkout --detach "\$tag"/);
  assert.match(workflow, /translator\/\$version/);
  assert.match(workflow, /find translator \\\( -path '\*\/live-translator-installer' -o -path '\*\/live-translator' \\\) -type d -prune -exec rm -rf \{\} \+/);
  assert.match(workflow, /find translator -name 'live-translator-files\.json' -type f -delete/);
  assert.match(workflow, /cp "\$source_dir\/version\.json" "\$source_dir\/\$payload_dir\/version\.json"/);
  assert.match(workflow, /printf '\{\\n  "version": "%s"\\n\}\\n' "\$version"/);
  assert.match(workflow, /payload_version="\$\(node -e "const fs=require\('fs'\); const data=JSON\.parse\(fs\.readFileSync\(process\.argv\[1\], 'utf8'\)\); process\.stdout\.write\(String\(data\.version \|\| ''\)\.trim\(\)\);" "\$source_dir\/\$payload_dir\/version\.json"\)"/);
  assert.match(workflow, /::error::Payload version \$payload_version in \$tag does not match available-versions entry \$version\./);
  assert.match(workflow, /mkdir -p "\$target"/);
  assert.match(workflow, /rm -rf "\$target\/live-translator"/);
  assert.match(workflow, /rm -f "\$target\/live-translator-files\.json"/);
  assert.match(workflow, /cp -R "\$source_dir\/\$payload_dir" "\$target\/\$payload_dir"/);
  assert.match(workflow, /PAYLOAD_ROOT="\$target\/\$payload_dir" PAYLOAD_INDEX="\$file_index" node <<'NODE'/);
  assert.match(workflow, /fs\.writeFileSync\(output, JSON\.stringify\(\{ files \}, null, 2\) \+ "\\n"\)/);
  assert.match(workflow, /mkdir -p info/);
  assert.match(workflow, /Recommended version page \$\{recommendedPage\} is missing\./);
  assert.match(workflow, /fs\.writeFileSync\("translator\/index\.html", latestTranslatorPage\)/);
  assert.match(workflow, /replaceAll\('href="\.\/styles\.css"', `href="\.\/\$\{data\.recommended\}\/styles\.css"`\)/);
  assert.match(workflow, /replaceAll\('src="\.\/app\.mjs"', `src="\.\/\$\{data\.recommended\}\/app\.mjs"`\)/);
  assert.match(workflow, /fs\.writeFileSync\("info\/translator-version\.json"/);
  assert.match(workflow, /recommended: data\.recommended/);
  assert.match(workflow, /"recommended-beta": data\.recommendedBeta/);
  assert.match(workflow, /::warning::Missing version\.json/);
  assert.match(workflow, /::error::Missing \$payload_dir in \$tag\./);
  assert.doesNotMatch(workflow, /branch="dist-\$version"/);
  assert.doesNotMatch(workflow, /git clone --depth 1 --branch "\$branch"/);
  assert.doesNotMatch(workflow, /rm -f info\/translator-version\.json/);
  assert.doesNotMatch(workflow, /test -f live-translator-installer\/version\.json/);
  assert.doesNotMatch(workflow, /ref: release/);
  assert.doesNotMatch(workflow, /repository: nt7011\/RPG-Maker-Live-Translator/);
  assert.doesNotMatch(workflow, /::error::Missing version\.json/);
  assert.doesNotMatch(workflow, /cp "\$target\/live-translator-installer\/version\.json" \.\/info\/translator-version\.json/);
  assert.doesNotMatch(workflow, /version: data\.recommended/);
  assert.doesNotMatch(workflow, /"RecommendedBeta"/);
  assert.doesNotMatch(workflow, /"Recommended-Beta"/);
  assert.doesNotMatch(workflow, /readField\(\[\s*"recommended-beta",\s*"recommendedBeta"/);
  assert.doesNotMatch(workflow, /_upstream\/live-translator-installer/);
  assert.doesNotMatch(workflow, /_upstream\/version\.json/);
  assert.doesNotMatch(workflow, /cp _upstream\/version\.json \.\/version\.json/);
  assert.doesNotMatch(workflow, /cp -R _upstream\/live-translator-installer \.\/live-translator-installer/);
});
