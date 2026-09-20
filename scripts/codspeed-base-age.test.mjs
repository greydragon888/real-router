// codspeed-base-age.test.mjs — meta-tests for the base-provenance line (#2375).
//
// Run:  node --test scripts/codspeed-base-age.test.mjs
//       (the `node --test scripts/*.test.mjs` step in ci.yml and in pre-push)
//
// The failure that matters is not a wrong number, it is a reassuring one: a
// report that names a fresh base when the base is old leaves the reader more
// confident than no report at all.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MEASUREMENT_CHECK,
  STALE_AFTER_HOURS,
  WINDOW,
  describeBase,
  render,
} from "./codspeed-base-age.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(
  join(repoRoot, "scripts", "codspeed-base-age.mjs"),
  "utf8",
);

const NOW = new Date("2026-09-20T12:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("the base is the newest measured commit, and the count starts at the tip", () => {
  const commits = ["aaa", "bbb", "ccc", "ddd"];
  const measured = new Map([
    ["ccc", hoursAgo(3)],
    ["ddd", hoursAgo(30)],
  ]);

  const base = describeBase({ commits, measured, now: NOW });

  assert.equal(base.sha, "ccc");
  assert.equal(base.commitsBehind, 2, "the tip itself is 0 behind");
  assert.ok(Math.abs(base.ageHours - 3) < 0.01);
  assert.equal(base.stale, false);
});

test("the tip carrying the measurement is 0 behind", () => {
  const base = describeBase({
    commits: ["aaa", "bbb"],
    measured: new Map([["aaa", hoursAgo(1)]]),
    now: NOW,
  });

  assert.equal(base.commitsBehind, 0);
});

test("staleness is decided by hours, not by the commit count", () => {
  const under = describeBase({
    commits: ["aaa"],
    measured: new Map([["aaa", hoursAgo(STALE_AFTER_HOURS - 0.5)]]),
    now: NOW,
  });
  const over = describeBase({
    commits: ["aaa"],
    measured: new Map([["aaa", hoursAgo(STALE_AFTER_HOURS + 0.5)]]),
    now: NOW,
  });

  assert.equal(under.stale, false);
  assert.equal(over.stale, true);
  // A base one commit back can still be a day old — the gate skips by content,
  // not by time, so the two numbers are independent and both are reported.
  assert.equal(over.commitsBehind, 0);
});

test("no measured commit in the window reports that, and counts as stale", () => {
  const base = describeBase({
    commits: ["aaa", "bbb", "ccc"],
    measured: new Map(),
    now: NOW,
  });

  assert.equal(base.sha, null);
  assert.equal(base.commitsBehind, 3);
  assert.equal(base.stale, true, "an unknown base is not a fresh one");
});

test("`CodSpeed gate` is not the measurement check", () => {
  // This repository's own gate job runs — and reports success — on every push,
  // including the ones where both benchmark jobs are skipped. Matching the name
  // by substring would read every skipped commit as measured.
  assert.equal(MEASUREMENT_CHECK, "CodSpeed Performance Analysis");
  assert.notEqual(MEASUREMENT_CHECK, "CodSpeed gate");
  assert.match(
    source,
    /run\.name === MEASUREMENT_CHECK/,
    "the check must be matched by equality, never by a substring",
  );
  assert.doesNotMatch(
    source,
    /\.name\.includes\(|\.name\.startsWith\(/,
    "a substring match would accept `CodSpeed gate`",
  );
});

test("the report names the sample and both numbers", () => {
  const text = render({
    sha: "abcdef1234",
    commitsBehind: 7,
    ageHours: 31.25,
    stale: true,
  });

  assert.match(text, /abcdef123/, "the sample is named");
  assert.match(text, /\| 7 \|/, "the commit distance is there");
  assert.match(text, /31\.3 h ago/, "the age is there");
  assert.match(text, /⚠/, "a stale base says so");
});

test("a fresh base carries no warning mark", () => {
  const text = render({
    sha: "abcdef1234",
    commitsBehind: 1,
    ageHours: 2,
    stale: false,
  });

  assert.doesNotMatch(text, /⚠/);
  assert.match(text, /abcdef123/);
});

test("the window is bounded, and the bound is the one the report quotes", () => {
  const text = render({
    sha: null,
    commitsBehind: WINDOW,
    ageHours: null,
    stale: true,
  });

  assert.ok(WINDOW > 0);
  assert.match(text, new RegExp(String(WINDOW)));
});

test("an unreadable API dies rather than reporting a fresh base", () => {
  // The rule a8f0b43fb applied to three release-path steps: an error must not
  // read as an absence. Here an absence reads as "no base found", which is a
  // louder answer than a wrong one — but an API failure must not reach it.
  assert.match(source, /`check-runs for \$\{sha\.slice\(0, 9\)\}`/);
  assert.match(
    source,
    /if \(!token\) die\(/,
    "the token guard, not its wording",
  );
  assert.match(source, /if \(!repo\) die\(/);
  assert.match(source, /die\(`\$\{what\} unreachable/);
  assert.match(source, /die\(`\$\{what\}: HTTP/);
  assert.match(source, /::error::/);
});
