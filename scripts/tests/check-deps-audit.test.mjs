// check-deps-audit.test.mjs — meta-test: the dependency audit must LOOK at
// something, and must never present a scan it could not run as a verdict.
//
// Run:  node --test scripts/tests/check-deps-audit.test.mjs
//
// Why this exists (#1992): `osv-scanner scan source --recursive .` resolves
// .gitignore by walking UP from the scan root and then tests that root against
// the rules it found — so a checkout sitting under an ignored ancestor path
// (every agent worktree, at .claude/worktrees/, matched by `/.claude/*`) is
// itself "ignored". The walk ended at one inode with zero extractions,
// osv-scanner exited 128, and the wrapper's `if [ $exit_code -ne 0 ]`
// announced that as "❌ Vulnerabilities detected". The gate returned a verdict
// without reading a file — and it was loud only by accident: had "nothing
// scanned" exited 0, it would have read as a clean audit forever.
//
// ⚠ The obvious guard is VACUOUS. A test that runs the real osv-scanner and
// asserts on its result passes in CI by never running it: this file runs on
// ubuntu-latest (ci.yml → "Test CI meta", `node --test scripts/tests/*.test.mjs`)
// and no workflow installs osv-scanner, so the script takes its first branch,
// `command -v osv-scanner || exit 0`. A guard for a blind gate, itself blind.
//
// So the scanner is STUBBED: a fake `osv-scanner` first on PATH records its
// argv and returns a chosen exit code. Every assertion is on the command the
// script BUILDS (does it name lockfiles that exist?) and on how it REPORTS
// each outcome — observable with no binary, no network, and no coupling to a
// scanner version. Reverting the script to `--recursive .` turns test 1 red.
//
// The stub also answers `--version`, by default with the script's own version
// floor, so every test runs AT the boundary. The floor's tests are the last two.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace; the repo-lints `node --test scripts/tests/*.test.mjs` step picks this
// file up by glob, so the preventer needs no wiring of its own.

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
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT = join(repoRoot, "scripts", "check-deps-audit.sh");

/** The version floor the script enforces, read from it so the number has one home. */
const FLOOR = /^OSV_SCANNER_FLOOR="(\d+\.\d+\.\d+)"$/m.exec(
  readFileSync(SCRIPT, "utf8"),
)?.[1];
if (!FLOOR) throw new Error(`no OSV_SCANNER_FLOOR="x.y.z" line in ${SCRIPT}`);

/** Two lockfiles in the shape this repo has: one npm, one nested Cargo. */
const LOCKFILES = [
  "pnpm-lock.yaml",
  "examples/desktop/tauri/app/src-tauri/Cargo.lock",
];

const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/** Hermetic git: no global/system config, so a user's excludesFile can't leak in. */
function git(cwd, ...args) {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function writeTree(dir, lockfiles) {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  copyFileSync(SCRIPT, join(dir, "scripts", "check-deps-audit.sh"));
  writeFileSync(join(dir, "scripts", "osv-scanner.toml"), "");
  for (const file of lockfiles) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "");
  }
}

/**
 * Builds the shape that broke: an outer repository whose .gitignore excludes
 * `wt/`, with `wt` a worktree of it. The audit then runs with `wt` as its
 * root — a root its own repository ignores.
 */
function gitFixture(lockfiles = LOCKFILES) {
  const root = mkdtempSync(join(tmpdir(), "audit-guard-"));
  fixtures.push(root);
  const outer = join(root, "outer");
  mkdirSync(outer, { recursive: true });
  writeTree(outer, lockfiles);
  writeFileSync(join(outer, ".gitignore"), "wt/\n");
  git(outer, "init", "-q", "-b", "main", ".");
  git(outer, "add", "-A");
  git(outer, "commit", "-qm", "fixture");
  git(outer, "worktree", "add", "-q", "--detach", "wt");
  // realpath: on macOS os.tmpdir() is a symlink, and the script reports the
  // physical path it cd'd into.
  return { root, checkout: realpathSync(join(outer, "wt")) };
}

/** A checkout with no git at all — release tarball / vendored copy. */
function plainFixture(lockfiles = LOCKFILES) {
  const root = mkdtempSync(join(tmpdir(), "audit-guard-"));
  fixtures.push(root);
  const checkout = join(root, "checkout");
  mkdirSync(checkout, { recursive: true });
  writeTree(checkout, lockfiles);
  return { root, checkout: realpathSync(checkout) };
}

/**
 * A fake osv-scanner, first on PATH, that records argv and returns `exitCode`.
 * `--version` prints `versionLine` and is not recorded: the log is the scan.
 */
function stubScanner(
  root,
  exitCode,
  versionLine = `osv-scanner version: ${FLOOR}`,
) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(root, "argv.txt");
  const path = join(bin, "osv-scanner");
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      `if [ "$1" = "--version" ]; then echo ${JSON.stringify(versionLine)}; exit 0; fi`,
      `printf '%s\\n' "$@" > ${JSON.stringify(log)}`,
      `exit ${exitCode}`,
      "",
    ].join("\n"),
  );
  chmodSync(path, 0o755);
  return { bin, log };
}

