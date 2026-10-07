// repo-model.test.mjs — the package walk the repository's scripts share.
//
// Run:  node --test scripts/tests/repo-model.test.mjs
//
// The walk runs on a fixture tree and on the repository. The fixture holds one
// package of each kind the readers tell apart; the repository cell is what
// keeps the walk from passing by reading nothing.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isPhantom, packages } from "../repo-model.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const FULL =
  "thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }\n";

/** A package with tests whose vitest config holds `thresholds`. */
const phantomOn = (key, thresholds) => ({
  [`packages/phantom-${key}/package.json`]: JSON.stringify({
    name: `@fx/phantom-${key}`,
  }),
  [`packages/phantom-${key}/src/index.ts`]: "export const one = 1;\n",
  [`packages/phantom-${key}/tests/one.test.ts`]: "\n",
  [`packages/phantom-${key}/vitest.config.mts`]: thresholds,
});

/**
 * A plain package, one without tests, phantom ones — each with one threshold
 * lowered — one whose `src/` is a symlink, one whose manifest does not parse,
 * one with a coverage directory but no `lcov.info`, a directory without
 * `package.json`, and a file beside them.
 */
const FIXTURE = {
  "packages/broken/package.json": "{\n",
  "packages/broken/src/index.ts": "export const broken = 1;\n",
  "packages/plain/package.json": JSON.stringify({ name: "@fx/plain" }),
  "packages/plain/src/index.ts": "export const plain = 1;\n",
  "packages/plain/tests/plain.test.ts": "\n",
  "packages/plain/vitest.config.mts": FULL,
  "packages/plain/coverage/lcov.info": "TN:\nend_of_record\n",
  "packages/untested/package.json": JSON.stringify({
    name: "@fx/untested",
    private: true,
  }),
  "packages/untested/src/index.ts": "export const untested = 1;\n",
  "packages/phantom/package.json": JSON.stringify({ name: "@fx/phantom" }),
  "packages/phantom/src/index.ts": "export const phantom = 1;\n",
  "packages/phantom/tests/phantom.test.ts": "\n",
  "packages/phantom/vitest.config.mts":
    "thresholds: { statements: 100, branches: 94, functions: 100, lines: 100 }\n",
  "packages/linked/package.json": JSON.stringify({ name: "@fx/linked" }),
  ...phantomOn(
    "functions",
    "thresholds: { statements: 100, branches: 100, functions: 99, lines: 100 }\n",
  ),
  ...phantomOn(
    "lines",
    "thresholds: { statements: 100, branches: 100, functions: 100, lines: 99 }\n",
  ),
  ...phantomOn(
    "statements",
    "thresholds: { statements: 99, branches: 100, functions: 100, lines: 100 }\n",
  ),
  "packages/partial/package.json": JSON.stringify({ name: "@fx/partial" }),
  "packages/partial/src/index.ts": "export const partial = 1;\n",
  "packages/partial/coverage/index.html": "\n",
  "packages/no-manifest/src/index.ts": "export const none = 1;\n",
  "packages/notes.md": "# not a package\n",
  "shared/dx/index.ts": "export const dx = 1;\n",
};

