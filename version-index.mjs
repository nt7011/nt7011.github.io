export const AVAILABLE_VERSIONS_URL = new URL("./available-versions.json", import.meta.url);

const VERSION_FIELD_ALIASES = {
  recommended: ["recommended", "Recommended"],
  stable: ["stable", "Stable"],
  prerelease: ["prerelease", "Prerelease", "preRelease", "PreRelease"],
};

const VERSION_SECTIONS = [
  {
    id: "recommended",
    headingKey: "section.recommended.heading",
    ariaLabelKey: "section.recommended.ariaLabel",
  },
  {
    id: "prerelease",
    headingKey: "section.prerelease.heading",
    ariaLabelKey: "section.prerelease.ariaLabel",
  },
  {
    id: "stable",
    headingKey: "section.stable.heading",
    ariaLabelKey: "section.stable.ariaLabel",
  },
];

const VERSION_INDEX_COPY = {
  en: {
    "document.title": "RPG MV/MZ Live Translator Installer Versions",
    "page.eyebrow": "Web based installer",
    "page.heading": "RPG Maker MV/MZ Live Translator",
    "versions.heading": "Available versions",
    "section.recommended.heading": "Recommended",
    "section.recommended.ariaLabel": "Recommended translator installer version",
    "section.prerelease.heading": "Prerelease versions",
    "section.prerelease.ariaLabel": "Prerelease translator installer versions",
    "section.stable.heading": "Stable versions",
    "section.stable.ariaLabel": "Stable translator installer versions",
    "label.recommended": "Recommended",
    "label.prerelease": "Prerelease",
    "label.stable": "Stable",
    "status.available": "Available",
    "status.unavailable": "Unavailable",
  },
  ko: {
    "document.title": "RPG MV/MZ 실시간 번역기 설치 버전",
    "page.eyebrow": "웹 기반 설치기",
    "page.heading": "RPG Maker MV/MZ 실시간 번역기",
    "versions.heading": "사용 가능한 버전",
    "section.recommended.heading": "추천 버전",
    "section.recommended.ariaLabel": "추천 번역기 설치 버전",
    "section.prerelease.heading": "시험판 버전",
    "section.prerelease.ariaLabel": "시험판 번역기 설치 버전",
    "section.stable.heading": "안정 버전",
    "section.stable.ariaLabel": "안정 번역기 설치 버전",
    "label.recommended": "추천",
    "label.prerelease": "시험판",
    "label.stable": "안정",
    "status.available": "사용 가능",
    "status.unavailable": "사용 불가",
  },
};

const VERSION_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function normalizeAvailableVersionsManifest(manifest) {
  const source = manifest && typeof manifest === "object" ? manifest : {};

  return {
    recommended: normalizeRecommendedVersion(readAliasedField(source, VERSION_FIELD_ALIASES.recommended)),
    stable: normalizeVersionList(readAliasedField(source, VERSION_FIELD_ALIASES.stable)),
    prerelease: normalizeVersionList(readAliasedField(source, VERSION_FIELD_ALIASES.prerelease)),
  };
}

export function createVersionEntries(manifest) {
  return flattenVersionSections(createVersionSections(manifest));
}

export function createVersionSections(manifest) {
  const normalized = normalizeAvailableVersionsManifest(manifest);

  return {
    recommended: normalized.recommended
      ? [createRecommendedVersionEntry(normalized.recommended)]
      : [],
    prerelease: normalized.prerelease.map((version) => (
      createVersionEntry(version, "prerelease", createVersionPath(version))
    )),
    stable: normalized.stable.map((version) => (
      createVersionEntry(version, "stable", createVersionPath(version))
    )),
  };
}

export function createVersionPath(version) {
  if (!isRoutableVersion(version)) {
    return null;
  }

  return `translator/${encodeURIComponent(version)}/`;
}

export function createRecommendedVersionPath(version) {
  if (!isRoutableVersion(version)) {
    return null;
  }

  return "translator/";
}

