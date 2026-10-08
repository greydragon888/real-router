#!/usr/bin/env node
// verify.mjs — runs the checks of one stage of the check registry.
//
//   node scripts/verify.mjs --stage <pre-commit|pre-push|ci>
//                           [--context <skip>[,<skip>…]] [--registry <file>]
//
// The git hooks and CI's Repo Lints call this instead of keeping a list of
// their own; the list is `scripts/checks.mjs` (`--registry` points elsewhere
// for a test). The checks of the stage run in the order of the registry, and
// the first failure stops the run with that check's exit code — as `set -e`
// stops a hook and a failed step stops a GitHub job.
//
//   - Each check runs without a shell, and without git's repository variables
//     except GIT_INDEX_FILE in pre-commit (`scripts/git-env.mjs`).
//   - Each check sees VERIFY_STAGE, the stage it runs in.
//   - A tool of `tools` that is not on PATH: a loud SKIP in a hook, a FAIL
//     (exit 127) in CI. An element that is a list is alternatives.
//   - --context names the CI contexts of this run: a check whose `ciSkip` names
//     one of them is skipped, with the reason, before its tools are looked for.
//     In CI without --context, `contextsOf` derives them from the facts the
//     step passes in its env.
//   - In CI each check runs in a `::group::`, and $GITHUB_STEP_SUMMARY gets a
//     table of what ran.

import { spawnSync } from "node:child_process";
import { accessSync, appendFileSync, constants, statSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { gitEnvForStage } from "./git-env.mjs";

export const STAGES = ["pre-commit", "pre-push", "ci"];
export const CONTEXTS = [
  "dependabot-pr",
  "no-source",
  "dependabot-actor-with-dedupe-fixer",
  "release-pr",
];

/** The names `contextsOf` reads: the facts Repo Lints' step passes in its env. */
export const CONTEXT_FACTS = [
  "PR_AUTHOR",
  "ACTOR",
  "HAS_DEDUPE_FIXER",
  "HEAD_REF",
  "HEAD_REPO",
  "REPO",
  "NO_SOURCE",
];

const DEPENDABOT = "dependabot[bot]";

/** The head prefix of Dependabot's pull requests for a GitHub Action. */
export const DEPENDABOT_ACTIONS = "dependabot/github_actions/";

/**
 * The CI contexts a run matches, from the facts in `env`. A fact that is unset
 * counts as false.
 *
 *   - `dependabot-pr`: Dependabot opened the pull request (PR_AUTHOR) for a
 *     package. One it opens for a GitHub Action, its head under
 *     `DEPENDABOT_ACTIONS` (HEAD_REF), changes the workflows the tests of
 *     `scripts/` read, and takes no `dependabot-pr`. The head is compared
 *     without case, as `startsWith` in `codeql.yml` compares it: it only takes
 *     this context away, so it keeps no check from a pull request.
 *   - `no-source`: its diff carries no source (NO_SOURCE, the `check` job's
 *     output).
 *   - `dependabot-actor-with-dedupe-fixer`: Dependabot started the run, and the
 *     lockfile fixer can push (ACTOR, HAS_DEDUPE_FIXER).
 *   - `release-pr`: the release PR — its head is exactly
 *     `changeset-release/master`, compared with case, from this repository,
 *     and its diff carries no source (HEAD_REF, HEAD_REPO, REPO, NO_SOURCE). A
 *     branch name is the author's choice, a fork's author included, and a diff
 *     without source is any dependency bump too, so neither decides alone: one
 *     source file in the release branch still reaches every check.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function contextsOf(env) {
  const noSource = env.NO_SOURCE === "true";
  const contexts = [];

  if (
    env.PR_AUTHOR === DEPENDABOT &&
    !(env.HEAD_REF ?? "").toLowerCase().startsWith(DEPENDABOT_ACTIONS)
  ) {
    contexts.push("dependabot-pr");
  }
  if (noSource) contexts.push("no-source");
  if (env.ACTOR === DEPENDABOT && env.HAS_DEDUPE_FIXER === "true") {
    contexts.push("dependabot-actor-with-dedupe-fixer");
  }
  if (
    env.HEAD_REF === "changeset-release/master" &&
    Boolean(env.REPO) &&
    env.HEAD_REPO === env.REPO &&
    noSource
  ) {
    contexts.push("release-pr");
  }

  return contexts;
}

const USAGE =
  "usage: verify.mjs --stage <pre-commit|pre-push|ci> " +
  "[--context <skip>[,<skip>…]] [--registry <file>]";

class UsageError extends Error {}

/**
 * @param {string[]} argv
 * @returns {{ stage: string, context?: string[], registry?: string }}
 */
export function parseArgs(argv) {
  /** @type {{ stage?: string, context?: string[], registry?: string }} */
  const args = {};

  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new UsageError(`${flag} needs a value`);
    if (flag === "--stage") args.stage = value;
    else if (flag === "--context") args.context = value.split(",").filter(Boolean);
    else if (flag === "--registry") args.registry = value;
    else throw new UsageError(`unknown argument: ${flag}`);
  }

  if (!STAGES.includes(args.stage ?? "")) {
    throw new UsageError(`--stage must be one of ${STAGES.join(", ")}`);
  }
  for (const context of args.context ?? []) {
    if (!CONTEXTS.includes(context)) {
      throw new UsageError(`unknown --context: ${context}`);
    }
  }

  return /** @type {{ stage: string, context?: string[], registry?: string }} */ (
    args
  );
}

