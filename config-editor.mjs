export function cloneConfigSet(configs) {
  return JSON.parse(JSON.stringify(configs));
}

export function configDraftsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeConfigDefaults(defaultConfigs, preservedConfigs) {
  return mergeConfigValue(defaultConfigs, preservedConfigs);
}

export function getValueAtPath(target, path) {
  let current = target;
  for (const segment of path) {
    if (current === null || typeof current === "undefined") {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

export function buildConfigGroups(config) {
  if (!isContainer(config)) {
    return [{
      id: "general",
      label: "General",
      fields: [createField([], config)],
    }];
  }

  const groups = [];
  const rootFields = [];

  for (const [key, value] of Object.entries(config)) {
    if (isPrimitive(value)) {
      rootFields.push(createField([key], value));
      continue;
    }

    const fields = collectFields(value, [key], []);
    if (fields.length > 0) {
      groups.push({
        id: key,
        label: key,
        fields,
      });
    }
  }

  if (rootFields.length > 0) {
    groups.unshift({
      id: "general",
      label: "General",
      fields: rootFields,
    });
  }

  return groups;
}

export function setValueAtPath(target, path, value) {
  if (path.length === 0) {
    return value;
  }

  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (current[segment] === null || typeof current[segment] === "undefined") {
      current[segment] = typeof path[index + 1] === "number" ? [] : {};
    }
    current = current[segment];
  }

  current[path[path.length - 1]] = value;
  return target;
}

export function validateNumberValue(value, options = {}) {
  if (!Number.isFinite(value)) {
    return false;
  }

  if (options.integer && !Number.isInteger(value)) {
    return false;
  }

  if (typeof options.min === "number" && value < options.min) {
    return false;
  }

  if (typeof options.max === "number" && value > options.max) {
    return false;
  }

  return true;
}

const IGNORE_TRANSLATION_REGEX_FLAG_ORDER = ["i", "m", "s", "u"];
const IGNORE_TRANSLATION_REGEX_ALLOWED_FLAGS = new Set(IGNORE_TRANSLATION_REGEX_FLAG_ORDER);

export function formatIgnoreTranslationRegexRules(value) {
  if (Array.isArray(value)) {
    return value.map((rule) => String(rule ?? "")).join("\n");
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  return String(value);
}

export function normalizeIgnoreTranslationRegexInput(input) {
  const lines = String(input ?? "").split(/\r\n|\n|\r/u);
  const rules = [];
  const errors = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rule = String(lines[index] ?? "").trim();
    if (!rule) {
      continue;
    }

    rules.push(rule);
    errors.push(...validateIgnoreTranslationRegexRule(rule, index + 1));
  }

  return {
    errors,
    rules,
  };
}

export function validateIgnoreTranslationRegexValue(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return [];
  }

  if (!Array.isArray(value)) {
    return [{ code: "notArray" }];
  }

  const errors = [];

  value.forEach((rule, index) => {
    if (typeof rule !== "string") {
      errors.push({
        code: "notString",
        index,
        line: index + 1,
      });
      return;
    }

    if (!rule.trim()) {
      return;
    }

    errors.push(...validateIgnoreTranslationRegexRule(rule.trim(), index + 1));
  });

  return errors;
}

export function parseIgnoreTranslationRegexRule(rawRule) {
  const value = String(rawRule || "").trim();
  if (!value) {
    return { flags: "", pattern: "", slashForm: false };
  }

  if (value.charAt(0) === "/") {
    const lastSlash = value.lastIndexOf("/");
    if (lastSlash > 0 && /^[A-Za-z]*$/u.test(value.slice(lastSlash + 1))) {
      return {
        flags: value.slice(lastSlash + 1),
        pattern: value.slice(1, lastSlash),
        slashForm: true,
      };
    }
  }

  return { flags: "", pattern: value, slashForm: false };
}

export function normalizeIgnoreTranslationRegexFlags(rawFlags) {
  const seen = { u: true };
  for (const flag of String(rawFlags || "")) {
    if (!IGNORE_TRANSLATION_REGEX_ALLOWED_FLAGS.has(flag)) {
      return {
        error: true,
        flags: "u",
        unsupportedFlags: [...new Set(String(rawFlags || "").replace(/[imsu]/gu, ""))].join(""),
      };
    }
    seen[flag] = true;
  }

  return {
    error: false,
    flags: IGNORE_TRANSLATION_REGEX_FLAG_ORDER.filter((flag) => seen[flag]).join(""),
    unsupportedFlags: "",
  };
}

function collectFields(value, absolutePath, relativePath) {
  if (isPrimitive(value)) {
    return [createField(absolutePath, value, relativePath)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => (
      collectFields(item, [...absolutePath, index], [...relativePath, index])
    ));
  }

  if (isContainer(value)) {
    return Object.entries(value).flatMap(([key, childValue]) => (
      collectFields(childValue, [...absolutePath, key], [...relativePath, key])
    ));
  }

  return [createField(absolutePath, value, relativePath)];
}

function createField(path, value, relativePath = path) {
  const label = formatPath(relativePath);
  return {
    id: formatPath(path),
    inputKind: inferInputKind(path, value),
    label,
    path,
    value,
  };
}

function inferInputKind(path, value) {
  if (typeof value === "boolean") {
    return "checkbox";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "string") {
    const pathLabel = formatPath(path);
    if (/(api.?key|token|secret|password)/i.test(pathLabel)) {
      return "secret";
    }

    if (value.includes("\n") || value.length > 72 || /(prompt|regex)/i.test(pathLabel)) {
      return "textarea";
    }

    return "text";
  }

  return "text";
}

function formatPath(path) {
  if (path.length === 0) {
    return "value";
  }

  return path.reduce((label, segment) => (
    typeof segment === "number"
      ? `${label}[${segment}]`
      : label
        ? `${label}.${segment}`
        : segment
  ), "");
}

function isContainer(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrimitive(value) {
  return value === null || typeof value !== "object";
}

function mergeConfigValue(defaultValue, preservedValue) {
  if (typeof preservedValue === "undefined") {
    return cloneConfigValue(defaultValue);
  }

  if (isContainer(defaultValue)) {
    if (!isContainer(preservedValue)) {
      return cloneConfigValue(defaultValue);
    }

    const merged = {};
    for (const [key, value] of Object.entries(defaultValue)) {
      merged[key] = Object.prototype.hasOwnProperty.call(preservedValue, key)
        ? mergeConfigValue(value, preservedValue[key])
        : cloneConfigValue(value);
    }

    for (const [key, value] of Object.entries(preservedValue)) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        merged[key] = cloneConfigValue(value);
      }
    }

    return merged;
  }

  return cloneConfigValue(preservedValue);
}

