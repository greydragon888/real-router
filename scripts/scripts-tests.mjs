#!/usr/bin/env node
// scripts-tests.mjs — the tests of `scripts/tests/`, in two groups by what they
// read.
//
//   node scripts/scripts-tests.mjs guards          # in place, uncached
//   node scripts/scripts-tests.mjs tooling         # the turbo task `//#test:tooling`
//   node scripts/scripts-tests.mjs tooling --here  # that task's own command
//
// `GUARDS` read the repository beyond its tooling — package code, the whole
// file list, the history, the workspace through pnpm or turbo — and run
// uncached. Every other test reads only what the turbo task `//#test:tooling`
// names as its inputs in `turbo.json`, so a run that leaves those files alone
// replays the group's last verdict from turbo's cache.
//
// The task runs its tests in a copy of its inputs, a git repository of its own
// with `node_modules` linked in. Their environment names the copy wherever it
// named the root and holds no `GITHUB_*` or `RUNNER_*` variable, so a test that
// reads beyond the inputs fails there rather than pass on a stale entry —
// except through the link, whose parent is the root. A new test that reads
// package code goes in `GUARDS`. The key also holds what no input does: the
// versions of Node, bash, git and jq and the OS release (`TOOLING_RUNTIME`),
// and a GitHub runner's image (`ImageOS`, `ImageVersion`).

import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { release, tmpdir } from "node:os";
import { delimiter, dirname, join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";

import { withoutGitEnv } from "./git-env.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TESTS = "scripts/tests";

/** The turbo task the tooling tests run as. */
export const TASK = "//#test:tooling";

/**
 * The tests that read the repository beyond its tooling, and so run
 * uncached. Every other test of `scripts/tests/` runs in the tooling task.
 */
export const GUARDS = new Set([
  "benchmarks-lint-filter",
  "build-matrix",
  "check-coverage-scope",
  "check-membership-predicate",
  "checkout-tarballs",
  "checks-registry",
  "cli-entry",
  "code-roots-authority",
  "codspeed-gate",
  "component-lint-config",
  "diff-carries-no-source",
  "examples-plan",
  "fsm-diagram-parity",
  "no-cycle-guard",
  "raiser-text-equality",
  "refusal-census",
  "repo-model",
  "scripts-lib-reach",
  "scripts-tests",
  "sonar-trusted-boundary",
  "sonar-tsconfig",
  "sync-config",
  "twin-lockstep",
  "url-plugin-defaults-parity",
  "workflow-path-filters",
]);

/**
 * The test files of a group, relative to `root`.
 *
 * @param {"guards" | "tooling"} group
 * @param {string} root
 * @returns {string[]}
 */
export function testsOf(group, root = ROOT) {
  return readdirSync(join(root, TESTS))
    .filter((file) => file.endsWith(".test.mjs"))
    .filter(
      (file) =>
        GUARDS.has(file.slice(0, -".test.mjs".length)) === (group === "guards"),
    )
    .sort()
    .map((file) => `${TESTS}/${file}`);
}

/**
 * The files the tooling task reads: the files of the repository, tracked or
 * not ignored, that its inputs in `turbo.json` name, with the global inputs
 * `globalConfiguration` adds to every task's. A file deleted from the working
 * tree is not one. A symbolic link is refused: turbo hashes a tracked link as
 * its text, and a copy of it would hold its target.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function taskInputs(root = ROOT) {
  const turbo = JSON.parse(readFileSync(join(root, "turbo.json"), "utf8"));
  const own = turbo.tasks?.[TASK]?.inputs;
  if (!Array.isArray(own)) {
    throw new Error(`turbo.json has no inputs for ${TASK}`);
  }
  const globs = [...own, ...(turbo.global?.inputs ?? [])];
  const include = globs.filter((glob) => !glob.startsWith("!"));
  const exclude = globs
    .filter((glob) => glob.startsWith("!"))
    .map((glob) => glob.slice(1).replace("$TURBO_ROOT$/", ""));
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", env: withoutGitEnv(process.env) },
  ).split("\0");

  const inputs = [];
  for (const file of files) {
    if (
      file === "" ||
      !include.some((glob) => matchesGlob(file, glob)) ||
      exclude.some((glob) => matchesGlob(file, glob))
    ) {
      continue;
    }
    const stat = lstatSync(join(root, file), { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      throw new Error(`${TASK} takes no symbolic link as an input: ${file}`);
    }
    if (stat !== undefined) inputs.push(file);
  }
  return inputs;
}

/**
 * `env` for a nested `node --test`: without `NODE_TEST_CONTEXT`, which a test
 * runner hands its children, and with which a nested run reports to that
 * runner and exits 0 whatever it found.
 *
 * @param {NodeJS.ProcessEnv} env
 */
const ownRun = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(([key]) => key !== "NODE_TEST_CONTEXT"),
  );

