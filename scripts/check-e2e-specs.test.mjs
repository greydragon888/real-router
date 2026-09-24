// check-e2e-specs.test.mjs — `lint:e2e` reads the examples of its own
// checkout from any directory, and refuses a run that found none.
//
// Run:  node --test scripts/check-e2e-specs.test.mjs
//
// Why (#2544): the script listed `examples/` relative to the working directory
// and sent `find`'s errors to /dev/null, and nothing refused zero configs. Run
// from `packages/`, it found no example and printed "All e2e directories have
// specs." over a planted config with no `e2e/`. pnpm, the hooks and CI run it
// at the root; a direct call from a subdirectory, or a tree that stops
// matching, is what reaches it. So each cell runs a byte copy of the script
// inside a fixture checkout, the way a direct call does: by a path relative to
// the working directory, from the root and from below it.
//
// Stdlib node:test/node:assert only (Node 24) — the repo-lints and pre-push
// `node --test scripts/*.test.mjs` steps pick this file up by glob.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
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

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(repoRoot, "scripts", "check-e2e-specs.sh");

const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/**
 * A checkout holding a byte copy of the script and one example per entry.
 *
 * @param {Record<string, { specs?: number, e2e?: boolean }> | null} examples
 *   example directory (under `examples/`) → its `e2e/` shape; `null` leaves
 *   `examples/` out of the tree.
 * @returns {string} the fixture root, physical: on macOS `os.tmpdir()` is a
 *   symlink.
 */
function fixture(examples) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "e2e-specs-")));
  fixtures.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-e2e-specs.sh"));
  mkdirSync(join(root, "packages", "core"), { recursive: true });
  if (examples === null) return root;

  mkdirSync(join(root, "examples"));
  for (const [name, { specs = 1, e2e = true }] of Object.entries(examples)) {
    const dir = join(root, "examples", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
    if (!e2e) continue;
    mkdirSync(join(dir, "e2e"));
    for (let i = 0; i < specs; i++) {
      writeFileSync(join(dir, "e2e", `t${i}.spec.ts`), "");
    }
  }
  return root;
}

/** Runs the copy by a path relative to `cwd`, as a direct call types it. */
function run(root, cwd = root) {
  const script = relative(cwd, join(root, "scripts", "check-e2e-specs.sh"));
  const result = spawnSync("bash", [script], { cwd, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Where a direct call can stand: below the root, beside the subject, inside it. */
const SUBDIRECTORIES = ["packages/core", "examples", "examples/web/a/e2e"];

test("control: a tree whose every config has a spec passes", () => {
  const root = fixture({ "web/a": { specs: 1 }, "desktop/b": { specs: 2 } });
  const { status, output } = run(root);

  assert.equal(status, 0, output);
  assert.equal(output, "All e2e directories have specs.\n");
});

test("names a config with no e2e/ directory", () => {
  const root = fixture({ "web/a": {}, "web/b": { e2e: false } });
  const { status, output } = run(root);

  assert.equal(status, 1, output);
  assert.match(
    output,
    /^ERROR: examples\/web\/b has playwright\.config\.ts but no e2e\/ directory$/m,
  );
  assert.match(output, /^Found 1 example\(s\)/m);
});

test("names an e2e/ directory with no spec", () => {
  const root = fixture({ "web/a": {}, "web/c": { specs: 0 } });
  const { status, output } = run(root);

  assert.equal(status, 1, output);
  assert.match(output, /^ERROR: examples\/web\/c\/e2e has 0 spec files$/m);
});

test("gives the root's verdict from any directory", () => {
  for (const cwd of SUBDIRECTORIES) {
    const planted = fixture({ "web/a": {}, "web/b": { e2e: false } });
    const failed = run(planted, join(planted, cwd));

    assert.equal(failed.status, 1, `from ${cwd}: ${failed.output}`);
    assert.match(
      failed.output,
      /^ERROR: examples\/web\/b has playwright\.config\.ts but no e2e\/ directory$/m,
      `from ${cwd}`,
    );

    const clean = fixture({ "web/a": {} });
    const passed = run(clean, join(clean, cwd));

    assert.equal(passed.status, 0, `from ${cwd}: ${passed.output}`);
    assert.equal(passed.output, "All e2e directories have specs.\n");
  }
});

test("refuses a tree with no config: zero is not a pass", () => {
  const root = fixture({});
  const { status, output } = run(root);

  assert.notEqual(status, 0, output);
  assert.match(output, /no playwright\.config\.ts under examples\//);
  assert.doesNotMatch(output, /All e2e directories have specs/);
});

test("refuses a tree with no examples/", () => {
  const root = fixture(null);
  const { status, output } = run(root);

  assert.notEqual(status, 0, output);
  assert.match(output, /examples/);
  assert.doesNotMatch(output, /All e2e directories have specs/);
});

test("a directory find cannot read fails the run", (t) => {
  if (process.getuid?.() === 0) {
    t.skip("root reads a directory with no permissions");
    return;
  }

  const root = fixture({ "web/a": {}, "web/locked": { e2e: false } });
  const locked = join(root, "examples", "web", "locked");
  chmodSync(locked, 0o000);
  try {
    const { status, output } = run(root);

    assert.notEqual(status, 0, output);
    assert.match(output, /examples\/web\/locked/);
    assert.doesNotMatch(output, /All e2e directories have specs/);
  } finally {
    chmodSync(locked, 0o755);
  }
});

test("a config under node_modules is not an example", () => {
  const root = fixture({ "web/a": {} });
  const vendored = join(root, "examples", "web", "a", "node_modules", "pkg");
  mkdirSync(vendored, { recursive: true });
  writeFileSync(join(vendored, "playwright.config.ts"), "");
  const { status, output } = run(root);

  assert.equal(status, 0, output);
  assert.equal(output, "All e2e directories have specs.\n");
});
