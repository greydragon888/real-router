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

import { packages } from "../repo-model.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const FULL =
  "thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }\n";

/**
 * A plain package, one without tests, a phantom one, one whose `src/` is a
 * symlink, one whose manifest does not parse, one with a coverage directory
 * but no `lcov.info`, a directory without `package.json`, and a file beside
 * them.
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
  isPhantom: false,
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
      record("phantom", {
        hasTests: true,
        hasVitestConfig: true,
        isPhantom: true,
      }),
      record("plain", { hasTests: true, hasVitestConfig: true, hasLcov: true }),
      record("untested", { public: false }),
    ],
  );
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