/**
 * `env` for the run in the copy, from a nested run's:
 *
 * - the copy wherever a value names `root` as a path — pnpm, turbo and the
 *   shell hand a task the root in `INIT_CWD`, `PATH` and more — and `PWD` the
 *   copy, whatever spelling of the root it held;
 * - no `GITHUB_*` or `RUNNER_*` variable: they change from one CI run to the
 *   next, and the key holds none of them;
 * - pnpm's check of the installation off, as pnpm sets it for every script
 *   it runs: a pnpm a test starts in the copy installs nothing into the
 *   linked `node_modules` on its own.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} root
 * @param {string} box
 */
function boxEnv(env, root, box) {
  const at = new RegExp(`${RegExp.escape(root)}(?=$|[/${delimiter}])`, "g");
  return {
    ...Object.fromEntries(
      Object.entries(ownRun(env))
        .filter(([key]) => !/^(?:GITHUB|RUNNER)_/.test(key))
        .map(([key, value]) => [key, value.replace(at, () => box)]),
    ),
    PWD: box,
    pnpm_config_verify_deps_before_run: "false",
  };
}

/**
 * The first line of a tool's `--version` in the C locale, or that it does not
 * run: bash translates its banner, and turbo hands the task `LANG` but not
 * `LC_ALL` or `LC_MESSAGES`.
 */
const versionOf = (tool) => {
  const run = spawnSync(tool, ["--version"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, LC_ALL: "C" },
  });
  return run.status === 0
    ? run.stdout.split("\n")[0].trim()
    : `${tool}: does not run`;
};

/** The versions of the tools the tooling tests run, and the OS release. */
export function runtime() {
  return [
    `node ${process.version} ${process.platform}-${process.arch} ${release()}`,
    versionOf("bash"),
    versionOf("git"),
    versionOf("jq"),
  ].join("; ");
}

/**
 * Copies the task's inputs from `root` into a fresh directory, links
 * `node_modules` in, commits the copy, runs the tooling tests there, and
 * removes it.
 *
 * @param {string} root
 * @param {"inherit" | "ignore"} stdio
 * @param {NodeJS.ProcessEnv} env the environment the tests get, pointed at
 *   the copy
 * @returns {number} the exit code of the tests
 */
export function runHere(root = ROOT, stdio = "inherit", env = process.env) {
  const box = realpathSync(mkdtempSync(join(tmpdir(), "tooling-tests-")));
  try {
    for (const file of taskInputs(root)) {
      mkdirSync(dirname(join(box, file)), { recursive: true });
      copyFileSync(join(root, file), join(box, file));
    }
    symlinkSync(join(root, "node_modules"), join(box, "node_modules"));
    // None of the caller's git config, global ignore file or template: a
    // global `commit.gpgsign` would sign the copy's commit, and a template's
    // hooks would run on it. A failing call carries git's own reason.
    const git = (...args) =>
      execFileSync("git", args, {
        cwd: box,
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          ...withoutGitEnv(env),
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_SYSTEM: "/dev/null",
        },
      });
    git("init", "-q", "--template=");
    mkdirSync(join(box, ".git", "info"), { recursive: true });
    writeFileSync(join(box, ".git", "info", "exclude"), "node_modules\n");
    git("-c", "core.excludesFile=/dev/null", "add", "-A");
    git(
      "-c",
      "user.name=tooling",
      "-c",
      "user.email=tooling@localhost",
      "commit",
      "-qm",
      "inputs",
    );

    const run = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=dot", ...testsOf("tooling", root)],
      { cwd: box, stdio, env: boxEnv(env, root, box) },
    );
    return run.status ?? 1;
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

/** Runs the guards in place. */
function runGuards() {
  const run = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=dot", ...testsOf("guards")],
    { cwd: ROOT, stdio: "inherit", env: ownRun(process.env) },
  );
  return run.status ?? 1;
}

/** Runs the tooling task through turbo, the tools' versions in its key. */
function runTask() {
  const run = spawnSync(
    "pnpm",
    ["turbo", "run", "test:tooling", "--filter=//"],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, TOOLING_RUNTIME: runtime() },
    },
  );
  if (run.error) console.error(run.error.message);
  return run.status ?? 1;
}

const USAGE = "usage: scripts-tests.mjs guards | tooling [--here]";

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv) {
  const key = argv.join(" ");
  if (key === "guards") return runGuards();
  if (key === "tooling") return runTask();
  if (key === "tooling --here") {
    // Run any other way, the task would cache a verdict under a key that
    // lacks the tools' versions.
    const found = runtime();
    if (process.env.TOOLING_RUNTIME !== found) {
      console.error(
        `${TASK} runs through \`node scripts/scripts-tests.mjs tooling\`, which puts the tools' versions in its key.\n` +
          `  key:   ${process.env.TOOLING_RUNTIME ?? "(none)"}\n` +
          `  found: ${found}`,
      );
      return 2;
    }
    return runHere();
  }
  console.error(USAGE);
  return 2;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
