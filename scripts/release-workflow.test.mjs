// release-workflow.test.mjs — meta-tests for the publish path itself.
//
// Run:  node --test scripts/release-workflow.test.mjs
//       (picked up by the `node --test scripts/*.test.mjs` step in ci.yml)
//
// Two invariants, both of which fail SILENTLY in production if broken — the
// same shape as the #1127 class that ci-gate-completeness.test.mjs guards:
//
// 1. The release job must run on a GitHub-hosted runner. npm trusted publishing
//    supports GitHub-hosted runners only ("self-hosted runners are not
//    currently supported"), and this repo has four self-hosted jobs
//    (codspeed ×2 — `core` and `adapters` — examples, cross-router-bench) whose
//    `runs-on: self-hosted` is one copy-paste away. Moving the release job
//    there would not fail a PR, would not fail a build — it would fail the
//    OIDC token exchange at publish time, on master, mid-release, with the
//    concurrency group holding every queued release behind it. Nothing else
//    in the repo asserts this.
//
// 2. `id-token: write` must stay in the workflow's permissions. Removing it
//    (e.g. while tightening permissions) breaks OIDC publishing exactly as
//    thoroughly, and just as invisibly.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace. Deliberately NOT a YAML library, matching ci-gate-completeness:
// the extractors are single-purpose and fail-closed, so a restructured
// changesets.yml makes the assertions fail and point here rather than
// silently pass.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { classify } from "../.changeset/unpublished-packages.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const CHANGESETS_YML = join(repoRoot, ".github", "workflows", "changesets.yml");

/** The job that runs `changeset publish`. */
export const RELEASE_JOB = "release";

/**
 * Labels that identify a GitHub-hosted runner. Anything else — most importantly
 * `self-hosted` and any custom label pointing at it — is a violation.
 */
const HOSTED = /^(ubuntu|windows|macos)-[\w.]+$/;

/**
 * Extract a job's `runs-on` value from workflow YAML text.
 *
 * @param {string} yaml
 * @param {string} jobId
 * @returns {string | null} the raw scalar, or null when absent/not found
 */
