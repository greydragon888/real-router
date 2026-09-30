// git-env.mjs — git's repository variables, taken off a child's environment.
//
// A hook runs with git's repository-local variables set: GIT_DIR on a push from
// a linked worktree, GIT_INDEX_FILE in pre-commit. A child that inherits them
// aims its own git calls at this repository's directory and index. Two
// functions, not a flag (CLAUDE.md, "A boolean parameter is a hypothesis"):
//
//   - gitEnvForStage(stage, env) — what `scripts/verify.mjs` gives a check of a
//     stage: every local variable off, except GIT_INDEX_FILE in pre-commit,
//     where it names the index of the commit being made, so the checks judge
//     exactly what is committed;
//   - withoutGitEnv(env) — every local variable off, for a check that builds a
//     repository of its own: inherited, GIT_INDEX_FILE is an absolute path to
//     the index of the commit in progress, and that repository's `git add`
//     would write into it.

import { execFileSync } from "node:child_process";

/** @type {string[] | undefined} */
let names;

/** The variables `git rev-parse --local-env-vars` lists. */
export function localEnvVars() {
  names ??= execFileSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
    // The list is fixed; asked with the caller's GIT_* variables it would
    // depend on whatever repository they name.
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    ),
  })
    .split("\n")
    .filter(Boolean);
  return names;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} drop
 */
function omit(env, drop) {
  const out = { ...env };
  for (const name of drop) delete out[name];
  return out;
}

/**
 * `env` without any of git's repository variables.
 *
 * @param {NodeJS.ProcessEnv} env
 */
export function withoutGitEnv(env) {
  return omit(env, localEnvVars());
}

/**
 * `env` for a check of `stage`: git's repository variables off, except
 * GIT_INDEX_FILE in pre-commit.
 *
 * @param {"pre-commit" | "pre-push" | "ci"} stage
 * @param {NodeJS.ProcessEnv} env
 */
export function gitEnvForStage(stage, env) {
  const kept = stage === "pre-commit" ? ["GIT_INDEX_FILE"] : [];
  return omit(
    env,
    localEnvVars().filter((name) => !kept.includes(name)),
  );
}
