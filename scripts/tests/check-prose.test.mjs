// check-prose.test.mjs — `lint:prose` lints the repository's Markdown corpus
// from any directory, and paths passed to it stay the caller's.
//
// Run:  node --test scripts/tests/check-prose.test.mjs
//
// Why (#2544): with no arguments the script took its corpus from `git
// ls-files`, which lists the files under the working directory with paths
// relative to it, while its exclusions are written against paths from the
// root. Run from `packages/` it linted 114 of the 123 files and missed a
// planted finding in the root README; run from `benchmarks/` it linted only
// the prose the owner left out of scope and went red on it.
//
// Vale is STUBBED: a fake `vale` first on PATH records the directory it ran in
// and its argv, and exits with `STUB_EXIT`; asked `--version`, it answers
// `STUB_VERSION` and records nothing. Every assertion is on what the script
// hands Vale, so the cells need no binary and no style.
//
// Stdlib node:test/node:assert only (Node 24) — the repo-lints and pre-push
// `node --test scripts/tests/*.test.mjs` steps pick this file up by glob.

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

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
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
  "cross-router-bench/notes.md",
  "examples/web/a/README.md",
  "packages/core/CHANGELOG.md",
];

/** The rules and the Vale floor, as `vale-styles/VERSION` and `.vale.ini` hold them. */
const RULES = {
  ".vale.ini": "StylesPath = vale-styles\n",
  "vale-styles/VERSION": "VALE_VERSION=3.20.0\n",
  "vale-styles/RealRouter/Rule.yml": "extends: existence\n",
};

const git = (root, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd: root,
    env: ENV,
    encoding: "utf8",
  }).trim();

/**
 * A git checkout holding a byte copy of the script, the rules and the files
 * above, staged — and committed when `commit` is set, so a later commit gives
 * `--changed` a range.
 */
function fixture({ commit = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "prose-")));
  fixtures.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-prose.sh"));
  for (const file of [...IN_SCOPE, ...OUT_OF_SCOPE]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "# prose\n");
  }
  for (const [file, text] of Object.entries(RULES)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  git(root, "init", "-q", "-b", "main", ".");
  git(root, "add", "-A");
  if (commit) git(root, "commit", "-q", "-m", "base");
  // Untracked, so outside the corpus by construction.
  writeFileSync(join(root, "NOTES.md"), "# scratch\n");
  return root;
}

/**
 * Commits `changes` — a path to its new text, or to `null` to delete it — and
 * returns the commit before them, the base of the range.
 */
function commitChanges(root, changes) {
  const base = git(root, "rev-parse", "HEAD");
  for (const [file, text] of Object.entries(changes)) {
    if (text === null) {
      rmSync(join(root, file));
    } else {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
  }
  git(root, "add", "-A", "--", ...Object.keys(changes));
  git(root, "commit", "-q", "-m", "change");
  return base;
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
    'if [ "$1" = "--version" ]; then echo "vale version ${STUB_VERSION:-3.20.0}"; exit 0; fi',
    'pwd -P > "$STUB_LOG"',
    `printf '%s\\n' "$@" >> "$STUB_LOG"`,
    'exit "${STUB_EXIT:-0}"',
    "",
  ].join("\n"),
);
chmodSync(join(STUB_BIN, "vale"), 0o755);

