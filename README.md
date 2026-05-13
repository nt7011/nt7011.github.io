# Web Installer for RPG MV/MZ Live Translator 

This is an alternative web-based installer for a RPG MV/MZ Translator plugin. Normally, users would invoke installer.ps1 to install the script. 

The actual translator project lives here: [RPG-Maker-Live-Translator](https://github.com/nt7011/RPG-Maker-Live-Translator).

## What it does

- Detects RPG Maker folder layouts using either `js/plugins` or `www/js/plugins`
- Copies the loader and support files from the selected version's `live-translator-installer/install-manifest.json`
- Adds the `live-translator-loader` entry to `plugins.js`
- Patches an empty `name` field in `package.json` to `Game` when needed
- Loads, edits, and saves installed `settings.json` and `translator.json`
- Scans DLL files based on all known NW.js releases
- Links to an updated NW.js ZIP for games that fail to launch with the bundled runtime

## Requirements

- A Chromium-based browser with the File System Access API, like Chrome or Edge
- A secure context: `https://`, `http://localhost`, or another loopback address
- Read/write permission to the target game folder

## How to use

1. Open the root page and choose an approved installer version.
2. Choose the target game folder.
3. Install the plugin bundle.
4. Edit `settings.json` and `translator.json` in the UI if needed, then save.

The root page loads `available-versions.json`, links the recommended version to
`/translator`, and enables stable/prerelease versions only when their
`/translator/<version>/` route is available. The pinned 3.2.10 installer is
available at `/translator/3.2.10`.

## Translation providers

- `deepl`: Requires a DeepL API key.
- `local`: Uses a locally hosted translation endpoint and configurable model settings.

## Repository layout

- `index.html`, `available-versions.json`, `version-index.mjs`: Dynamic version selector
- `translator/index.html`: Recommended-version alias served without redirecting
- `translator/<version>/`: Version-coupled installer UI, logic, scanner data, and payload
- `translator/<version>/live-translator-installer/`: Plugin files and shared install manifest copied into the game
- `game_example/`, `game_example_2/`: Sample target folders for testing
- `tests/`: Node-based tests for config and installer behavior

## Local development

```bash
python3 dev-server.py --bind 127.0.0.1 4173
```

Then open `http://127.0.0.1:4173/` in a supported browser.

The dev server sends `Cache-Control: no-store` headers so browser refreshes load the current local files. If the old `python3 -m http.server` response is already cached, do one hard refresh or clear site data once after switching servers.

## Tests

Run the test suite with:

```bash
node --test tests/*.test.mjs
```

## NW.js DLL hash catalog

The installer does not contact `dl.nwjs.io` while scanning a user's folder. DLL hashes for known NW.js releases are bundled per installer version, for example `translator/3.2.10/scanner/nwjs-dll-hashes.json`.

To refresh the catalog from official NW.js release checksum files:

```bash
node translator/3.2.10/scanner/download-nwjs-hashes.mjs --output translator/3.2.10/scanner/nwjs-dll-hashes.json
```
