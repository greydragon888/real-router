// check-prose.test.mjs — `lint:prose` lints the repository's Markdown corpus
// from any directory, and paths passed to it stay the caller's.
//
// Run:  node --test scripts/check-prose.test.mjs
//
// Why (#2544): with no arguments the script took its corpus from `git
// ls-files`, which lists the files under the working directory with paths
// relative to it, while its exclusions are written against paths from the
// root. Run from `packages/` it linted 114 of the 123 files and missed a
// planted finding in the root README; run from `benchmarks/` it linted only
// the prose the owner left out of scope and went red on it.
//
// Vale is STUBBED: a fake `vale` first on PATH records the directory it ran in
// and its argv, and exits with `STUB_EXIT`. Every assertion is on what the
// script hands Vale, so the cells need no binary and no style.
//
// Stdlib node:test/node:assert only (Node 24) — the repo-lints and pre-push
// `node --test scripts/*.test.mjs` steps pick this file up by glob.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(repoRoot, "scripts", "check-prose.sh");

/**
 * Hermetic git: none of the caller's GIT_* variables, no global/system config.
 * This suite runs inside pre-push, and a push from a linked worktree exports
 * GIT_DIR to it.
 */
const ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/** Tracked Markdown the corpus keeps. */
const IN_SCOPE = ["README.md", "packages/core/README.md"];

/** Tracked Markdown the script's exclusions remove, at least one per exclusion. */
const OUT_OF_SCOPE = [
  ".claude/commands/skill.md",
  "CHANGELOG.md",
  "benchmarks/notes.md",
  "examples/web/a/README.md",
  "packages/core/CHANGELOG.md",
];

/** A git checkout holding a byte copy of the script and the files above, staged. */
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "prose-")));
  fixtures.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-prose.sh"));
  for (const file of [...IN_SCOPE, ...OUT_OF_SCOPE]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "# prose\n");
  }
  execFileSync("git", ["init", "-q", "-b", "main", "."], {
    cwd: root,
    env: ENV,
  });
  execFileSync("git", ["add", "-A"], { cwd: root, env: ENV });
  // Untracked, so outside the corpus by construction.
  writeFileSync(join(root, "NOTES.md"), "# scratch\n");
  return root;
}

/**
 * A fake `vale`, first on PATH, that writes the directory it ran in and its
 * argv to `$STUB_LOG` and exits with `$STUB_EXIT`. Written once: macOS scans
 * each new executable on its first run, at about 150 ms a time.
 */
const STUB_BIN = mkdtempSync(join(tmpdir(), "prose-stub-"));
fixtures.push(STUB_BIN);
writeFileSync(
  join(STUB_BIN, "vale"),
  [
    "#!/bin/sh",
    'pwd -P > "$STUB_LOG"',
    `printf '%s\\n' "$@" >> "$STUB_LOG"`,
    'exit "${STUB_EXIT:-0}"',
    "",
  ].join("\n"),
);
chmodSync(join(STUB_BIN, "vale"), 0o755);

/** Runs the copy by a path relative to `cwd`, as a direct call types it. */
function run(root, { cwd = root, args = [], exit = 0 } = {}) {
  const log = join(root, ".stub-log");
  rmSync(log, { force: true });
  const script = relative(cwd, join(root, "scripts", "check-prose.sh"));
  const result = spawnSync("bash", [script, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...ENV,
      PATH: `${STUB_BIN}:${ENV.PATH}`,
      STUB_LOG: log,
      STUB_EXIT: String(exit),
    },
  });
  const [ranIn, ...argv] = existsSync(log)
    ? readFileSync(log, "utf8").split("\n").filter(Boolean)
    : [];
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    ranIn,
    argv,
  };
}

/** Where a direct call can stand: below the root, and inside each excluded tree. */
const SUBDIRECTORIES = [
  "packages",
  "packages/core",
  "benchmarks",
  "examples",
  ".claude",
];

test("control: from the root, Vale reads exactly the in-scope corpus", () => {
  const root = fixture();
  const { status, output, ranIn, argv } = run(root);

  assert.equal(status, 0, output);
  assert.equal(ranIn, root, "Vale must run at the root");
  assert.deepEqual(argv, IN_SCOPE);
  assert.match(output, /^Linting 2 Markdown file\(s\) with Vale…$/m);
});

test("lints the same corpus from any directory", () => {
  const root = fixture();
  for (const cwd of SUBDIRECTORIES) {
    const { status, output, ranIn, argv } = run(root, {
      cwd: join(root, cwd),
    });

    assert.equal(status, 0, `from ${cwd}: ${output}`);
    assert.equal(ranIn, root, `from ${cwd}: Vale must run at the root`);
    assert.deepEqual(argv, IN_SCOPE, `from ${cwd}`);
  }
});

test("Vale's verdict is the script's, from any directory", () => {
  const root = fixture();
  for (const cwd of ["", ...SUBDIRECTORIES]) {
    const { status, argv } = run(root, { cwd: join(root, cwd), exit: 1 });

    assert.equal(status, 1, `from ${cwd || "the root"}`);
    assert.deepEqual(argv, IN_SCOPE, `from ${cwd || "the root"}`);
  }
});

test("paths passed on the command line stay the caller's", () => {
  const root = fixture();
  const cwd = join(root, "packages", "core");
  const { status, output, ranIn, argv } = run(root, {
    cwd,
    args: ["README.md", "CHANGELOG.md"],
  });

  assert.equal(status, 0, output);
  assert.equal(ranIn, cwd, "explicit paths resolve against the caller's cwd");
  assert.deepEqual(argv, ["README.md", "CHANGELOG.md"]);
});