export async function loadAvailableVersionsManifest(
  url = AVAILABLE_VERSIONS_URL,
  { fetchImpl = globalThis.fetch } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Version manifest loading requires fetch.");
  }

  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load available-versions.json (${response.status}).`);
  }

  return normalizeAvailableVersionsManifest(await response.json());
}

export async function resolveVersionEntries(entries, options = {}) {
  const resolved = [];

  for (const entry of entries) {
    resolved.push(await resolveVersionEntry(entry, options));
  }

  return resolved;
}

export async function resolveVersionSections(sections, options = {}) {
  const resolvedEntries = await resolveVersionEntries(flattenVersionSections(sections), options);
  const resolvedSections = {};

  for (const section of VERSION_SECTIONS) {
    resolvedSections[section.id] = [];
  }

  for (const entry of resolvedEntries) {
    resolvedSections[entry.section].push(entry);
  }

  return resolvedSections;
}

export async function resolveVersionEntry(
  entry,
  {
    baseUrl = typeof document === "undefined" ? import.meta.url : document.baseURI,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  const href = entry.href ?? createVersionPath(entry.version);
  if (!href || typeof fetchImpl !== "function") {
    return markVersionUnavailable(entry, href);
  }

  try {
    for (const probeHref of entry.probeHrefs ?? [href]) {
      const response = await fetchImpl(new URL(probeHref, baseUrl), { cache: "no-store" });
      if (!response.ok) {
        return markVersionUnavailable(entry, href);
      }
    }
  } catch {
    return markVersionUnavailable(entry, href);
  }

  return {
    ...entry,
    href,
    available: true,
    availabilityKey: "status.available",
  };
}

function readAliasedField(source, aliases) {
  for (const alias of aliases) {
    if (Object.hasOwn(source, alias)) {
      return source[alias];
    }
  }

  return undefined;
}

function normalizeRecommendedVersion(value) {
  if (Array.isArray(value)) {
    return normalizeVersionName(value[0]);
  }

  return normalizeVersionName(value);
}

function normalizeVersionList(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const versions = [];

  for (const item of values) {
    const version = normalizeVersionName(item);
    if (version && !versions.includes(version)) {
      versions.push(version);
    }
  }

  return versions;
}

function normalizeVersionName(value) {
  return typeof value === "string" ? value.trim() || null : null;
}

function createVersionEntry(version, category, href) {
  return {
    version,
    category,
    section: category,
    href,
    probeHrefs: href ? [href] : [],
  };
}

function createRecommendedVersionEntry(version) {
  const href = createRecommendedVersionPath(version);
  const versionHref = createVersionPath(version);

  return {
    version,
    category: "recommended",
    section: "recommended",
    href,
    probeHrefs: href && versionHref ? [href, versionHref] : [],
  };
}

function flattenVersionSections(sections) {
  return VERSION_SECTIONS.flatMap((section) => sections[section.id] ?? []);
}

function isRoutableVersion(version) {
  return typeof version === "string" && VERSION_PATH_PATTERN.test(version);
}

function markVersionUnavailable(entry, href) {
  return {
    ...entry,
    href,
    available: false,
    availabilityKey: "status.unavailable",
  };
}

async function initializeVersionIndex() {
  const versionSections = document.querySelector("#version-index-sections");
  const t = createVersionIndexTranslator(detectVersionIndexLocale(window.navigator));

  applyStaticTranslations(t);

  try {
    const manifest = await loadAvailableVersionsManifest();
    const sections = createVersionSections(manifest);
    const resolvedSections = await resolveVersionSections(sections);
    renderVersionSections(versionSections, resolvedSections, t);
  } catch (error) {
    console.error(error);
    versionSections.replaceChildren();
  }
}

function applyStaticTranslations(t) {
  document.documentElement.lang = t.locale;
  document.title = t("document.title");

  for (const element of document.querySelectorAll("[data-version-i18n]")) {
    element.textContent = t(element.dataset.versionI18n);
  }
}

function renderVersionSections(versionSections, sections, t) {
  versionSections.replaceChildren(...VERSION_SECTIONS.map((section) => (
    createVersionSection(section, sections[section.id] ?? [], t)
  )));
}

function createVersionSection(section, entries, t) {
  const container = document.createElement("section");
  const headingId = `version-index-${section.id}-heading`;
  const heading = document.createElement("h2");
  const list = document.createElement("ul");

  container.className = "version-index-section";
  heading.id = headingId;
  heading.textContent = t(section.headingKey);
  list.className = "version-index-list";
  list.setAttribute("aria-labelledby", headingId);
  list.setAttribute("aria-label", t(section.ariaLabelKey));
  list.replaceChildren(...entries.map((entry) => createVersionListItem(entry, t)));

  container.append(heading, list);
  return container;
}

function createVersionListItem(entry, t) {
  const item = document.createElement("li");
  const container = entry.available && entry.href
    ? document.createElement("a")
    : document.createElement("span");

  container.className = "version-index-link";
  if (entry.available && entry.href) {
    container.href = entry.href;
  } else {
    container.classList.add("is-unavailable");
    container.setAttribute("aria-disabled", "true");
  }

  const main = document.createElement("span");
  main.className = "version-index-main";

  const version = document.createElement("span");
  version.className = "version-index-version";
  version.textContent = entry.version;

  const categories = document.createElement("span");
  categories.className = "version-index-categories";
  categories.textContent = t(`label.${entry.category}`);

  main.append(version, categories);

  const availability = document.createElement("span");
  availability.className = `version-index-availability ${entry.available ? "is-available" : "is-unavailable"}`;
  availability.textContent = t(entry.availabilityKey);

  container.append(main, availability);
  item.append(container);

  return item;
}

function detectVersionIndexLocale(navigatorObject) {
  const languages = navigatorObject?.languages?.length
    ? navigatorObject.languages
    : [navigatorObject?.language];

  for (const language of languages) {
    const locale = String(language ?? "").toLowerCase();
    if (locale === "ko" || locale.startsWith("ko-")) {
      return "ko";
    }
  }

  return "en";
}

function createVersionIndexTranslator(locale) {
  const messages = VERSION_INDEX_COPY[locale] ?? VERSION_INDEX_COPY.en;
  const fallback = VERSION_INDEX_COPY.en;

  const translate = (key) => messages[key] ?? fallback[key] ?? key;
  translate.locale = locale;
  return translate;
}

if (typeof document !== "undefined") {
  initializeVersionIndex();
}
