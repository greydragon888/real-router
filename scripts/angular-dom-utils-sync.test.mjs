// The angular dom-utils drift check must actually detect drift (#1838).
//
// `packages/angular/src/dom-utils` is a git-tracked COPY of `shared/dom-utils`;
// a shared edit that lands without re-running the sync leaves angular testing
// the stale copy while ng-packagr ships the fresh one (#810). The check lived
// inline in `ci.yml` only, so drift was committable locally and surfaced on the
// PR after a push and a full CI round. It is one script now, called by both
// `ci.yml` and `.husky/pre-commit` — and this file is what keeps it honest.
//
// ⚠ Why a test at all: the hook is executed by git, not by the suite, so nothing
// in the repo ever ran that code. Its terms were the one vector of the #1838
// attack pass that could not be mutated. This closes that.
//
// ⚠ The plant lives ~250 ms and is a trailing COMMENT, so a turbo run racing it
// costs at most a cache miss, never a wrong verdict. In CI the two never meet:
// `node --test scripts/*.test.mjs` is the repo-lints job, with its own checkout.
//
// ⚠ This test WRITES to the working tree — it plants drift and restores it in a
// `finally`. That is the only way to exercise a detector whose whole subject is
// the state of tracked files. The plant is a comment appended to one file, and
// the restore is a byte snapshot taken first.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs`.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = "scripts/check-angular-dom-utils-sync.mjs";
const COPY_FILE = join(ROOT, "packages/angular/src/dom-utils/link-utils.ts");
const SHARED_FILE = join(ROOT, "shared/dom-utils/link-utils.ts");
const HOOK = join(ROOT, ".husky/pre-commit");
const WORKFLOW = join(ROOT, ".github/workflows/ci.yml");

