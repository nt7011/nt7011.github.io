import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigGroups,
  cloneConfigSet,
  configDraftsEqual,
  formatIgnoreTranslationRegexRules,
  getValueAtPath,
  mergeConfigDefaults,
  normalizeIgnoreTranslationRegexFlags,
  normalizeIgnoreTranslationRegexInput,
  parseIgnoreTranslationRegexRule,
  setValueAtPath,
  validateIgnoreTranslationRegexValue,
  validateNumberValue,
} from "../config-editor.mjs";

test("buildConfigGroups flattens nested objects and arrays into editable fields", () => {
  const groups = buildConfigGroups({
    provider: "deepl",
    settings: {
      local: {
        model: "gemma",
        temperature: 0.8,
      },
      deepl: {
        apiKey: "secret",
      },
      suppressExact: [
        { regex: "^skip$" },
        "raw message",
      ],
    },
  });

  assert.deepEqual(
    groups.map((group) => ({
      label: group.label,
      fields: group.fields.map((field) => ({
        label: field.label,
        inputKind: field.inputKind,
      })),
    })),
    [
      {
        label: "General",
        fields: [
          { label: "provider", inputKind: "text" },
        ],
      },
      {
        label: "settings",
        fields: [
          { label: "local.model", inputKind: "text" },
          { label: "local.temperature", inputKind: "number" },
          { label: "deepl.apiKey", inputKind: "secret" },
          { label: "suppressExact[0].regex", inputKind: "textarea" },
          { label: "suppressExact[1]", inputKind: "text" },
        ],
      },
    ],
  );
});

test("setValueAtPath updates nested objects without rebuilding the whole config", () => {
  const draft = cloneConfigSet({
    settings: {
      logging: {
        enabled: true,
      },
      suppressExact: [
        { regex: "^skip$" },
      ],
    },
    translator: {
      settings: {
        local: {
          temperature: 0.8,
        },
      },
    },
  });

  setValueAtPath(draft.settings, ["logging", "enabled"], false);
  setValueAtPath(draft.settings, ["suppressExact", 0, "regex"], "^keep$");
  setValueAtPath(draft.translator, ["settings", "local", "temperature"], 1.1);

  assert.equal(draft.settings.logging.enabled, false);
  assert.equal(draft.settings.suppressExact[0].regex, "^keep$");
  assert.equal(draft.translator.settings.local.temperature, 1.1);
  assert.equal(
    configDraftsEqual(draft, {
      settings: {
        logging: {
          enabled: true,
        },
        suppressExact: [
          { regex: "^skip$" },
        ],
      },
      translator: {
        settings: {
          local: {
            temperature: 0.8,
          },
        },
      },
    }),
    false,
  );
});

test("setValueAtPath creates missing nested containers and getValueAtPath reads them back", () => {
  const draft = cloneConfigSet({
    translator: {},
  });

  setValueAtPath(draft.translator, ["settings", "deepl", "apiKey"], "abc123");
  setValueAtPath(draft.translator, ["settings", "local", "port"], 1234);

  assert.equal(getValueAtPath(draft.translator, ["settings", "deepl", "apiKey"]), "abc123");
  assert.equal(getValueAtPath(draft.translator, ["settings", "local", "port"]), 1234);
  assert.equal(getValueAtPath(draft.translator, ["settings", "local", "model"]), undefined);
});

test("mergeConfigDefaults preserves old values while keeping restored default fields", () => {
  const restoredDefaults = {
    settings: {
      translation: {
        disableCjkFilter: false,
        maxOutputTokens: 512,
      },
      gameMessage: {
        textScale: 100,
      },
    },
    translator: {
      provider: "local",
      settings: {
        local: {
          model: "default-model",
          temperature: 0.7,
        },
        deepl: {
          apiKey: "________NONE________",
        },
      },
    },
  };
  const preservedDraft = {
    settings: {
      translation: {
        disableCjkFilter: true,
      },
      gameMessage: "old-invalid-section",
      customSetting: "keep-me",
    },
    translator: {
      provider: "deepl",
      settings: {
        local: {
          model: "saved-model",
        },
        deepl: "old-invalid-section",
      },
    },
  };

  const merged = mergeConfigDefaults(restoredDefaults, preservedDraft);

  assert.deepEqual(merged, {
    settings: {
      translation: {
        disableCjkFilter: true,
        maxOutputTokens: 512,
      },
      gameMessage: {
        textScale: 100,
      },
      customSetting: "keep-me",
    },
    translator: {
      provider: "deepl",
      settings: {
        local: {
          model: "saved-model",
          temperature: 0.7,
        },
        deepl: {
          apiKey: "________NONE________",
        },
      },
    },
  });

  merged.settings.translation.maxOutputTokens = 1024;
  assert.equal(restoredDefaults.settings.translation.maxOutputTokens, 512);
});

