// sonar-producer.test.mjs — exactly one producer of the required `SonarCloud`
// context, whichever repository a pull request comes from (#2442).
//
// Run:  node --test scripts/sonar-producer.test.mjs
//       (the `node --test scripts/*.test.mjs` step in ci.yml and in pre-push)
//
// `SonarCloud` is required by the `protect-master` ruleset beside `CI Result`.
// Two workflows can now post it: `ci.yml`'s `sonar` job for a pull request from
// this repository, and `sonar-trusted.yml` for a fork's — the fork path exists
// because such a run gets no secrets and the scan dies at "Secret source: None"
// (#1868). That split has two failure directions and both are silent:
//
//   BOTH post   — two entries under one required context, and which one the
//                 ruleset reads is not something this repository decides.
//   NEITHER     — the pull request waits on a context nobody produces, forever.
//
// So the conditions have to partition the cases, and the in-CI job's own `if`
// must carry nothing else: a job skipped by `if:` posts no status, which is the
// NEITHER direction.
//
// Since #2441 the fork side is two jobs rather than one — `gate` for a CI run
// that succeeded and `ci-failed` for one that did not — so the partition is
// over (head repository x conclusion) and the complement on `conclusion` is
// pinned here as well.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (name) =>
  readFileSync(join(repoRoot, ".github", "workflows", name), "utf8");

const ci = read("ci.yml");
const trusted = read("sonar-trusted.yml");

/** The context the ruleset requires. */
export const CONTEXT = "SonarCloud";

/** The `if:` of a job, as written, folded to one line. */
function jobIf(yaml, job) {
  const at = yaml.indexOf(`\n  ${job}:\n`);
  assert.notEqual(at, -1, `no job ${job}`);

  const body = yaml.slice(at);
  const m = /\n {4}if: (>-\n(?: {6}.*\n)+|.*\n)/.exec(body);
  assert.ok(m, `job ${job} has no if:`);

  return m[1].replace(/>-|\n|\s+/g, " ").trim();
}