/** Runs the checker, returning its exit code and combined output. */
function check(env = {}) {
  try {
    const stdout = execFileSync("node", [SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    return { code: 0, output: stdout };
  } catch (error) {
    return {
      code: error.status,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

test("a clean tree passes", () => {
  assert.equal(check().code, 0);
});

/**
 * The gate answers "did the regeneration change anything the author has not
 * already written down". A `git status --porcelain` row is `XY`: `X` is
 * index-vs-HEAD, `Y` is worktree-vs-index, and only the SECOND answers that.
 *
 * ⚠ Unfiltered, this gate rejected every commit it exists to police: an author
 * who edits `shared/`, runs the sync and stages both sides produces `M ` — first
 * column set, second clean — indistinguishable from a copy nobody synced. `ci.yml`
 * never saw it, because it runs after the commit and its HEAD carries both sides.
 *
 * These two cells are what makes the filter unremovable. Without them, reverting
 * it leaves all of `scripts/*.test.mjs` green — measured.
 */
test("a STAGED, synced copy passes — the commit the gate exists to police", () => {
  const before = readFileSync(SHARED_FILE, "utf8");
  // ⚠ The copy may ALREADY be staged — this cell means something only on a
  // branch that edits `shared/dom-utils`, which is exactly a branch where it is.
  // A blind `git restore --staged` in the `finally` then hands the tree back in
  // a state it was not found in, and the NEXT cell's "a clean tree passes"
  // reads that as drift. Measured: it did, on the full `scripts/*.test.mjs` run,
  // and only there — the file alone was green.
  const wasStaged = execFileSync(
    "git",
    ["status", "--porcelain", "--", "packages/angular/src/dom-utils"],
    { cwd: ROOT, encoding: "utf8" },
  ).startsWith("M");

  try {
    writeFileSync(SHARED_FILE, `${before}\n// staged-and-synced probe\n`);
    execFileSync("node", ["packages/angular/scripts/sync-dom-utils.mjs"], {
      cwd: ROOT,
      stdio: "ignore",
    });
    execFileSync("git", ["add", "--", "packages/angular/src/dom-utils"], {
      cwd: ROOT,
    });

    assert.equal(check().code, 0, "a synced copy staged for commit must pass");
  } finally {
    writeFileSync(SHARED_FILE, before);
    execFileSync("node", ["packages/angular/scripts/sync-dom-utils.mjs"], {
      cwd: ROOT,
      stdio: "ignore",
    });
    execFileSync(
      "git",
      wasStaged
        ? ["add", "--", "packages/angular/src/dom-utils"]
        : ["restore", "--staged", "--", "packages/angular/src/dom-utils"],
      { cwd: ROOT },
    );
  }
});

test("a STALE copy still fails — the filter did not make the gate vacuous", () => {
  // The other polarity, and the reason the cell above is not enough on its own:
  // a filter wide enough to admit the staged case can be wide enough to admit
  // everything.
  const before = readFileSync(SHARED_FILE, "utf8");

  try {
    writeFileSync(SHARED_FILE, `${before}\n// stale-copy probe\n`);

    // The copy is deliberately NOT regenerated: this is the drift the gate owns.
    const result = check();

    assert.equal(result.code, 1, "a stale copy must still be refused");
    assert.match(result.output, /out of sync/);
  } finally {
    writeFileSync(SHARED_FILE, before);
    execFileSync("node", ["packages/angular/scripts/sync-dom-utils.mjs"], {
      cwd: ROOT,
      stdio: "ignore",
    });
  }
});

test("a shared edit that has not been synced is detected", () => {
  // ⚠ The plant goes in SHARED, not in the copy, and that is the whole
  // mechanism: the checker re-runs the sync and then asks git whether the copy
  // moved. Editing the copy alone is REPAIRED silently — the sync overwrites it
  // from shared, git sees nothing, and the check passes. Measured; the issue
  // that produced this work claims the check "fires in both directions", and
  // for an UNCOMMITTED copy-side edit it does not. (A committed one does: then
  // HEAD carries the drift and the regeneration shows up as a diff.)
  const sharedSnapshot = readFileSync(SHARED_FILE, "utf8");
  const copySnapshot = readFileSync(COPY_FILE, "utf8");

  try {
    writeFileSync(
      SHARED_FILE,
      `${sharedSnapshot}\n// drift planted by a test\n`,
    );

    const drifted = check();

    assert.equal(
      drifted.code,
      1,
      "an unsynced shared edit must fail the check",
    );
    assert.match(drifted.output, /out of sync/);
    assert.match(drifted.output, /packages\/angular\/src\/dom-utils/);

    // The checker regenerates rather than merely complaining — the developer's
    // job is to stage the copy, not to remember the sync command.
    assert.match(readFileSync(COPY_FILE, "utf8"), /drift planted by a test/);
  } finally {
    writeFileSync(SHARED_FILE, sharedSnapshot);
    writeFileSync(COPY_FILE, copySnapshot);
  }

  assert.equal(check().code, 0, "the tree must be clean again after the test");
});

test("under GitHub Actions the failure carries an ::error:: annotation", () => {
  const sharedSnapshot = readFileSync(SHARED_FILE, "utf8");
  const copySnapshot = readFileSync(COPY_FILE, "utf8");

  try {
    writeFileSync(SHARED_FILE, `${sharedSnapshot}\n// drift\n`);

    const annotated = check({ GITHUB_ACTIONS: "true" });

    // Without this the check would still fail CI, but as a line in a log rather
    // than a red annotation on the PR — which is what the inline workflow step
    // this script replaced produced.
    assert.match(annotated.output, /^::error::/m);
  } finally {
    writeFileSync(SHARED_FILE, sharedSnapshot);
    writeFileSync(COPY_FILE, copySnapshot);
  }
});

test("both callers invoke the ONE script, with no second copy of the logic", () => {
  // The duplication is what let the two drift apart in the first place: the
  // workflow had the check and the hook had nothing.
  const hook = readFileSync(HOOK, "utf8");
  const workflow = readFileSync(WORKFLOW, "utf8");

  assert.match(hook, /node scripts\/check-angular-dom-utils-sync\.mjs/);
  assert.match(workflow, /node scripts\/check-angular-dom-utils-sync\.mjs/);

  // Neither may re-implement it: a second `git status --porcelain` over the copy
  // is the shape that was there before.
  assert.doesNotMatch(
    workflow,
    /git status --porcelain packages\/angular\/src\/dom-utils/,
  );
});

test("the hook gates on the STAGED set, not on every commit", () => {
  // Ungated, the sync would regenerate the copy from a DIRTY unstaged
  // shared/dom-utils and fail a commit that touches neither.
  const hook = readFileSync(HOOK, "utf8");

  assert.match(
    hook,
    /git diff --cached --name-only \|\s*\n?\s*grep -qE '\^\(shared\/dom-utils\/\|packages\/angular\/src\/dom-utils\/\)'/,
  );
});
