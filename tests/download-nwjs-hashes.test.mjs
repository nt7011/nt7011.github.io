import assert from "node:assert/strict";
import test from "node:test";

import {
  compareNwjsBuildVersions,
  parseChecksumFile,
  parseNwjsBuildVersion,
  parseReleaseIndex,
} from "../translator/3.2.10/scanner/download-nwjs-hashes.mjs";

test("parseReleaseIndex returns NW.js release directories", () => {
  const releases = parseReleaseIndex(`
    <a href="MD5SUMS">MD5SUMS</a>
    <a href="live-build/">live-build/</a>
    <a href="v0.31.5/">v0.31.5/</a>
    <a href="v0.32.0-beta1/">v0.32.0-beta1/</a>
    <a href="v0.111.0/">v0.111.0/</a>
  `);

  assert.deepEqual(releases, ["v0.31.5", "v0.32.0-beta1", "v0.111.0"]);
});

test("parseChecksumFile parses sha256sum output with optional binary marker", () => {
  const entries = parseChecksumFile(`
${"a".repeat(64)}  nwjs-v0.111.0-win-x64/nw.dll
${"b".repeat(64)}  *nwjs-v0.111.0-win-x64/ffmpeg.dll
not a checksum line
  `);

  assert.deepEqual(entries, [
    {
      algorithm: "sha256",
      hash: "a".repeat(64),
      path: "nwjs-v0.111.0-win-x64/nw.dll",
    },
    {
      algorithm: "sha256",
      hash: "b".repeat(64),
      path: "nwjs-v0.111.0-win-x64/ffmpeg.dll",
    },
  ]);
});

test("compareNwjsBuildVersions sorts beta releases before stable releases", () => {
  const versions = [
    "v0.111.0",
    "v0.32.0",
    "v0.32.0-beta1",
    "v0.32.1",
    "v0.32.0-beta2",
  ];

  assert.deepEqual(versions.sort(compareNwjsBuildVersions), [
    "v0.32.0-beta1",
    "v0.32.0-beta2",
    "v0.32.0",
    "v0.32.1",
    "v0.111.0",
  ]);
});

test("parseNwjsBuildVersion rejects non-release labels", () => {
  assert.equal(parseNwjsBuildVersion("live-build"), null);
  assert.deepEqual(parseNwjsBuildVersion("v0.32.0-beta1"), {
    major: 0,
    minor: 32,
    patch: 0,
    preRelease: {
      label: "beta",
      number: 1,
    },
  });
});