test("the in-CI job runs for a pull request from THIS repository", () => {
  const condition = jobIf(ci, "sonar");

  assert.match(
    condition,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
});

test("the trusted gate runs for a pull request from ANOTHER one", () => {
  const condition = jobIf(trusted, "gate");

  assert.match(
    condition,
    /github\.event\.workflow_run\.head_repository\.full_name != github\.repository/,
  );
});

test("the two are mirror images, so they cannot both fire or both stay silent", () => {
  const inCi = jobIf(ci, "sonar");
  const fork = jobIf(trusted, "gate");

  const same = /head\.repo\.full_name == github\.repository/.test(inCi);
  const other = /head_repository\.full_name != github\.repository/.test(fork);

  assert.ok(same && other, "one of the two conditions has stopped mirroring");
  // Neither may carry the other's polarity, which is how a rewrite turns a
  // mirror into an overlap without either line looking wrong on its own.
  assert.doesNotMatch(inCi, /head\.repo\.full_name != github\.repository/);
  assert.doesNotMatch(fork, /head_repository\.full_name == github\.repository/);
});

test("the fork side splits on the conclusion, and the split is a complement", () => {
  // `gate` refuses a run that did not succeed, because it has no artifacts to
  // read. A refusal that posts nothing leaves the required context on
  // `Expected` for good — so the complement has to exist and has to report.
  const gate = jobIf(trusted, "gate");
  const failed = jobIf(trusted, "ci-failed");

  assert.match(gate, /workflow_run\.conclusion == 'success'/);
  assert.match(failed, /workflow_run\.conclusion != 'success'/);
  // Neither may carry the other's polarity: that is how a complement silently
  // becomes an overlap, or a gap, with both lines looking right alone.
  assert.doesNotMatch(gate, /workflow_run\.conclusion != 'success'/);
  assert.doesNotMatch(failed, /workflow_run\.conclusion == 'success'/);

  // And it is the FORK side, not a third producer on the same-repository path.
  assert.match(
    failed,
    /github\.event\.workflow_run\.head_repository\.full_name != github\.repository/,
  );
});

test("the complement job posts the context, and is not named after it", () => {
  const at = trusted.indexOf("\n  ci-failed:\n");
  assert.notEqual(at, -1, "no ci-failed job");
  const body = trusted.slice(at, trusted.indexOf("\n  gate:\n", at));

  assert.match(
    body,
    /-f context="\$STATUS_CONTEXT"/,
    "it must post the required context",
  );
  assert.match(
    body,
    /-f state=success/,
    "a verdict that there is nothing to analyse is a PASS with a reason, " +
      "not a failure — the PR is already blocked by `CI Result`",
  );
  // It reads no artifact: `pr-meta` is written by the last steps of `check`,
  // so a run that died earlier never uploaded one.
  assert.doesNotMatch(body, /download-artifact/);
  assert.match(body, /workflow_run\.head_sha/);

  const name = /\n {4}name: (.+)/.exec(body);
  assert.ok(name, "the ci-failed job has no name");
  assert.notEqual(name[1].trim(), CONTEXT);
});

test("the in-CI job's `if` carries NOTHING but always() and the repository test", () => {
  // Every other condition is decided inside and ends in a posted status. A
  // condition here skips the job, and a skipped job posts nothing.
  const condition = jobIf(ci, "sonar");
  const clauses = condition
    .split("&&")
    .map((c) => c.trim())
    .filter(Boolean);

  assert.equal(
    clauses.length,
    2,
    `expected \`always()\` and the repository test, got: ${condition}`,
  );
  assert.match(clauses[0], /^always\(\)$/);
});

test("the in-CI job posts the required context, and posts it on every path", () => {
  const at = ci.indexOf("\n  sonar:\n");
  const body = ci.slice(at, ci.indexOf("\n  # ====", at + 10));

  assert.match(
    body,
    /-f context=SonarCloud\b(?!\w)/,
    "the job must post the context, under exactly that name",
  );

  const report = body.slice(body.indexOf("- name: Report the verdict"));
  assert.match(
    report,
    /if: always\(\)/,
    "a failed scan, a dead step and `nothing to analyse` all have to report",
  );
});

test("the CI-state arm precedes every arm that reads an output of `check`", () => {
  // Load-bearing, not cosmetic: a job that did not succeed publishes the empty
  // string for its outputs, so `should_run` is empty exactly when `check`
  // failed and the `docs or CI only` arm would claim the run first. Measured
  // before the arm existed: a pull request of nothing but source was told
  // "docs or CI only" (#2441).
  const at = ci.indexOf("\n  sonar:\n");
  const decide = ci.slice(at, ci.indexOf("- name: Checkout", at));

  const failed = decide.indexOf('verdict "Not analysed: CI failed"');
  const cancelled = decide.indexOf('verdict "Not analysed: CI cancelled"');
  const noSource = decide.indexOf('verdict "Not analysed: no source changed"');
  const docsOnly = decide.indexOf('verdict "Not analysed: docs or CI only"');

  for (const [what, at_] of [
    ["CI failed", failed],
    ["CI cancelled", cancelled],
    ["no source changed", noSource],
    ["docs or CI only", docsOnly],
  ]) {
    assert.notEqual(at_, -1, `the ${what} arm is missing`);
  }

  assert.ok(failed < noSource, "the CI-failed arm must precede `no source`");
  assert.ok(
    failed < docsOnly,
    "the CI-failed arm must precede `docs or CI only`",
  );
  assert.ok(
    cancelled < docsOnly,
    "the cancelled arm must precede `docs or CI only`",
  );

  // Both read job RESULTS, which stay readable when a job fails; reading an
  // OUTPUT instead is the defect this arm exists to prevent. Asserted over the
  // `run:` body, on the shell variables — the `env:` block names every output
  // above every arm and would satisfy a looser check vacuously.
  const script = decide.slice(decide.indexOf("set -euo pipefail"));
  const failedInScript = script.indexOf('verdict "Not analysed: CI failed"');

  assert.match(
    script.slice(0, failedInScript),
    /\$CHECK/,
    "the CI-state arm must read `check`'s RESULT",
  );
  assert.doesNotMatch(
    script.slice(0, failedInScript),
    /\$NO_SOURCE|\$SHOULD_RUN|\$MODE/,
    "no arm above the CI-state one may read an output of `check`",
  );
  assert.match(decide, /CHECK: \$\{\{ needs\.check\.result \}\}/);
});

test("the three arms the trusted gate decides are decided here too", () => {
  const at = ci.indexOf("\n  sonar:\n");
  const decide = ci.slice(at, ci.indexOf("- name: Checkout", at));

  // Each arm is matched by the VERDICT it posts, not by the variable it reads:
  // a variable survives in `env:` when the line that uses it is gone.
  for (const [arm, pattern] of [
    ["dependabot", /verdict "Not analysed: dependabot"/],
    ["no source changed", /verdict "Not analysed: no source changed"/],
  ]) {
    assert.match(
      decide,
      pattern,
      `the ${arm} arm is missing from the in-CI job`,
    );
  }

  // The coverage verdict is reached from BOTH shard plans, and losing one of
  // the two leaves the other matching — so it is counted, not matched.
  const coverage = decide.match(
    /verdict "Not analysed: no coverage produced"/g,
  );

  assert.equal(
    coverage?.length,
    2,
    "both the leaf and the sharded arm must reach the coverage verdict",
  );
});

test("the job is not named after the context it posts", () => {
  // A job named `SonarCloud` would add a second entry under that context — a
  // skipped check run on the fork path, beside the status the trusted workflow
  // posts there.
  const at = ci.indexOf("\n  sonar:\n");
  const name = /\n {4}name: (.+)/.exec(ci.slice(at));

  assert.ok(name, "the sonar job has no name");
  assert.notEqual(name[1].trim(), CONTEXT);
});