export function parseRunsOn(yaml, jobId) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`  ${jobId}:`));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z_][\w-]*:/.test(lines[i])) break; // next job
    const m = /^ {4}runs-on:\s*(.+?)\s*(?:#.*)?$/.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

/**
 * Extract the top-level `permissions:` keys granted `write`.
 *
 * @param {string} yaml
 * @returns {string[]}
 */
export function parseWritePermissions(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^permissions:\s*(#.*)?$/.test(l));
  if (start === -1) return [];
  const granted = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[^\s#]/.test(line)) break; // next top-level section
    const m = /^ {2}([a-z-]+):\s*write\b/.exec(line);
    if (m) granted.push(m[1]);
  }
  return granted;
}

// --------------------------------------------------------------------------
// Fixture-level tests: prove the checks FAIL on the mutations they exist for.
// A green run against the real (healthy) changesets.yml means nothing without
// these.
// --------------------------------------------------------------------------

const FIXTURE = `name: Changesets
permissions:
  contents: write
  pull-requests: write
  id-token: write # for OIDC
jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    timeout-minutes: 30
`;

test("fixture: healthy workflow passes both invariants", () => {
  assert.equal(parseRunsOn(FIXTURE, RELEASE_JOB), "ubuntu-latest");
  assert.match(parseRunsOn(FIXTURE, RELEASE_JOB), HOSTED);
  assert.ok(parseWritePermissions(FIXTURE).includes("id-token"));
});

test("fixture: release job moved to a self-hosted runner is caught", () => {
  const mutated = FIXTURE.replace(
    "runs-on: ubuntu-latest",
    "runs-on: self-hosted",
  );
  assert.doesNotMatch(parseRunsOn(mutated, RELEASE_JOB), HOSTED);
});

test("fixture: a custom runner label is caught too (not just the literal 'self-hosted')", () => {
  const mutated = FIXTURE.replace(
    "runs-on: ubuntu-latest",
    "runs-on: bench-vps",
  );
  assert.doesNotMatch(parseRunsOn(mutated, RELEASE_JOB), HOSTED);
});

test("fixture: dropping id-token: write is caught", () => {
  const mutated = FIXTURE.replace("  id-token: write # for OIDC\n", "");
  assert.ok(!parseWritePermissions(mutated).includes("id-token"));
});

test("fixture: a renamed release job is caught (parser fails closed)", () => {
  const mutated = FIXTURE.replace("  release:", "  publish:");
  assert.equal(parseRunsOn(mutated, RELEASE_JOB), null);
});

// --------------------------------------------------------------------------
// The real checks against .github/workflows/changesets.yml.
// --------------------------------------------------------------------------

const real = readFileSync(CHANGESETS_YML, "utf8");

test("changesets.yml: the release job runs on a GitHub-hosted runner", () => {
  const runsOn = parseRunsOn(real, RELEASE_JOB);
  assert.notEqual(
    runsOn,
    null,
    `job '${RELEASE_JOB}' or its runs-on not found in changesets.yml — if the ` +
      "publish job was renamed, update RELEASE_JOB in this test",
  );
  assert.match(
    runsOn,
    HOSTED,
    `the release job runs on '${runsOn}'. npm trusted publishing supports ` +
      "GitHub-hosted runners ONLY — a self-hosted runner cannot complete the " +
      "OIDC exchange, so publishing would fail at release time with no earlier " +
      "signal. Keep this job on ubuntu-latest.",
  );
});

test("changesets.yml: id-token: write is still granted (OIDC publishing)", () => {
  assert.ok(
    parseWritePermissions(real).includes("id-token"),
    "id-token: write is missing from changesets.yml permissions — OIDC " +
      "trusted publishing cannot mint a token without it, and every publish " +
      "would fall back to (nonexistent) token auth.",
  );
});

// --------------------------------------------------------------------------
// Release preflight classifier — the pure half of
// .changeset/unpublished-packages.mjs. The distinction it draws is the whole
// point: "never published" needs a human, browser-bound first publish, while
// "behind" is what the workflow publishes automatically.
// --------------------------------------------------------------------------

test("classify: local version equal to the registry's is 'published'", () => {
  assert.equal(classify("1.2.3", "1.2.3"), "published");
});

test("classify: local version different from the registry's is 'behind'", () => {
  assert.equal(classify("1.3.0", "1.2.3"), "behind");
  // Also when local is OLDER — still a mismatch the release path must surface.
  assert.equal(classify("1.2.3", "1.3.0"), "behind");
});

test("classify: absent from the registry is 'never-published', not 'behind'", () => {
  // The regression this exists for: the old bash mapped a 404 to "0.0.0",
  // which compared unequal and looked exactly like 'behind'.
  assert.equal(classify("0.0.1", null), "never-published");
  assert.notEqual(classify("0.0.1", null), classify("0.0.1", "0.0.0"));
});

// --------------------------------------------------------------------------
// The spec half: `--published-version <name@version>` is what the tag backfill
// in changesets.yml asks. "The registry does not have it" (skip the tag) and
// "the registry did not answer" (fail the run) must not look alike — the line
// it replaced, `pnpm view … >/dev/null 2>&1 || continue`, made them identical.
// `pnpm` is stubbed on PATH: no network, and the error TEXTS are the contract.
// --------------------------------------------------------------------------

const CLI = join(repoRoot, ".changeset", "unpublished-packages.mjs");
const stubDirs = [];

after(() => {
  for (const dir of stubDirs) rmSync(dir, { recursive: true, force: true });
});

/** A `pnpm` first on PATH that records its argv, then answers as told. */
function stubPnpm({ stdout = "", stderr = "", code = 0 }) {
  const dir = mkdtempSync(join(tmpdir(), "pnpm-stub-"));

  stubDirs.push(dir);
  const bin = join(dir, "pnpm");

  writeFileSync(
    bin,
    [
      "#!/bin/sh",
      `echo "$@" >> "${join(dir, "calls.txt")}"`,
      stdout ? `echo '${stdout}'` : ":",
      stderr ? `echo '${stderr}' >&2` : ":",
      `exit ${code}`,
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);

  return dir;
}

function publishedVersion(dir, spec) {
  const result = spawnSync(
    process.execPath,
    [CLI, "--published-version", spec],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    },
  );
  const log = join(dir, "calls.txt");

  return {
    ...result,
    calls: existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n").length
      : 0,
  };
}

test("--published-version: a version the registry has is printed", () => {
  const run = publishedVersion(
    stubPnpm({ stdout: "1.2.3" }),
    "@real-router/core@1.2.3",
  );

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), "1.2.3");
});

test("--published-version: a missing package is an answer, not a failure", () => {
  const dir = stubPnpm({
    stderr: "ERR_PNPM_FETCH_404 Not Found - 404",
    code: 1,
  });
  const run = publishedVersion(dir, "@real-router/nope@1.0.0");

  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout.trim(),
    "",
    "empty stdout is how the caller reads 'no'",
  );
  assert.equal(run.calls, 1, "an answer is not retried");
});

test("--published-version: a missing VERSION is an answer too — the backfill's normal case", () => {
  const dir = stubPnpm({
    stderr:
      "ERR_PNPM_PACKAGE_NOT_FOUND No matching version found for @real-router/core@99.0.0",
    code: 1,
  });
  const run = publishedVersion(dir, "@real-router/core@99.0.0");

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), "");
});

test("--published-version: a registry failure retries once, then fails loudly", () => {
  const dir = stubPnpm({
    stderr: "ERR_PNPM_FETCH_503 Service Unavailable",
    code: 1,
  });
  const run = publishedVersion(dir, "@real-router/core@1.2.3");

  assert.notEqual(run.status, 0);
  assert.equal(
    run.stdout.trim(),
    "",
    "nothing on stdout: the caller reads it as a version",
  );
  assert.match(run.stderr, /::error/);
  assert.equal(run.calls, 2, "one retry, then the failure stands");
});
