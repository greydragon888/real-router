#!/usr/bin/env node
// examples-lint-filter.mjs — which workspaces linted by `lint:example` or
// `lint:bench` does a range reach from OUTSIDE them (#2402)?
//
//   node scripts/examples-lint-filter.mjs <base> <head> >> "$GITHUB_OUTPUT"
//
// prints `examples_lint_filter=--filter=<pkg> …`, empty when none, and
// `examples_lint_reasons=<reason>=<count> …` for the log. `ci.yml` asks it about
// a pull request and runs `turbo run lint:example lint:bench` with the filter.
//
// The answer is turbo's package-level `affected` reason. A workspace counts
// unless turbo gives it one of LOCAL_REASONS:
// - `FileChanged` — the range edits the workspace itself. "Examples (affected)"
//   builds the examples a pull request edits, and `build` lints them.
// - `DependencyChanged` — a library it depends on changed. That stays the weekly
//   `examples.yml`'s job, as the comment above "Examples (affected)" records.
// Anything else lints: a global input such as the root `eslint.config.mjs` or
// `turbo.json`, a lockfile change such as an ESLint bump, or a reason a later
// turbo adds.
//
// ⚠ Package-level, not `affectedTasks`. Measured on turbo 2.10.13, a one-line
// edit to one example reports all 143 `lint:example` tasks as `TaskFileChanged`
// naming that file, and a task keeps the first reason it is given — so a
// lockfile change in the same range is reported as a file change.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The lint tasks `.husky/pre-push` runs outside `lint`, which CI already runs. */
export const LINT_TASKS = ["lint:example", "lint:bench"];

/** Reasons already covered elsewhere — see the header. */
export const LOCAL_REASONS = new Set(["FileChanged", "DependencyChanged"]);

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
export function planExamplesLint(queryJson, lints = hasLintTask) {
  const items = JSON.parse(queryJson).data?.affectedPackages?.items;
  if (!Array.isArray(items)) {
    throw new Error(
      "examples-lint-filter: turbo query returned no affectedPackages",
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
    throw new Error("usage: examples-lint-filter.mjs <base> <head>");
  }
  const { packages, reasons } = planExamplesLint(runQuery(base, head));
  const filter = packages.map((p) => `--filter=${p}`).join(" ");
  const counts = [...reasons].map(([why, n]) => `${why}=${n}`).join(" ");
  process.stdout.write(`examples_lint_filter=${filter}\n`);
  process.stdout.write(`examples_lint_reasons=${counts}\n`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