function runAudit(
  checkout,
  bin,
  { cwd = checkout, script = "scripts/check-deps-audit.sh" } = {},
) {
  const result = spawnSync("bash", [script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const argvOf = (log) =>
  existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
const lockfilesIn = (argv) =>
  argv.filter((_, i) => argv[i - 1] === "--lockfile" || argv[i - 1] === "-L");

test("names lockfiles that exist, from a checkout its own repository ignores", () => {
  const { root, checkout } = gitFixture();
  const stub = stubScanner(root, 0);
  const { status } = runAudit(checkout, stub.bin);

  const argv = argvOf(stub.log);
  assert.ok(
    argv.length > 0,
    "osv-scanner was never invoked — the audit looked at nothing",
  );

  const named = lockfilesIn(argv);
  assert.equal(
    named.length,
    LOCKFILES.length,
    `the audit named ${named.length} of ${LOCKFILES.length} lockfiles; argv was ${JSON.stringify(argv)}`,
  );
  for (const file of named) {
    assert.ok(
      existsSync(resolve(checkout, file)),
      `named a lockfile that does not exist: ${file}`,
    );
  }
  assert.equal(status, 0, "a clean scan must exit 0");
});

test("does not delegate discovery to a tree walk", () => {
  const { root, checkout } = gitFixture();
  const stub = stubScanner(root, 0);
  runAudit(checkout, stub.bin);

  const argv = argvOf(stub.log);
  assert.ok(
    !argv.includes("--recursive") && !argv.includes("-r"),
    `the walk honours ancestor .gitignore rules and skips an ignored root entirely; argv was ${JSON.stringify(argv)}`,
  );
  assert.ok(
    !argv.includes("--allow-no-lockfiles"),
    "--allow-no-lockfiles turns 'nothing scanned' into exit 0 — a green audit over zero files",
  );
});

test("a scan that could not run is not reported as a finding", () => {
  const { root, checkout } = gitFixture();
  const stub = stubScanner(root, 128); // osv-scanner: "no package sources found"
  const { status, output } = runAudit(checkout, stub.bin);

  assert.equal(status, 128, "the scanner's exit code must propagate unchanged");
  assert.ok(
    !output.includes("Vulnerabilities detected"),
    "a scan that never ran was announced as a finding — there is nothing to triage",
  );
  assert.match(output, /the audit did NOT run/);
});

test("a real finding is still reported as a finding", () => {
  const { root, checkout } = gitFixture();
  const stub = stubScanner(root, 1); // osv-scanner: vulnerabilities found
  const { status, output } = runAudit(checkout, stub.bin);

  assert.equal(status, 1);
  assert.match(output, /Vulnerabilities detected/);
});

test("an empty lockfile set is 'did not run', never a pass", () => {
  const { root, checkout } = gitFixture([]);
  const stub = stubScanner(root, 0);
  const { status, output } = runAudit(checkout, stub.bin);

  assert.equal(
    argvOf(stub.log).length,
    0,
    "the scanner must not be invoked with nothing to scan",
  );
  assert.notEqual(status, 0, "an audit with no input must never exit 0");
  assert.equal(status, 2, "and must not share exit 1 with a real finding");
  assert.match(output, /the audit did NOT run/);
});

test("resolves its config and root from the script, not from cwd", () => {
  const { root, checkout } = gitFixture();
  const stub = stubScanner(root, 0);
  const subdir = join(checkout, "examples/desktop/tauri/app/src-tauri");
  const { status } = runAudit(checkout, stub.bin, {
    cwd: subdir,
    script: "../../../../../scripts/check-deps-audit.sh",
  });

  const argv = argvOf(stub.log);
  assert.ok(
    argv.includes(`--config=${join(checkout, "scripts", "osv-scanner.toml")}`),
    `the allowlist must be found from any cwd; argv was ${JSON.stringify(argv)}`,
  );
  assert.equal(lockfilesIn(argv).length, LOCKFILES.length);
  assert.equal(status, 0);
});

test("falls back to the filesystem when there is no git checkout", () => {
  const { root, checkout } = plainFixture();
  const stub = stubScanner(root, 0);
  const { status } = runAudit(checkout, stub.bin);

  assert.equal(lockfilesIn(argvOf(stub.log)).length, LOCKFILES.length);
  assert.equal(status, 0);
});

test("refuses a scanner below the floor before it scans, comparing as numbers", () => {
  const { root, checkout } = gitFixture();
  const [major, minor, patch] = FLOOR.split(".").map(Number);
  const cases = [
    [FLOOR, true],
    [`${major}.${minor}.${patch + 1}`, true],
    // Multi-digit fields: a string comparison puts 2.16.0 below 2.6.0.
    [`${major}.${minor + 10}.0`, true],
    [`${major + 10}.0.0`, true],
    // A lower minor with a higher patch, and a lower major.
    ...(minor > 0 ? [[`${major}.${minor - 1}.99`, false]] : []),
    ...(major > 0 ? [[`${major - 1}.99.99`, false]] : []),
  ];

  for (const [version, accepted] of cases) {
    const stub = stubScanner(root, 0, `osv-scanner version: ${version}`);
    rmSync(stub.log, { force: true });
    const { status, output } = runAudit(checkout, stub.bin);
    const scanned = argvOf(stub.log).length > 0;

    if (accepted) {
      assert.equal(status, 0, `${version} is not below ${FLOOR}: ${output}`);
      assert.ok(scanned, `${version} passed the floor and never scanned`);
    } else {
      assert.equal(
        status,
        3,
        `${version} is below ${FLOOR}: neither a pass nor a finding`,
      );
      assert.ok(!scanned, `${version} is below ${FLOOR} and scanned anyway`);
      assert.match(output, /the audit did NOT run/);
    }
  }
});

test("an unreadable version is refused, never assumed new enough", () => {
  const { root, checkout } = gitFixture();
  const stub = stubScanner(root, 0, "osv-scanner (devel)");
  const { status, output } = runAudit(checkout, stub.bin);

  assert.equal(
    argvOf(stub.log).length,
    0,
    "a scanner of unknown version must not scan",
  );
  assert.equal(status, 3);
  assert.match(output, /the audit did NOT run/);
});
