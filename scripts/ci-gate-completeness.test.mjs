// ci-gate-completeness.test.mjs — meta-test: every ci.yml job is wired into
// the single required check ("CI Result"), or explicitly allowlisted.
//
// Run:  node --test scripts/ci-gate-completeness.test.mjs
//
// Why this exists (debt-map axis A6, the #1127 class): the repo's gate model
// is "one required status check" — the `ci` job aggregates every other job via
// `needs` and the branch ruleset requires only that context. The model's
// failure mode is silent: a job NOT listed in the gate's `needs` can go red
// while the PR stays mergeable (#1127: `coverage` ran the R2.4 shard-integrity
// guard, failed loudly, and gated nothing). Nothing structural prevented the
// recurrence — a job added tomorrow is outside the gate by default. This test
// makes that class fail loudly: a new job must either join the gate's `needs`
// or be added to OUTSIDE_GATE with a written reason.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace; the repo-lints `node --test scripts/*.test.mjs` step picks this
// file up by glob, so the preventer needs no wiring of its own.
//
// Deliberately NOT a YAML library: the two extractors below are single-purpose
// and fail-closed — if ci.yml is restructured so they can't parse it, the
// assertions fail and point here, they don't silently pass.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const CI_YML = join(repoRoot, ".github", "workflows", "ci.yml");

/** The aggregator job required by the `protect-master` ruleset. */
export const GATE_JOB = "ci";

/**
 * Jobs deliberately OUTSIDE the gate. Every entry carries its reason; the
 * test fails when an entry disappears from ci.yml (stale allowlist) or shows
 * up in the gate's `needs` (allowlist entry no longer true — remove it).
 */
export const OUTSIDE_GATE = new Map([
  [
    "duplication",
    "informational jscpd SARIF channel — the hard 2% threshold deliberately " +
      "lives in the pre-push hook, not CI (#813)",
  ],
  [
    "bundle-size",
    "informational size-limit PR comment — 'not a gate' by design " +
      "(infra-review W4 §3.4); its latency/failure must not move the merge point",
  ],
  [
    "sonarcloud",
    "taken off the CI Result critical path (its ~90s scan was the longest " +
      "serial tail of the required check); the job still runs and posts its " +
      "own PR status. Gating moves to the master ruleset's required checks — " +
      "adding the 'SonarCloud' context there is a tracked follow-up in #1520; " +
      "until then the quality gate is advisory. Revert = re-add `sonarcloud` " +
      "to the ci job's needs + the SONAR arm in 'Determine result'.",
  ],
]);

/**
 * Extract top-level job ids from a workflow YAML text: identifiers indented
 * exactly two spaces under the top-level `jobs:` key.
 */
export function parseJobs(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start === -1) return [];
  const jobs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[^\s#]/.test(line)) break; // next top-level section
    const m = /^ {2}([A-Za-z_][\w-]*):/.exec(line);
    if (m) jobs.push(m[1]);
  }
  return jobs;
}

/**
 * Extract the `needs` list of one job. Supports both styles:
 * flow (`needs: [a, b]`) and block (`needs:` + `- a` items).
 * Returns [] when the job has no `needs`.
 */
