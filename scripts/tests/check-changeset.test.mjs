// check-changeset.test.mjs — `lint:changeset` validates the `.changeset/` of
// its own checkout from any directory.
//
// Run:  node --test scripts/tests/check-changeset.test.mjs
//
// Why (#2544): the validator took its root from the working directory and read
// a missing `.changeset/` as no changesets. Run from `packages/`, it printed
// "📝 No changesets to validate." and exited 0 over a planted invalid
// changeset the root run blocked. It is the first step of pre-push, and CI's
// `changeset-check.yml` calls its `--json` mode. So each cell runs a byte copy
// of `.changeset/check-changeset.mjs` inside a fixture checkout, from the root
// and from below it.
//
// Stdlib node:test/node:assert only (Node 24) — the repo-lints and pre-push
// `node --test scripts/tests/*.test.mjs` steps pick this file up by glob.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT = join(repoRoot, ".changeset", "check-changeset.mjs");

const VALID = '---\n"@real-router/core": minor\n---\n\nA change (#1234)\n';
const INVALID = '---\n"@real-router/core": minor\n---\n\nA change\n';

const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/**
 * A checkout holding a byte copy of the validator, one public package it can
 * name, and `changesets` (file name → text) beside the validator.
 */
function fixture(changesets = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "changeset-")));
  fixtures.push(root);
  mkdirSync(join(root, ".changeset"));
  copyFileSync(SCRIPT, join(root, ".changeset", "check-changeset.mjs"));
  writeFileSync(join(root, ".changeset", "README.md"), "# Changesets\n");
  mkdirSync(join(root, "packages", "core", "src"), { recursive: true });
  writeFileSync(
    join(root, "packages", "core", "package.json"),
    JSON.stringify({ name: "@real-router/core", version: "0.3.0" }),
  );
  for (const [file, text] of Object.entries(changesets)) {
    writeFileSync(join(root, ".changeset", file), text);
  }
  return root;
}

/** Runs the copy by a path relative to `cwd`, as a direct call types it. */
function run(root, { cwd = root, args = [] } = {}) {
  const script = relative(cwd, join(root, ".changeset", "check-changeset.mjs"));
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    output: `${result.stdout}${result.stderr}`,
  };
}

/** Where a direct call can stand: at the root, below it, deep in a package. */
const DIRECTORIES = ["", "packages", "packages/core/src"];

test("control: a checkout with no changeset passes", () => {
  const root = fixture();
  const { status, output } = run(root);

  assert.equal(status, 0, output);
  assert.equal(output, "📝 No changesets to validate.\n");
});

test("a valid changeset passes, from any directory", () => {
  const root = fixture({ "a-change.md": VALID });
  for (const cwd of DIRECTORIES) {
    const { status, output } = run(root, { cwd: join(root, cwd) });

    assert.equal(status, 0, `from ${cwd || "the root"}: ${output}`);
    assert.equal(output, "✅ 1 changeset file(s) valid.\n");
  }
});

test("an invalid changeset blocks, from any directory", () => {
  const root = fixture({ "a-change.md": INVALID });
  for (const cwd of DIRECTORIES) {
    const { status, output } = run(root, { cwd: join(root, cwd) });

    assert.equal(status, 1, `from ${cwd || "the root"}: ${output}`);
    assert.match(
      output,
      /^❌ \.changeset\/a-change\.md: missing PR\/issue reference \(#NN\) in the description$/m,
    );
  }
});

test("--json reports the same files from any directory", () => {
  const root = fixture({ "a-change.md": INVALID });
  for (const cwd of DIRECTORIES) {
    const { status, stdout } = run(root, {
      cwd: join(root, cwd),
      args: ["--json"],
    });
    const results = JSON.parse(stdout);

    assert.equal(status, 1, `from ${cwd || "the root"}`);
    assert.deepEqual(
      results.map(({ file }) => file),
      [".changeset/a-change.md"],
    );
    assert.equal(results[0].errors.length, 1);
  }
});
