// pre-push-guard.test.mjs — the push guard of .husky/pre-push, run the way git
// runs it: installed as a throwaway repository's pre-push hook and fed by a
// real `git push`, so the ref lines arrive on stdin exactly as they do there.
//
// Run:  node --test scripts/pre-push-guard.test.mjs
//
// Every step of the hook reads the WORKING TREE; the guard refuses a push that
// is not that tree (IMPLEMENTATION_NOTES "Pre-push refuses a push that is not
// its working tree"). Both of its blocks are cut out of .husky/pre-push by
// their markers, so this file runs the hook's own text and cannot drift from it.
// The cases are the eleven the design was checked against, plus HEAD moving
// mid-hook, the other half of what the final check guards.
//
// ⚠ Every git call here drops the caller's GIT_* variables. This suite runs
// inside pre-push, and a push from a linked worktree exports GIT_DIR to it;
// inherited, it would aim these fixtures' commands at the real repository.
//
// Stdlib node:test/node:assert only (Node 24) — the repo-lints and pre-push
// `node --test scripts/*.test.mjs` steps pick this file up by glob.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOK = readFileSync(join(repoRoot, ".husky", "pre-push"), "utf8");

/** The hook's text between `# >>> push guard: <name>` and `# <<< push guard: <name>`. */
function block(name) {
  const open = HOOK.indexOf(`# >>> push guard: ${name}`);
  const close = HOOK.indexOf(`# <<< push guard: ${name}`);

  if (open === -1 || close < open) {
    throw new Error(`no "${name}" push-guard block in .husky/pre-push`);
  }

  return HOOK.slice(open, close);
}

const START = block("start");
const END = block("end");

/** Hermetic git: none of the caller's GIT_* variables, no global/system config. */
const ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};
const IDENTITY = ["-c", "user.name=t", "-c", "user.email=t@t"];

const fixtures = [];

after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

function git(cwd, ...args) {
  return execFileSync("git", [...IDENTITY, ...args], {
    cwd,
    env: ENV,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

/**
 * A repository with two commits, an ignored path and a bare `origin`, whose
 * pre-push hook is the guard's two blocks around `middle` — the stand-in for
 * the steps between them.
 */
function fixture(middle = "") {
  const root = mkdtempSync(join(tmpdir(), "push-guard-"));

  fixtures.push(root);
  const repo = join(root, "repo");
  const hooks = join(root, "hooks");

  git(root, "init", "-q", "--bare", "remote.git");
  git(root, "init", "-q", "-b", "main", "repo");
  writeFileSync(join(repo, ".gitignore"), "ignored.log\n");
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "one");
  writeFileSync(join(repo, "a.txt"), "two\n");
  git(repo, "commit", "-qam", "two");
  git(repo, "remote", "add", "origin", join(root, "remote.git"));

  mkdirSync(hooks);
  const hook = join(hooks, "pre-push");

  writeFileSync(
    hook,
    `#!/bin/sh\nset -e\n${START}\n${middle}\n${END}\necho "GUARD PASSED"\n`,
  );
  chmodSync(hook, 0o755);

  return { repo, hooks, remote: join(root, "remote.git") };
}

function push({ repo, hooks }, ...refspecs) {
  const result = spawnSync(
    "git",
    [
      ...IDENTITY,
      "-c",
      `core.hooksPath=${hooks}`,
      "push",
      "-q",
      "origin",
      ...refspecs,
    ],
    { cwd: repo, env: ENV, encoding: "utf8" },
  );

  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function assertPassed(result) {
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /GUARD PASSED/);
}

function assertRefused(result, reason) {
  assert.notEqual(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /GUARD PASSED/);
  assert.match(result.output, reason);
}

const DIRTY = /Uncommitted or untracked files/;
const NOT_HEAD = /would get [0-9a-f]+, but HEAD is [0-9a-f]+/;
const CHANGED = /The working tree changed while the checks ran/;

test("a clean push of HEAD passes", () => {
  const f = fixture();

  assertPassed(push(f, "main"));
  assert.equal(
    git(f.remote, "rev-parse", "main"),
    git(f.repo, "rev-parse", "HEAD"),
  );
});

test("an untracked file is refused", () => {
  const f = fixture();

  writeFileSync(join(f.repo, "new.txt"), "x\n");
  assertRefused(push(f, "main"), DIRTY);
});

test("a modified tracked file is refused", () => {
  const f = fixture();

  writeFileSync(join(f.repo, "a.txt"), "three\n");
  assertRefused(push(f, "main"), DIRTY);
});

test("a staged but uncommitted edit is refused", () => {
  const f = fixture();

  writeFileSync(join(f.repo, "a.txt"), "three\n");
  git(f.repo, "add", "a.txt");
  assertRefused(push(f, "main"), DIRTY);
});

test("an ignored file alone passes", () => {
  const f = fixture();

  writeFileSync(join(f.repo, "ignored.log"), "x\n");
  assertPassed(push(f, "main"));
});

test("a branch that is not HEAD is refused", () => {
  const f = fixture();

  git(f.repo, "branch", "older", "HEAD~1");
  assertRefused(push(f, "older"), NOT_HEAD);
});

test("HEAD~1:refs/heads/older is refused — the key is the remote ref", () => {
  const f = fixture();

  assertRefused(push(f, "HEAD~1:refs/heads/older"), NOT_HEAD);
});

test("an annotated tag passes, even on a commit that is not HEAD", () => {
  const f = fixture();

  git(f.repo, "tag", "-a", "v1", "-m", "v1", "HEAD~1");
  assertPassed(push(f, "refs/tags/v1"));
});

test("a branch deletion passes", () => {
  const f = fixture();

  assertPassed(push(f, "HEAD:refs/heads/gone"));
  assertPassed(push(f, ":refs/heads/gone"));
  assert.equal(
    spawnSync("git", ["rev-parse", "--verify", "-q", "gone"], {
      cwd: f.remote,
      env: ENV,
    }).status,
    1,
  );
});

test("a tree that changes while the checks run is refused by the final check", () => {
  const untracked = fixture("echo late > late.txt");
  const moved = fixture(
    "git -c user.name=t -c user.email=t@t commit -q --allow-empty -m late",
  );

  assertRefused(push(untracked, "main"), CHANGED);
  assertRefused(push(moved, "main"), CHANGED);
});

test("a detached HEAD pushed as HEAD:master passes", () => {
  const f = fixture();

  git(f.repo, "checkout", "-q", "--detach");
  assertPassed(push(f, "HEAD:refs/heads/master"));
});

test("the guard brackets the steps: first after `set -e`, last before ✅", () => {
  const lines = HOOK.split("\n");
  const at = (pattern) => lines.findIndex((line) => pattern.test(line));
  const startOpen = at(/^# >>> push guard: start/);
  const startClose = at(/^# <<< push guard: start/);
  const firstStep = at(/^(pnpm|node|\(unset) /);
  const endClose = at(/^# <<< push guard: end/);
  const done = at(/^echo "✅/);

  assert.ok(at(/^set -e$/) < startOpen, "set -e must precede the guard");
  assert.ok(
    startClose < firstStep,
    "the start block must run before the first step",
  );
  assert.ok(
    lines.slice(endClose + 1, done).every((line) => line.trim() === ""),
    "nothing may run between the end block and ✅",
  );
});
