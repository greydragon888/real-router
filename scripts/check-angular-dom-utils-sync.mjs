#!/usr/bin/env node
/**
 * `packages/angular/src/dom-utils` is a git-tracked COPY of `shared/dom-utils`
 * (ng-packagr does not follow symlinks the way tsdown does; `prebundle`
 * re-materializes it). A `shared/dom-utils` edit that lands without re-running
 * the sync leaves angular's tests exercising the stale committed copy while
 * ng-packagr ships the fresh one — green CI, untested dist (#810).
 *
 * This script re-runs the sync and fails when the committed copy was out of
 * date. It is the ONE implementation of that check: `ci.yml` and
 * `.husky/pre-commit` both call it (#1838). It used to live inline in the
 * workflow only, so drift was committable locally and surfaced on the PR, after
 * a push and a full CI round.
 *
 * ⚠ `git status --porcelain`, not `git diff`: a newly added shared file is
 * UNTRACKED in the copy, and `git diff` does not report untracked paths.
 *
 * The rewrite is byte-identical when the copy is in sync, so a healthy run
 * leaves the tree untouched and downstream turbo hashes unaffected. ~114 ms.
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COPY = "packages/angular/src/dom-utils";

/**
 * ⚠ `cwd: ROOT`, not the caller's. The hook and the workflow both happen to run
 * from the repo root, so no test here can red its removal — but the paths below
 * are repo-relative, and a run from anywhere else would sync nothing and report
 * a clean tree. Verified by hand from `/tmp`: with the option, exit 0; without
 * it, the process dies on the missing script.
 */
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" });

run("node", ["packages/angular/scripts/sync-dom-utils.mjs"]);

// `.trim()` is for the PRINTED block below, not for the test: `git status
// --porcelain` yields "" when clean, which is falsy either way. Mutating it away
// leaves every cell green, so it is named here rather than left to look load-bearing.
const drift = run("git", ["status", "--porcelain", COPY]).trim();

if (drift) {
  console.error(drift);
  // ⚠ The GitHub annotation is not decoration: the inline workflow step this
  // script replaced emitted `::error::`, and losing it would downgrade a failed
  // check from a red annotation on the PR to a line in a log nobody opens.
  if (process.env.GITHUB_ACTIONS === "true") {
    console.error(
      `::error::${COPY} is out of sync with shared/dom-utils — run ` +
        `'pnpm -F @real-router/angular bundle' (or node ` +
        `packages/angular/scripts/sync-dom-utils.mjs) and commit the result`,
    );
  }

  console.error(
    `✖ ${COPY} was out of sync with shared/dom-utils.\n` +
      `  It has been regenerated — review it, 'git add ${COPY}', and commit again.\n` +
      `  (CI runs the same check: a stale copy means angular tests the old code while ng-packagr ships the new.)`,
  );
  process.exit(1);
}

console.error(`✓ ${COPY} is in sync with shared/dom-utils`);