test("validateNumberValue enforces integer and range constraints", () => {
  assert.equal(validateNumberValue(100, { integer: true, min: 1, max: 100 }), true);
  assert.equal(validateNumberValue(0, { integer: true, min: 1, max: 100 }), false);
  assert.equal(validateNumberValue(101, { integer: true, min: 1, max: 100 }), false);
  assert.equal(validateNumberValue(50.5, { integer: true, min: 1, max: 100 }), false);
  assert.equal(validateNumberValue(50.5, { min: 1, max: 100 }), true);
});

test("normalizeIgnoreTranslationRegexInput trims blank lines and validates rules", () => {
  const result = normalizeIgnoreTranslationRegexInput(`
    ^skip$

    /coords:\\s*\\d+/i
  `);

  assert.deepEqual(result.rules, [
    "^skip$",
    "/coords:\\s*\\d+/i",
  ]);
  assert.deepEqual(result.errors, []);
});

test("normalizeIgnoreTranslationRegexInput reports unsupported flags and invalid regex syntax", () => {
  const result = normalizeIgnoreTranslationRegexInput(`
    /skip/g
    (
  `);

  assert.deepEqual(
    result.errors.map((error) => ({
      code: error.code,
      line: error.line,
    })),
    [
      { code: "unsupportedFlags", line: 2 },
      { code: "invalid", line: 3 },
    ],
  );
});

test("normalizeIgnoreTranslationRegexInput blocks quote-wrapped regex lines", () => {
  const result = normalizeIgnoreTranslationRegexInput(`
    "^\\u5750\\u6807[^A-Za-z]+$"
    '/menu/i'
  `);

  assert.deepEqual(result.rules, [
    "\"^\\u5750\\u6807[^A-Za-z]+$\"",
    "'/menu/i'",
  ]);
  assert.deepEqual(
    result.errors.map((error) => ({
      code: error.code,
      line: error.line,
    })),
    [
      { code: "quoted", line: 2 },
      { code: "quoted", line: 3 },
    ],
  );
});

test("validateIgnoreTranslationRegexValue requires an array of regex strings", () => {
  assert.deepEqual(validateIgnoreTranslationRegexValue(undefined), []);
  assert.deepEqual(validateIgnoreTranslationRegexValue("skip").map((error) => error.code), ["notArray"]);
  assert.deepEqual(validateIgnoreTranslationRegexValue(["^skip$", 123]).map((error) => error.code), ["notString"]);
});

test("normalizeIgnoreTranslationRegexInput does not impose rule count or length limits", () => {
  const longRule = `^${"a".repeat(2000)}$`;
  const manyRules = Array.from({ length: 150 }, (_, index) => `^rule${index}$`);
  const result = normalizeIgnoreTranslationRegexInput([longRule, ...manyRules].join("\n"));

  assert.equal(result.rules.length, 151);
  assert.deepEqual(result.errors, []);
});

test("parseIgnoreTranslationRegexRule and normalizeIgnoreTranslationRegexFlags match translator syntax", () => {
  assert.deepEqual(parseIgnoreTranslationRegexRule("/skip/i"), {
    flags: "i",
    pattern: "skip",
    slashForm: true,
  });
  assert.deepEqual(parseIgnoreTranslationRegexRule("^skip$"), {
    flags: "",
    pattern: "^skip$",
    slashForm: false,
  });
  assert.deepEqual(normalizeIgnoreTranslationRegexFlags("mi"), {
    error: false,
    flags: "imu",
    unsupportedFlags: "",
  });
  assert.equal(normalizeIgnoreTranslationRegexFlags("g").error, true);
});

test("formatIgnoreTranslationRegexRules keeps the array editable as one rule per line", () => {
  assert.equal(formatIgnoreTranslationRegexRules(["^skip$", "/coords/i"]), "^skip$\n/coords/i");
  assert.equal(formatIgnoreTranslationRegexRules(undefined), "");
  assert.equal(formatIgnoreTranslationRegexRules("legacy"), "legacy");
});
