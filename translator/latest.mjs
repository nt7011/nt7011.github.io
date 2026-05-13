const VERSION_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function loadRecommendedTranslatorVersion({
  fetchImpl = globalThis.fetch,
  infoUrl = new URL("../info/translator-version.json", import.meta.url),
  manifestUrl = new URL("../available-versions.json", import.meta.url),
} = {}) {
  const info = await fetchJson(infoUrl, fetchImpl);
  const infoVersion = normalizeVersion(info?.recommended) ?? normalizeVersion(info?.version);
  if (infoVersion) {
    return infoVersion;
  }

  const manifest = await fetchJson(manifestUrl, fetchImpl);
  return normalizeVersion(manifest?.recommended) ?? normalizeVersion(manifest?.Recommended);
}

export function createVersionPageUrl(version, baseUrl = import.meta.url) {
  if (!VERSION_PATH_PATTERN.test(version)) {
    return null;
  }

  return new URL(`./${encodeURIComponent(version)}/index.html`, baseUrl);
}

export function createVersionAssetUrl(version, assetPath, baseUrl = import.meta.url) {
  if (!VERSION_PATH_PATTERN.test(version)) {
    return null;
  }

  return new URL(`./${encodeURIComponent(version)}/${assetPath}`, baseUrl);
}

export function rewriteLatestRouteHref(href) {
  if (href === "../../") {
    return "../";
  }

  if (href.startsWith("../../cheats/")) {
    return href.replace("../../cheats/", "../cheats/");
  }

  return href;
}

async function fetchJson(url, fetchImpl) {
  if (typeof fetchImpl !== "function") {
    return null;
  }

  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

function normalizeVersion(version) {
  const normalized = typeof version === "string" ? version.trim() : "";
  return VERSION_PATH_PATTERN.test(normalized) ? normalized : null;
}

async function initializeLatestTranslatorPage() {
  const version = await loadRecommendedTranslatorVersion();
  if (!version) {
    throw new Error("No recommended translator version is available.");
  }

  const pageUrl = createVersionPageUrl(version);
  const appUrl = createVersionAssetUrl(version, "app.mjs");
  if (!pageUrl || !appUrl) {
    throw new Error(`Recommended translator version is not routable: ${version}`);
  }

  const response = await fetch(pageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load translator ${version} (${response.status}).`);
  }

  const versionDocument = new DOMParser().parseFromString(await response.text(), "text/html");
  rewriteVersionPageForLatestRoute(versionDocument, version);
  document.documentElement.lang = versionDocument.documentElement.lang || document.documentElement.lang;
  document.title = versionDocument.title || document.title;
  document.head.replaceChildren(...Array.from(versionDocument.head.childNodes));
  document.body.replaceWith(versionDocument.body);
  await import(appUrl.href);
}

function rewriteVersionPageForLatestRoute(versionDocument, version) {
  for (const link of versionDocument.querySelectorAll('link[rel="stylesheet"][href="./styles.css"]')) {
    link.setAttribute("href", `./${version}/styles.css`);
  }

  for (const anchor of versionDocument.querySelectorAll("a[href]")) {
    anchor.setAttribute("href", rewriteLatestRouteHref(anchor.getAttribute("href")));
  }

  for (const script of versionDocument.querySelectorAll('script[type="module"][src="./app.mjs"]')) {
    script.remove();
  }
}

function renderFailure(error) {
  console.error(error);
  document.body.replaceChildren();
  const main = document.createElement("main");
  const paragraph = document.createElement("p");
  paragraph.textContent = "Unable to load the recommended translator installer.";
  main.append(paragraph);
  document.body.append(main);
}

if (typeof document !== "undefined") {
  initializeLatestTranslatorPage().catch(renderFailure);
}