/** Runs the copy by a path relative to `cwd`, as a direct call types it. */
function run(root, { cwd = root, args = [], exit = 0, version = "3.20.0" } = {}) {
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
      STUB_VERSION: version,
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
  "cross-router-bench",
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

// ── The Vale floor ──────────────────────────────────────────────────────────

test("a Vale below the floor, or one that cannot say its version, refuses with 3", () => {
  const root = fixture();
  for (const version of ["3.19.9", "2.30.0", "unknown"]) {
    const { status, output, argv } = run(root, { version });

    assert.equal(status, 3, `${version}: ${output}`);
    assert.match(output, /the prose lint did NOT run/);
    assert.deepEqual(argv, [], `${version}: Vale must not lint`);
  }
});

test("the floor compares versions as numbers, not as strings", () => {
  const root = fixture();
  for (const version of ["3.20.0", "3.21.0", "3.100.0", "4.0.0"]) {
    const { status, argv } = run(root, { version });

    assert.equal(status, 0, version);
    assert.deepEqual(argv, IN_SCOPE, version);
  }
});

// ── --changed <base> ────────────────────────────────────────────────────────

test("--changed: an empty range lints nothing and passes", () => {
  const root = fixture({ commit: true });
  const { status, output, argv } = run(root, { args: ["--changed", "HEAD"] });

  assert.equal(status, 0, output);
  assert.match(output, /^No Markdown to lint\.$/m);
  assert.deepEqual(argv, []);
});

test("--changed: the corpus files the range adds or edits, and none the corpus leaves out", () => {
  const root = fixture({ commit: true });
  commitChanges(root, { ".changeset/pending.md": "# a change\n" });

  const base = commitChanges(root, {
    "README.md": "# edited\n",
    "docs/new.md": "# added\n",
    "CHANGELOG.md": "# released\n",
    "packages/core/CHANGELOG.md": "# released\n",
    ".changeset/pending.md": null,
    "examples/web/a/README.md": "# edited\n",
    "benchmarks/notes.md": "# edited\n",
    ".claude/commands/skill.md": "# edited\n",
  });
  const { status, output, ranIn, argv } = run(root, { args: ["--changed", base] });

  assert.equal(status, 0, output);
  assert.equal(ranIn, root);
  assert.deepEqual(argv, ["README.md", "docs/new.md"]);
});

test("--changed: a release-shaped range — CHANGELOG edits and a deleted changeset — lints nothing and passes", () => {
  const root = fixture({ commit: true });
  commitChanges(root, { ".changeset/pending.md": "# a change\n" });
  const base = commitChanges(root, {
    "CHANGELOG.md": "# 1.0.0\n",
    "packages/core/CHANGELOG.md": "# 1.0.0\n",
    ".changeset/pending.md": null,
  });
  const { status, output, argv } = run(root, { args: ["--changed", base] });

  assert.equal(status, 0, output);
  assert.match(output, /^No Markdown to lint\.$/m);
  assert.deepEqual(argv, []);
});

test("--changed: a range that edits what decides the result lints the whole corpus", () => {
  for (const changes of [
    { ".vale.ini": "StylesPath = vale-styles\nMinAlertLevel = error\n" },
    { "vale-styles/RealRouter/Rule.yml": "extends: substitution\n" },
    { "vale-styles/RealRouter/Rule.yml": null },
    { "vale-styles/VERSION": "VALE_VERSION=3.20.0\nVALE_SHA256=0\n" },
    { "scripts/check-prose.sh": `${readFileSync(SCRIPT, "utf8")}\n# edited\n` },
  ]) {
    const root = fixture({ commit: true });
    const base = commitChanges(root, changes);
    const { status, output, argv } = run(root, { args: ["--changed", base] });
    const what = Object.keys(changes)[0];

    assert.equal(status, 0, `${what}: ${output}`);
    assert.match(output, /linting the whole corpus/, what);
    assert.deepEqual(argv, IN_SCOPE, what);
  }
});

test("--changed: from a subdirectory, the same list as from the root", () => {
  const root = fixture({ commit: true });
  const base = commitChanges(root, { "packages/core/README.md": "# edited\n" });

  for (const cwd of ["", ...SUBDIRECTORIES]) {
    const { status, ranIn, argv } = run(root, {
      cwd: join(root, cwd),
      args: ["--changed", base],
    });

    assert.equal(status, 0, `from ${cwd || "the root"}`);
    assert.equal(ranIn, root, `from ${cwd || "the root"}`);
    assert.deepEqual(argv, ["packages/core/README.md"], `from ${cwd || "the root"}`);
  }
});

test("--changed: a git diff that fails is an error, not an empty list", () => {
  const root = fixture({ commit: true });
  const { status, output, argv } = run(root, { args: ["--changed", "no-such-ref"] });

  assert.equal(status, 2, output);
  assert.match(output, /git diff against no-such-ref failed — nothing was linted/);
  assert.deepEqual(argv, []);
});

test("--changed without a base is a usage error", () => {
  const root = fixture({ commit: true });
  const { status, output } = run(root, { args: ["--changed"] });

  assert.equal(status, 2, output);
  assert.match(output, /--changed needs a base/);
});
