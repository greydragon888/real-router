// coverage-threshold-authority.test.mjs — core's 100 % thresholds are checked
// exactly once, on the merged report, by a job the gate hard-requires (#2429).
//
// Run:  node --test scripts/coverage-threshold-authority.test.mjs
//       (the `node --test scripts/*.test.mjs` step in ci.yml and in pre-push)
//
// `base-test` runs `vitest --shard=i/4`, and a shard sees only its quarter:
// measured, shard 1 of 4 reports 85.64 % (3519/4109) because the other three
// shards' files are present at 0 % through `coverage.include`. Vitest checks
// thresholds on every coverage-enabled run, so they are off per shard and on
// once, in `base-coverage`.
//
// Everything below is a way for that arrangement to fail SILENTLY — thresholds
// off in both places, or on in a job whose skip the gate reads as a pass — which
// is the #1127 class the sibling guards exist for.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ci = readFileSync(
  join(repoRoot, ".github", "workflows", "ci.yml"),
  "utf8",
);

/** The `run:` body of the named step, as written. */
function step(name) {
  const at = ci.indexOf(`- name: ${name}`);
  assert.notEqual(at, -1, `no step named ${name}`);
  const rest = ci.slice(at);
  const end = rest.indexOf("\n      - name: ");
  return end === -1 ? rest : rest.slice(0, end);
}

const METRICS = ["statements", "branches", "functions", "lines"];

test("the shards turn every threshold off", () => {
  const body = step("Test core layer");

  for (const metric of METRICS) {
    assert.match(
      body,
      new RegExp(`--coverage\\.thresholds\\.${metric}=0`),
      `shard run must zero ${metric}, or it fails on its own quarter`,
    );
  }
  assert.match(body, /--shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(body, /--reporter=blob/);
});

test("the shard count matches the denominator it is split by", () => {
  const matrix = /shard: \[([^\]]+)\]/.exec(ci);
  assert.ok(matrix, "no shard matrix");

  const count = matrix[1].split(",").length;
  const denominators = [...ci.matchAll(/--shard=.*?\/(\d+)/g)].map((m) =>
    Number(m[1]),
  );

  assert.ok(denominators.length > 0, "nothing is sharded");
  for (const n of denominators) {
    assert.equal(
      n,
      count,
      `matrix has ${String(count)} shards, split is /${String(n)}`,
    );
  }
});

test("the merge checks thresholds — it neither zeroes them nor drops coverage", () => {
  const body = step("Merge coverage and check thresholds");

  assert.match(body, /--merge-reports/);
  assert.match(body, /--coverage\b/, "without --coverage nothing is checked");
  assert.doesNotMatch(
    body,
    /--coverage\.thresholds\.\w+=0/,
    "the merged run is the only place the 100 % gate is applied",
  );
  assert.doesNotMatch(
    body,
    /--coverage\.enabled=false/,
    "the merged run is the only place the 100 % gate is applied",
  );
});

test("the gate requires base-coverage HARD, not through ok()", () => {
  // The gate is the one whose needs list carries `repo-lints` — the other
  // `[check, pipeline-leaf, …]` lists belong to jobs, not to `CI Result`.
  const needs = [
    ...ci.matchAll(/^ {4}needs: \[check, pipeline-leaf,[^\]]*\]$/gm),
  ]
    .map((m) => m[0])
    .filter((line) => line.includes("repo-lints"));
  assert.equal(needs.length, 1, "the gate's needs list moved");
  assert.match(
    needs[0],
    /base-coverage/,
    "base-coverage is not in the gate's needs",
  );

  // `ok()` counts a skip as a pass. The 100 % gate may not be read that way.
  assert.match(
    ci,
    /\[\[ "\$BASE_COV" == "success" \]\]/,
    "base-coverage must be required by equality, not ok()",
  );
  assert.doesNotMatch(ci, /ok "\$BASE_COV"/);
});

test("the blob artifact the merge reads is the one the shards write", () => {
  const written = /name: (coverage-blob-[^\n]*)/.exec(ci);
  const read = /pattern: (coverage-blob-[^\n]*)/.exec(ci);

  assert.ok(written && read, "blob artifact names are gone");
  assert.ok(
    read[1].replace("*", "") === "coverage-blob-",
    `the merge reads ${read[1]}`,
  );
  assert.ok(
    written[1].startsWith("coverage-blob-"),
    `the shards write ${written[1]}`,
  );
});

test("base-coverage counts the blobs before merging them", () => {
  const body = step("Verify all four blobs arrived");

  assert.match(
    body,
    /-ne 4/,
    "a missing blob must fail, not merge three quarters",
  );
  assert.match(body, /::error::/);
});
