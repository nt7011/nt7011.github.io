import assert from "node:assert/strict";
import test from "node:test";

import {
  createTranslator,
  detectPreferredLocale,
  resolveLocale,
} from "../i18n.mjs";

test("detectPreferredLocale prefers Korean when navigator.languages includes ko", () => {
  const locale = detectPreferredLocale({
    languages: ["ko-KR", "en-US"],
    language: "en-US",
  });

  assert.equal(locale, "ko");
});

test("detectPreferredLocale falls back to English for unsupported languages", () => {
  const locale = detectPreferredLocale({
    languages: ["ja-JP"],
    language: "ja-JP",
  });

  assert.equal(locale, "en");
  assert.equal(resolveLocale("fr-FR"), "en");
});

test("createTranslator returns translated copy and interpolates placeholders", () => {
  const t = createTranslator("ko-KR");

  assert.equal(t("button.install"), "설치");
  assert.equal(t("button.reinstall"), "재설치");
  assert.equal(
    t("log.installComplete", { count: 3, path: "js/plugins/live-translator" }),
    "설치가 완료되었습니다. 플러그인 파일 3개를 기록하고 js/plugins/live-translator를 업데이트했습니다.",
  );
});

test("createTranslator includes cache-only provider copy", () => {
  const en = createTranslator("en-US");
  const ko = createTranslator("ko-KR");

  assert.equal(
    en("config.section.noneSettings.note"),
    "Disables new translation requests and uses translation-cache.log.",
  );
  assert.equal(
    en("provider.none.tooltip"),
    "Disable new translation requests and use only translation-cache.log.",
  );
  assert.equal(
    ko("config.section.noneSettings.note"),
    "새 번역 요청을 비활성화하고 translation-cache.log만 사용합니다.",
  );
});

test("createTranslator includes precacher reminder localization", () => {
  const en = createTranslator("en-US");
  const ko = createTranslator("ko-KR");

  assert.equal(en("precacher.beta"), "Beta");
  assert.equal(ko("precacher.beta"), "Beta");
  assert.equal(
    ko("precacher.description"),
    "Precacher는 파일에서 정적인 (게임 로직에 따라 바뀌지 않는) 텍스트를 미리 번역해 놓기 때문에 번역이 바로 표시됩니다.<br>게임을 실행한 뒤 <code>Control-Shift-P</code>를 눌러 대시보드를 여세요.",
  );
  assert.equal(
    ko("precacher.warning"),
    "알림: 동적 텍스트는 지원되지 않으며 앞으로도 지원되지 않습니다!",
  );
});

test("createTranslator includes reinstall save reminder localization", () => {
  const en = createTranslator("en-US");
  const ko = createTranslator("ko-KR");

  assert.equal(
    en("config.status.reinstallPreserved"),
    "Action required: click Save Config now. Configuration files on the disk were restored from scratch.",
  );
  assert.equal(
    ko("config.status.reinstallPreserved"),
    "작업 필요: 지금 설정 저장을 클릭하세요. 디스크의 설정 파일이 처음부터 다시 복원되었습니다.",
  );
});

test("createTranslator includes new settings field descriptions", () => {
  const en = createTranslator("en-US");
  const ko = createTranslator("ko-KR");

  assert.equal(
    en("field.textScaleOthers.description"),
    "Resizes most texts other than Game Message. Accepted values: integers from 1 to 100.",
  );
  assert.equal(
    en("field.checkUpdates.description"),
    "Automatically check for updates. Automatic updates are not supported. You will always be prompted to visit this webpage to update.",
  );
  assert.equal(
    en("field.gameMessage.originAwareLineBreaks.description"),
    "Ignores plugin-defined line break insertions on Game_Message. Enable if Game Messages have weird line breaks, and disable if the game starts acting strangely.",
  );
  assert.equal(
    en("field.ignoreTranslationRegex.description"),
    "Skips translation when source text matches any rule. One regex per line; plain patterns and /pattern/i are accepted.",
  );
  assert.equal(
    en("field.ignoreTranslationRegex.summary", { count: 0 }),
    "0 ignore rules are active.",
  );
  assert.equal(
    en("error.ignoreTranslationRegex.quoted", { line: 2 }),
    "ignoreTranslationRegex line 2 has surrounding quotes. Remove the first and last quote characters.",
  );
  assert.equal(
    ko("field.ignoreTranslationRegex.summary", { count: 3 }),
    "3개의 무시 규칙이 활성화되어 있습니다.",
  );
  assert.equal(
    ko("config.section.updates"),
    "업데이트",
  );
  assert.equal(
    ko("field.checkUpdates.description"),
    "새 업데이트를 주기적으로 확인합니다. 자동 업데이트는 지원되지 않으므로 이 페이지를 방문하여 업데이트를 하라는 문구가 표시됩니다.",
  );
  assert.equal(
    ko("error.ignoreTranslationRegex.quoted", { line: 2 }),
    "ignoreTranslationRegex 2번째 줄에 따옴표가 있습니다. 첫 번째와 마지막 따옴표를 제거하세요.",
  );
});
