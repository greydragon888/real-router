#!/usr/bin/env node
// benchmarks-lint-filter.mjs — which workspaces linted by `lint:bench` does a
// range reach, by an edit to them or from outside them (#2402)? Today that is
// `router-benchmarks` alone: the examples and `cross-router-bench` are
// workspaces of their own, which turbo does not see.
//
//   node scripts/benchmarks-lint-filter.mjs <base> <head> >> "$GITHUB_OUTPUT"
//
// prints `benchmarks_lint_filter=--filter=<pkg> …`, empty when none, and
// `benchmarks_lint_reasons=<reason>=<count> …` for the log. `ci.yml` asks it
// about a pull request and runs `turbo run lint:bench` with the filter.
//
// The answer is turbo's package-level `affected` reason. A workspace counts
// unless turbo gives it one of LOCAL_REASONS:
// - `DependencyChanged` — a library it depends on changed; pre-push and the
//   weekly lint in `cross-router-bench.yml` read it.
// Anything else lints: an edit to the workspace itself (`FileChanged`) — the
// pipeline runs no `lint:bench` —, a global input such as the root
// `eslint.config.mjs` or `turbo.json`, a lockfile change such as an ESLint
// bump, or a reason a later turbo adds.
//
// ⚠ With `futureFlags.affectedUsingTaskInputs` on, turbo 2.11 reports
// `router-benchmarks` as `DependencyChanged` even when the range edits it, and
// nothing lints. The flag is off: IMPLEMENTATION_NOTES "turbo 2.11:
// `affectedUsingTaskInputs` is off".
//
// ⚠ Package-level, not `affectedTasks`. Measured on turbo 2.10.13, a one-line
// edit to one example reports all 143 `lint:example` tasks as `TaskFileChanged`
// naming that file, and a task keeps the first reason it is given — so a
// lockfile change in the same range is reported as a file change.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { LINT_TASK_ROLES } from "./lint-tasks.mjs";

/**
 * The lint tasks no pipeline job runs: the "outside-pipeline" keys of
 * `scripts/lint-tasks.mjs`, which says why a package's `lint` stays out.
 */
export const LINT_TASKS = Object.keys(LINT_TASK_ROLES).filter(
  (task) => LINT_TASK_ROLES[task] === "outside-pipeline",
);

/** Reasons already covered elsewhere — see the header. */
export const LOCAL_REASONS = new Set(["DependencyChanged"]);

/** Whether the workspace at `dir` declares one of LINT_TASKS. */
export function hasLintTask(dir) {
  const manifest = join(dir, "package.json");
  if (!dir || !existsSync(manifest)) return false;
  const { scripts = {} } = JSON.parse(readFileSync(manifest, "utf8"));
  return LINT_TASKS.some((task) => task in scripts);
}

/**
 * The workspaces to lint, sorted, and how many each reason contributed.
 *
 * @param {string} queryJson raw stdout of {@link runQuery}
 * @param {(dir: string) => boolean} [lints] injectable {@link hasLintTask}
 * @returns {{ packages: string[], reasons: Map<string, number> }}
 */
export function planBenchmarksLint(queryJson, lints = hasLintTask) {
  const items = JSON.parse(queryJson).data?.affectedPackages?.items;
  if (!Array.isArray(items)) {
    throw new Error(
      "benchmarks-lint-filter: turbo query returned no affectedPackages",
    );
  }
  const packages = [];
  const reasons = new Map();
  for (const { name, path, reason } of items) {
    const why = reason.__typename;
    if (LOCAL_REASONS.has(why) || !lints(path ?? "")) continue;
    packages.push(name);
    reasons.set(why, (reasons.get(why) ?? 0) + 1);
  }
  return { packages: packages.sort(), reasons };
}

/** The native affected query over the range (separated so tests never spawn turbo). */
export function runQuery(base, head) {
  return execFileSync(
    "pnpm",
    [
      "exec",
      "turbo",
      "query",
      "affected",
      "--base",
      base,
      "--head",
      head,
      "--packages",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

export function main(argv) {
  const [base, head] = argv;
  if (!base || !head) {
    throw new Error("usage: benchmarks-lint-filter.mjs <base> <head>");
  }
  const { packages, reasons } = planBenchmarksLint(runQuery(base, head));
  const filter = packages.map((p) => `--filter=${p}`).join(" ");
  const counts = [...reasons].map(([why, n]) => `${why}=${n}`).join(" ");
  process.stdout.write(`benchmarks_lint_filter=${filter}\n`);
  process.stdout.write(`benchmarks_lint_reasons=${counts}\n`);
}

if (import.meta.main) {
  main(process.argv.slice(2));
}
