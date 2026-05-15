import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMissingConfigPathDefaults,
} from "../translator/4.0.0b1/installer-core.mjs";
import {
  formatPlaintextSubstitutionRules,
  formatTranslationRegexReplacementRules,
  normalizePlaintextSubstitutionInput,
  normalizeTranslationRegexReplacementInput,
  validatePlaintextSubstitutionValue,
  validateTranslationRegexReplacementValue,
} from "../translator/4.0.0b1/config-editor.mjs";
import {
  createTranslator,
} from "../translator/4.0.0b1/i18n.mjs";

test("4.0.0b1 overrideTranslationRegex editor uses regex replacement rules", () => {
  const result = normalizeTranslationRegexReplacementInput(`
    ^ゴールド:\\s*(\\d+)$ => Gold: $1
    /^体力:\\s*(\\d+)$/i => HP: $1
  `);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rules, [
    { regex: "^ゴールド:\\s*(\\d+)$", translation: "Gold: $1" },
    { regex: "/^体力:\\s*(\\d+)$/i", translation: "HP: $1" },
  ]);
  assert.equal(
    formatTranslationRegexReplacementRules(result.rules),
    "^ゴールド:\\s*(\\d+)$ => Gold: $1\n/^体力:\\s*(\\d+)$/i => HP: $1",
  );
  assert.deepEqual(validateTranslationRegexReplacementValue(result.rules), []);
});

test("4.0.0b1 overrideTranslationRegex enforces arrow grammar and regex validity", () => {
  const result = normalizeTranslationRegexReplacementInput(`
    ^NoArrow$
    /bad/g => ignored
  `);

  assert.deepEqual(
    result.errors.map((error) => ({
      code: error.code,
      line: error.line,
    })),
    [
      { code: "missingSeparator", line: 2 },
      { code: "unsupportedFlags", line: 3 },
    ],
  );
  assert.deepEqual(
    validateTranslationRegexReplacementValue(result.rules).map((error) => error.code),
    ["replacementNotString", "unsupportedFlags"],
  );
});

test("4.0.0b1 substitutePlaintextBeforeTranslation editor uses plaintext replacement rules", () => {
  const result = normalizePlaintextSubstitutionInput(`
    トム => Tom
    Tsukuru => つくる
  `);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rules, [
    { from: "トム", to: "Tom" },
    { from: "Tsukuru", to: "つくる" },
  ]);
  assert.equal(
    formatPlaintextSubstitutionRules(result.rules),
    "トム => Tom\nTsukuru => つくる",
  );
  assert.deepEqual(validatePlaintextSubstitutionValue(result.rules), []);
});

test("4.0.0b1 rule editor localization uses beta copy and Japanese examples", () => {
  const en = createTranslator("en-US");
  const ko = createTranslator("ko-KR");

  assert.equal(
    en("field.enableForesight.description"),
    "Peeks ahead and pre-translates upcoming Game Message text, including ones behind choices and conditions.",
  );
  assert.equal(
    en("field.overrideTranslationRegex.description"),
    "Static translation will be performed using user-defined regex rules. Use one rule per line in the form regex => translation.",
  );
  assert.equal(
    en("field.diagnostics.performanceMode.description"),
    "Keep minimal diagnostics for performance.",
  );
  assert.equal(
    en("field.overrideTranslationRegex.placeholder"),
    "^ゴールド:\\s*(\\d+)$ => Gold: $1\n/^体力:\\s*(\\d+)$/i => HP: $1",
  );
  assert.equal(
    en("field.substitutePlaintextBeforeTranslation.description"),
    "Original text will be replaced before going through the translation. Great for names. Use one rule per line in the form original => replacement.",
  );
  assert.equal(
    en("field.substitutePlaintextBeforeTranslation.placeholder"),
    "トム => Tom\nTsukuru => つくる",
  );
  assert.equal(
    ko("field.overrideTranslationRegex.description"),
    "정적 번역은 사용자가 정의한 정규식 규칙으로 수행됩니다. 한 줄에 regex => translation 형식으로 규칙 하나를 입력하세요.",
  );
  assert.equal(
    ko("field.enableForesight.description"),
    "선택지와 조건 뒤에 있는 텍스트를 포함해 앞으로 표시될 Game Message 텍스트를 미리 확인하고 사전 번역합니다.",
  );
  assert.equal(
    ko("field.diagnostics.performanceMode.description"),
    "성능을 위해 진단 정보를 최소한으로 유지합니다.",
  );
  assert.equal(
    ko("field.substitutePlaintextBeforeTranslation.description"),
    "번역을 거치기 전에 원본 텍스트를 대체합니다. 이름에 사용하기 좋습니다. 한 줄에 original => replacement 형식으로 규칙 하나를 입력하세요.",
  );
  assert.equal(
    ko("field.substitutePlaintextBeforeTranslation.placeholder"),
    "トム => Tom\nTsukuru => つくる",
  );
});

test("4.0.0b1 upgrade defaults backfill hidden and visible beta settings only when missing", () => {
  const defaultConfigs = {
    settings: {
      enableForesight: true,
      diagnostics: {
        performanceMode: true,
      },
      showForesightSpoilers: false,
      ignoreTranslationRegex: [],
      overrideTranslationRegex: [],
      substitutePlaintextBeforeTranslation: [],
    },
  };
  const installedConfigs = {
    settings: {
      enableForesight: false,
      ignoreTranslationRegex: ["^skip$"],
    },
  };

  const result = applyMissingConfigPathDefaults(defaultConfigs, installedConfigs, [
    ["settings", "enableForesight"],
    ["settings", "diagnostics", "performanceMode"],
    ["settings", "showForesightSpoilers"],
    ["settings", "ignoreTranslationRegex"],
    ["settings", "overrideTranslationRegex"],
    ["settings", "substitutePlaintextBeforeTranslation"],
  ]);

  assert.deepEqual(result.defaultedFields, [
    "settings.json:diagnostics.performanceMode",
    "settings.json:showForesightSpoilers",
    "settings.json:overrideTranslationRegex",
    "settings.json:substitutePlaintextBeforeTranslation",
  ]);
  assert.deepEqual(result.configs, {
    settings: {
      enableForesight: false,
      diagnostics: {
        performanceMode: true,
      },
      showForesightSpoilers: false,
      ignoreTranslationRegex: ["^skip$"],
      overrideTranslationRegex: [],
      substitutePlaintextBeforeTranslation: [],
    },
  });
  assert.deepEqual(installedConfigs, {
    settings: {
      enableForesight: false,
      ignoreTranslationRegex: ["^skip$"],
    },
  });
});
