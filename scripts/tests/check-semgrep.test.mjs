// check-semgrep.test.mjs — `lint:security` scans its own checkout from any
// directory, and a rule set or target that is not there is refused rather
// than reported as a tool error.
//
// Run:  node --test scripts/tests/check-semgrep.test.mjs
//
// Why (#2544): `--config .semgrep/` and the targets `packages shared` were
// relative to the working directory. Run from `packages/`, semgrep exited 7
// for the missing config, and the `exit >= 2` arm (tool and network errors
// only warn, by design) passed a planted finding the root run blocked. The
// same arm passed a checkout whose `.semgrep/` was gone, from the root.
//
// semgrep is STUBBED, and faithful where it matters: a fake `semgrep` first on
// PATH records the directory it ran in and its argv, exits 7 for a local
// `--config` that does not exist and 2 for a target that does not, like the
// real one, and otherwise exits with `STUB_EXIT`.
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
const SCRIPT = join(repoRoot, "scripts", "check-semgrep.sh");

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

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    env: ENV,
    encoding: "utf8",
  }).trim();

const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/**
 * A git checkout holding a byte copy of the script, a rule set and both
 * targets. `origin/master` sits one commit behind HEAD, so the branch has a
 * delta to scan; `delta: false` puts it at HEAD.
 *
 * @returns {{ root: string, base: string }} the physical root, and the commit
 *   the scan must take as its baseline.
 */
function fixture({ delta = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "semgrep-")));
  fixtures.push(root);
  const files = {
    "scripts/check-semgrep.sh": null,
    ".semgrep/rules.yml": "rules: []\n",
    "packages/core/src/a.ts": "export const a = 1;\n",
    "shared/dom-utils/b.ts": "export const b = 2;\n",
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    if (text === null) copyFileSync(SCRIPT, join(root, file));
    else writeFileSync(join(root, file), text);
  }
  git(root, "init", "-q", "-b", "main", ".");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  if (delta) {
    writeFileSync(
      join(root, "packages/core/src/a.ts"),
      "export const a = 3;\n",
    );
    git(root, "commit", "-qam", "branch");
  }
  git(root, "update-ref", "refs/remotes/origin/master", base);
  return { root, base };
}

/**
 * A fake `semgrep`, first on PATH, that checks its inputs the way semgrep
 * does, writes the directory it ran in and its argv to `$STUB_LOG`, and exits
 * with `$STUB_EXIT`. Written once: macOS scans each new executable on its
 * first run, at about 150 ms a time.
 */
const STUB_BIN = mkdtempSync(join(tmpdir(), "semgrep-stub-"));
fixtures.push(STUB_BIN);
writeFileSync(
  join(STUB_BIN, "semgrep"),
  [
    "#!/bin/sh",
    'pwd -P > "$STUB_LOG"',
    `printf '%s\\n' "$@" >> "$STUB_LOG"`,
    'shift # "scan"',
    "while [ $# -gt 0 ]; do",
    '  case "$1" in',
    '    --config) case "$2" in p/*) ;; *) [ -e "$2" ] || exit 7 ;; esac; shift 2 ;;',
    "    --include|--baseline-commit) shift 2 ;;",
    "    -*) shift ;;",
    '    *) [ -e "$1" ] || exit 2; shift ;;',
    "  esac",
    "done",
    'exit "${STUB_EXIT:-0}"',
    "",
  ].join("\n"),
);
chmodSync(join(STUB_BIN, "semgrep"), 0o755);

/** Runs the copy by a path relative to `cwd`, as a direct call types it. */
function run(root, { cwd = root, exit = 0 } = {}) {
  const log = join(root, ".stub-log");
  rmSync(log, { force: true });
  const script = relative(cwd, join(root, "scripts", "check-semgrep.sh"));
  const result = spawnSync("bash", [script], {
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

/** The value that follows `flag` in `argv`, for each time it appears. */
const valuesOf = (argv, flag) =>
  argv.flatMap((arg, i) => (argv[i - 1] === flag ? [arg] : []));

test("control: from the root, semgrep scans both targets with the local rules", () => {
  const { root, base } = fixture();
  const { status, output, ranIn, argv } = run(root);

  assert.equal(status, 0, output);
  assert.equal(ranIn, root, "semgrep must run at the root");
  assert.deepEqual(valuesOf(argv, "--config"), ["p/javascript", ".semgrep/"]);
  assert.deepEqual(valuesOf(argv, "--baseline-commit"), [base]);
  assert.deepEqual(argv.slice(-2), ["packages", "shared"]);
});

test("a finding blocks, from any directory", () => {
  const { root } = fixture();
  for (const cwd of ["", "packages", "packages/core/src", "shared"]) {
    const where = cwd || "the root";
    const { status, output, ranIn } = run(root, {
      cwd: join(root, cwd),
      exit: 1,
    });

    assert.equal(status, 1, `from ${where}: ${output}`);
    assert.match(
      output,
      /Semgrep found newly-introduced issue/,
      `from ${where}`,
    );
    assert.equal(ranIn, root, `from ${where}: semgrep must run at the root`);
  }
});

test("refuses a checkout without .semgrep/, before semgrep runs", () => {
  const { root } = fixture();
  rmSync(join(root, ".semgrep"), { recursive: true });
  const { status, output, ranIn } = run(root);

  assert.equal(status, 1, output);
  assert.match(output, /no \.semgrep\/ in the repository/);
  assert.equal(ranIn, undefined, "semgrep must not run without its rules");
});

test("refuses a checkout without a target, before semgrep runs", () => {
  for (const target of ["packages", "shared"]) {
    const { root } = fixture();
    rmSync(join(root, target), { recursive: true });
    const { status, output, ranIn } = run(root);

    assert.equal(status, 1, `without ${target}/: ${output}`);
    assert.match(output, new RegExp(`no ${target}/ in the repository`));
    assert.equal(ranIn, undefined, `without ${target}/: semgrep must not run`);
  }
});

test("control: an error of semgrep itself still only warns", () => {
  const { root } = fixture();
  const { status, output, ranIn } = run(root, { exit: 2 });

  assert.equal(status, 0, output);
  assert.match(output, /semgrep errored \(exit 2/);
  assert.equal(ranIn, root);
});

test("control: with no branch delta there is nothing to scan", () => {
  const { root } = fixture({ delta: false });
  const { status, output, ranIn } = run(root, { cwd: join(root, "packages") });

  assert.equal(status, 0, output);
  assert.match(output, /No branch delta against origin\/master/);
  assert.equal(ranIn, undefined);
});