/** Builds `files` under a fresh directory, runs `body` on it, removes it. */
function withTree(files, body) {
  const root = mkdtempSync(join(tmpdir(), "repo-model-"));

  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    if (files["packages/linked/package.json"] !== undefined) {
      symlinkSync("../../shared/dx", join(root, "packages/linked/src"));
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const record = (name, fields) => ({
  name,
  dir: `packages/${name}`,
  public: true,
  hasTests: false,
  hasVitestConfig: false,
  hasRealSrc: true,
  hasLcov: false,
  ...fields,
});

test("the walk reads each kind of package in the fixture", () => {
  assert.deepEqual(
    withTree(FIXTURE, (root) => packages(root)),
    [
      record("broken", { public: false }),
      record("linked", { hasRealSrc: false }),
      record("partial", {}),
      record("phantom", { hasTests: true, hasVitestConfig: true }),
      record("phantom-functions", { hasTests: true, hasVitestConfig: true }),
      record("phantom-lines", { hasTests: true, hasVitestConfig: true }),
      record("phantom-statements", { hasTests: true, hasVitestConfig: true }),
      record("plain", { hasTests: true, hasVitestConfig: true, hasLcov: true }),
      record("untested", { public: false }),
    ],
  );
});

test("isPhantom is true for each package of the fixture with a threshold below 100", () => {
  withTree(FIXTURE, (root) => {
    assert.deepEqual(
      packages(root)
        .filter((pkg) => isPhantom(root, pkg.name))
        .map((pkg) => pkg.name),
      ["phantom", "phantom-functions", "phantom-lines", "phantom-statements"],
    );
  });
});

/** `isPhantom` of a tested package whose vitest config is `config`. */
const phantom = (config) =>
  withTree(phantomOn("x", config), (root) => isPhantom(root, "phantom-x"));

test("a threshold below 100 makes a package phantom in each number form", () => {
  for (const config of [
    "thresholds: { branches: 99.5 }\n",
    // Vitest reads a negative threshold as the number of uncovered items it
    // allows.
    "thresholds: { lines: -10 }\n",
    "thresholds: {\n  statements: 96,\n  branches: 86,\n}\n",
  ]) {
    assert.equal(phantom(config), true, config);
  }
  assert.equal(phantom(FULL), false);
});

test("the words of a threshold outside a thresholds object are not read", () => {
  for (const config of [
    `// branches: 94 is the floor elsewhere\n${FULL}`,
    `/* lines: 50 */\n${FULL}`,
    `// thresholds: { branches: 50 } was the floor\n${FULL}`,
    `/* thresholds: { lines: 10 } */\n${FULL}`,
    `${FULL.trimEnd()} // functions: 10\n`,
    `export default { test: { include: ["tests/functions/**"] } };\n${FULL}`,
    `const lines = 50;\nconst note = "thresholds: { lines: 50 }";\n${FULL}`,
    `const minthresholds = 1;\nconst thresholdsSeen = 2;\n${FULL}`,
    `const say = "say \\"thresholds: { branches: 50 }\\"";\n${FULL}`,
  ]) {
    assert.equal(phantom(config), false, config);
  }
});

test("a threshold isPhantom does not read throws, naming the file, the line and the text", () => {
  const refused = (line, words) =>
    `packages/phantom-x/vitest.config.mts:${line}: "${words}" — isPhantom reads a coverage threshold only as \`thresholds: { <key>: <number>, … }\``;

  for (const [config, line, words] of [
    ["thresholds: { branches: FLOOR }\n", 1, "branches: FLOOR"],
    ["thresholds: { ...FLOORS }\n", 1, "...FLOORS"],
    ["thresholds: { lines }\n", 1, "lines"],
    ["thresholds: { branches: 100 - 10 }\n", 1, "branches: 100 - 10"],
    ["thresholds: { lines: 1e2 }\n", 1, "lines: 1e2"],
    ['thresholds: { "src/**": { lines: 90 } }\n', 1, '"src/**": { lines: 90'],
    ["thresholds: { 100: true }\n", 1, "100: true"],
    ["thresholds: base,\n", 1, "thresholds: base,"],
    ["coverage.thresholds.lines = 90;\n", 1, "thresholds.lines = 90;"],
    [
      'config.test.coverage["thresholds"] = { lines: 90 };\n',
      1,
      '"thresholds"',
    ],
    ["export default { 'thresholds': { lines: 90 } };\n", 1, "'thresholds'"],
    [
      "thresholds: {\n  lines: 100,\n  branches: FLOOR,\n}\n",
      3,
      "branches: FLOOR",
    ],
  ]) {
    assert.throws(
      () => phantom(config),
      { message: refused(line, words) },
      config,
    );
  }
});

test("a config isPhantom cannot lex throws, naming the file and the line", () => {
  for (const [config, line, message] of [
    [
      'const re = /["]/;\n// branches: 94\n',
      1,
      /a "\/" outside a string and a comment/,
    ],
    [
      `${FULL}const half = 1 / 2;\n`,
      2,
      /a "\/" outside a string and a comment/,
    ],
    [
      "const k = { \\u0074hresholds: { lines: 90 } };\n",
      1,
      /a "\\" outside a string and a comment/,
    ],
    [`${FULL}/* open\n`, 2, /a comment that does not end/],
    [`const s = "open;\n${FULL}`, 1, /a string that does not end/],
  ]) {
    assert.throws(
      () => phantom(config),
      (error) => {
        assert.ok(
          error.message.startsWith(
            `packages/phantom-x/vitest.config.mts:${line}: `,
          ),
          error.message,
        );
        assert.match(error.message, message);
        return true;
      },
      config,
    );
  }
});

test("a package without a vitest config is not phantom", () => {
  withTree(FIXTURE, (root) => {
    assert.equal(isPhantom(root, "untested"), false);
  });
});

test("a tree without packages/ throws rather than returning an empty list", () => {
  withTree({ "shared/dx/index.ts": "\n" }, (root) => {
    assert.throws(() => packages(root), { code: "ENOENT" });
  });
});

test("the root has no default", () => {
  for (const root of [undefined, ""]) {
    assert.throws(() => packages(root), TypeError);
  }
});

test("on the repository, the walk finds every tracked package", () => {
  const tracked = execFileSync("git", ["ls-files", "--", "packages"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .map((path) => /^packages\/([^/]+)\/package\.json$/.exec(path)?.[1])
    .filter((name) => name !== undefined);

  assert.ok(tracked.length > 0, "git lists no package manifest");
  assert.deepEqual(
    packages(repoRoot).map((pkg) => pkg.name),
    tracked.sort(),
  );
});