function cloneConfigValue(value) {
  return typeof value === "undefined" ? undefined : cloneConfigSet(value);
}

function validateIgnoreTranslationRegexRule(rule, line) {
  const errors = [];

  if (hasMatchingOuterQuotes(rule)) {
    errors.push({
      code: "quoted",
      line,
    });
    return errors;
  }

  const parsed = parseIgnoreTranslationRegexRule(rule);
  if (!parsed.pattern) {
    errors.push({
      code: "empty",
      line,
    });
    return errors;
  }

  const normalizedFlags = normalizeIgnoreTranslationRegexFlags(parsed.flags);
  if (normalizedFlags.error) {
    errors.push({
      code: "unsupportedFlags",
      flags: parsed.flags,
      line,
      unsupportedFlags: normalizedFlags.unsupportedFlags,
    });
    return errors;
  }

  try {
    new RegExp(parsed.pattern, normalizedFlags.flags);
  } catch (error) {
    errors.push({
      code: "invalid",
      line,
      message: error?.message ? String(error.message) : String(error || "invalid regex"),
    });
  }

  return errors;
}

function hasMatchingOuterQuotes(value) {
  if (value.length < 2) {
    return false;
  }

  const first = value.charAt(0);
  return (first === "\"" || first === "'") && value.charAt(value.length - 1) === first;
}