/**
 * Whether an executable file `name` is in a directory of `path`.
 *
 * @param {string} name
 * @param {string | undefined} path
 */
export function onPath(name, path) {
  for (const dir of (path ?? "").split(delimiter)) {
    if (!dir) continue;
    const file = join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return true;
    } catch {
      // not here
    }
  }
  return false;
}

/**
 * The first element of `tools` none of whose alternatives is on `path`, as the
 * message names it, or `undefined`.
 *
 * @param {{ tools?: (string | string[])[] }} check
 * @param {string | undefined} path
 */
export function missingTool(check, path) {
  for (const tool of check.tools ?? []) {
    const options = Array.isArray(tool) ? tool : [tool];
    if (!options.some((name) => onPath(name, path))) {
      return options.join(" or ");
    }
  }
  return undefined;
}

/**
 * What the stage does with each of its checks, in registry order. In CI a
 * `ciSkip` match comes first: a skipped check needs no tool.
 *
 * @param {import("./checks.mjs").Check[]} checks
 * @param {string} stage
 * @param {string[]} context
 * @param {string | undefined} path
 * @returns {{ check: import("./checks.mjs").Check, action: "run" | "skip" | "fail", reason?: string }[]}
 */
export function plan(checks, stage, context, path) {
  return checks
    .filter((check) => check.stages.includes(stage))
    .map((check) => {
      if (stage === "ci") {
        const skip = (check.ciSkip ?? []).find((c) => context.includes(c));
        if (skip) return { check, action: "skip", reason: `ciSkip ${skip}` };
      }

      const missing = missingTool(check, path);
      if (missing === undefined) return { check, action: "run" };

      return stage === "ci"
        ? { check, action: "fail", reason: `${missing} not found` }
        : {
            check,
            action: "skip",
            reason: `${missing} not found — the check did NOT run`,
          };
    });
}

/**
 * The exit code a finished child stands for.
 *
 * @param {import("node:child_process").SpawnSyncReturns<Buffer>} run
 */
function exitCode(run) {
  if (run.error) return 127;
  if (run.status !== null) return run.status;
  const signal = run.signal ? osConstants.signals[run.signal] : undefined;
  return signal === undefined ? 1 : 128 + signal;
}

/**
 * @param {string | undefined} file
 * @param {string} stage
 * @param {[string, string, string][]} rows
 */
function writeSummary(file, stage, rows) {
  if (!file) return;
  const table = [
    `### verify --stage ${stage}`,
    "",
    "| Check | Result | Time |",
    "|---|---|---|",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
  ];
  appendFileSync(file, `${table.join("\n")}\n`);
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`verify: ${error.message}`);
    console.error(USAGE);
    return 2;
  }

  const registry = args.registry
    ? pathToFileURL(resolve(args.registry)).href
    : new URL("checks.mjs", import.meta.url).href;
  const { CHECKS } = await import(registry);

  const inCi = args.stage === "ci";
  const env = { ...gitEnvForStage(args.stage, process.env), VERIFY_STAGE: args.stage };
  const context = args.context ?? (inCi ? contextsOf(process.env) : []);
  if (inCi) console.log(`CI contexts: ${context.join(", ") || "none"}`);

  /** @type {[string, string, string][]} */
  const rows = [];
  let failed = 0;

  for (const { check, action, reason } of plan(
    CHECKS,
    args.stage,
    context,
    process.env.PATH,
  )) {
    if (failed) {
      rows.push([check.id, "not run", ""]);
      continue;
    }
    if (action === "skip") {
      console.log(`⏭️  SKIP ${check.id}: ${reason}`);
      rows.push([check.id, `skipped: ${reason}`, ""]);
      continue;
    }
    if (action === "fail") {
      console.log(`❌ ${check.id}: ${reason}`);
      rows.push([check.id, `FAILED: ${reason}`, ""]);
      failed = 127;
      continue;
    }

    console.log(inCi ? `::group::${check.id}` : `▶ ${check.id} — ${check.why}`);
    const start = performance.now();
    const run = spawnSync(check.run[0], check.run.slice(1), {
      stdio: "inherit",
      env,
    });
    const time = `${((performance.now() - start) / 1000).toFixed(1)} s`;
    if (inCi) console.log("::endgroup::");

    const code = exitCode(run);
    if (run.error) console.log(`❌ ${check.id}: ${run.error.message}`);
    if (code === 0) {
      rows.push([check.id, "passed", time]);
    } else {
      console.log(`❌ ${check.id} failed with exit code ${code}`);
      rows.push([check.id, `FAILED: exit ${code}`, time]);
      failed = code;
    }
  }

  writeSummary(process.env.GITHUB_STEP_SUMMARY, args.stage, rows);
  if (!failed) console.log(`✅ verify --stage ${args.stage}: no check failed`);
  return failed;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
