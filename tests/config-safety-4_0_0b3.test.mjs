import assert from "node:assert/strict";
import test from "node:test";

import {
  applyConfigSafetyOverrides,
  applyMissingConfigPathDefaults,
} from "../translator/4.0.0b3/installer-core.mjs";

test("4.0.0b3 config safety overrides force performanceMode off when present", () => {
  const configs = {
    settings: {
      diagnostics: {
        performanceMode: true,
      },
    },
    translator: {
      provider: "local",
    },
  };

  const result = applyConfigSafetyOverrides(configs);

  assert.equal(result.settings.diagnostics.performanceMode, false);
  assert.equal(configs.settings.diagnostics.performanceMode, true);
});

test("4.0.0b3 config safety overrides leave missing performanceMode absent", () => {
  const result = applyConfigSafetyOverrides({
    settings: {
      diagnostics: {},
    },
  });

  assert.deepEqual(result, {
    settings: {
      diagnostics: {},
    },
  });
});

test("4.0.0b3 defaulted performanceMode is saved off even if bundled defaults enable it", () => {
  const defaulted = applyMissingConfigPathDefaults(
    {
      settings: {
        diagnostics: {
          performanceMode: true,
        },
      },
    },
    {
      settings: {},
    },
    [["settings", "diagnostics", "performanceMode"]],
  );

  const result = applyConfigSafetyOverrides(defaulted.configs);

  assert.deepEqual(defaulted.defaultedFields, ["settings.json:diagnostics.performanceMode"]);
  assert.equal(result.settings.diagnostics.performanceMode, false);
});