export function parseNeeds(yaml, jobId) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`  ${jobId}:`));
  if (start === -1) return [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {2}[A-Za-z_][\w-]*:/.test(line)) break; // next job
    const flow = /^ {4}needs:\s*\[([^\]]*)\]/.exec(line);
    if (flow) {
      return flow[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (/^ {4}needs:\s*(#.*)?$/.test(line)) {
      const items = [];
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^ {6}- ([\w-]+)\s*(#.*)?$/.exec(lines[j]);
        if (!item) break;
        items.push(item[1]);
      }
      return items;
    }
  }
  return [];
}

/**
 * Pure core of the check — also exercised on fixtures below so the test's
 * discriminating power does not depend on the current (healthy) ci.yml.
 */
export function findViolations(yaml, outsideGate = OUTSIDE_GATE) {
  const jobs = parseJobs(yaml);
  const needs = new Set(parseNeeds(yaml, GATE_JOB));
  return {
    jobs,
    needs,
    gateMissing: !jobs.includes(GATE_JOB) || needs.size === 0,
    // The #1127 class: a job whose red X would not block merge.
    ungated: jobs.filter(
      (j) => j !== GATE_JOB && !needs.has(j) && !outsideGate.has(j),
    ),
    // needs entries pointing at nothing (job renamed/removed under the gate).
    unknownNeeds: [...needs].filter((n) => !jobs.includes(n)),
    // Allowlist hygiene: entry gone from ci.yml, or actually wired after all.
    staleAllowlist: [...outsideGate.keys()].filter((j) => !jobs.includes(j)),
    allowlistedButWired: [...outsideGate.keys()].filter((j) => needs.has(j)),
  };
}

// --------------------------------------------------------------------------
// Fixture-level tests: prove the check FAILS on the mutations it exists for
// (a green run on the real file means nothing if these don't discriminate).
// --------------------------------------------------------------------------

const FIXTURE = `name: X
jobs:
  check:
    runs-on: ubuntu-latest
  coverage:
    needs: [check]
  bundle-size:
    needs: [check]
  ci:
    needs: [check, coverage]
`;

test("fixture: fully wired workflow has no violations", () => {
  const v = findViolations(FIXTURE, new Map([["bundle-size", "info-only"]]));
  assert.equal(v.gateMissing, false);
  assert.deepEqual(v.ungated, []);
  assert.deepEqual(v.unknownNeeds, []);
  assert.deepEqual(v.staleAllowlist, []);
  assert.deepEqual(v.allowlistedButWired, []);
});

test("fixture: the #1127 mutation (job dropped from the gate's needs) is caught", () => {
  const mutated = FIXTURE.replace("needs: [check, coverage]", "needs: [check]");
  const v = findViolations(mutated, new Map([["bundle-size", "info-only"]]));
  assert.deepEqual(v.ungated, ["coverage"]);
});

test("fixture: a brand-new job outside the gate is caught", () => {
  const mutated = FIXTURE.replace(
    "  ci:",
    "  phantom:\n    runs-on: ubuntu-latest\n  ci:",
  );
  const v = findViolations(mutated, new Map([["bundle-size", "info-only"]]));
  assert.deepEqual(v.ungated, ["phantom"]);
});

test("fixture: a needs entry for a renamed/removed job is caught", () => {
  const mutated = FIXTURE.replace("  coverage:\n    needs: [check]\n", "");
  const v = findViolations(mutated, new Map([["bundle-size", "info-only"]]));
  assert.deepEqual(v.unknownNeeds, ["coverage"]);
});

test("fixture: allowlist hygiene — stale and redundantly-wired entries are caught", () => {
  const allow = new Map([
    ["bundle-size", "info-only"],
    ["ghost", "no longer exists"],
    ["coverage", "wired after all"],
  ]);
  const v = findViolations(FIXTURE, allow);
  assert.deepEqual(v.staleAllowlist, ["ghost"]);
  assert.deepEqual(v.allowlistedButWired, ["coverage"]);
});

test("fixture: block-style needs is parsed too", () => {
  const block = `jobs:
  a:
    runs-on: x
  ci:
    needs:
      - a
`;
  assert.deepEqual(parseNeeds(block, "ci"), ["a"]);
  const v = findViolations(block, new Map());
  assert.deepEqual(v.ungated, []);
});

// --------------------------------------------------------------------------
// The real check against .github/workflows/ci.yml.
// --------------------------------------------------------------------------

const real = findViolations(readFileSync(CI_YML, "utf8"));

test("ci.yml: gate job exists and aggregates via needs", () => {
  assert.equal(
    real.gateMissing,
    false,
    `gate job '${GATE_JOB}' not found or has an empty needs list — ` +
      "if the aggregator was renamed, update GATE_JOB in this test",
  );
  // Parser sanity: a restructured ci.yml must not degrade into "0 jobs seen".
  assert.ok(
    real.jobs.length >= 5,
    `parseJobs() saw only ${real.jobs.length} jobs — ci.yml layout changed?`,
  );
});

test("ci.yml: every job is in the gate's needs or explicitly allowlisted (#1127 class)", () => {
  assert.deepEqual(
    real.ungated,
    [],
    `job(s) [${real.ungated.join(", ")}] are neither in '${GATE_JOB}'.needs ` +
      "nor in OUTSIDE_GATE — their red X would NOT block merge (the #1127 " +
      "class). Wire the job into the gate (needs + the result checks in " +
      "'Determine result') or allowlist it here with a written reason.",
  );
});

test("ci.yml: gate needs reference existing jobs only", () => {
  assert.deepEqual(
    real.unknownNeeds,
    [],
    `'${GATE_JOB}'.needs references non-existent job(s) ` +
      `[${real.unknownNeeds.join(", ")}] — renamed without updating the gate?`,
  );
});

test("ci.yml: OUTSIDE_GATE allowlist is current", () => {
  assert.deepEqual(
    real.staleAllowlist,
    [],
    `allowlisted job(s) [${real.staleAllowlist.join(", ")}] no longer exist ` +
      "in ci.yml — drop them from OUTSIDE_GATE",
  );
  assert.deepEqual(
    real.allowlistedButWired,
    [],
    `allowlisted job(s) [${real.allowlistedButWired.join(", ")}] are in the ` +
      "gate's needs — the allowlist reason is no longer true, remove the entry",
  );
});
