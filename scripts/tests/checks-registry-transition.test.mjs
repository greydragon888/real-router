// checks-registry-transition.test.mjs — the check registry (`scripts/checks.mjs`)
// holds, stage by stage, exactly the checks the hooks and Repo Lints ran before
// it, plus the owner's decisions named in EXCEPTIONS below.
//
// Run:  node --test scripts/tests/checks-registry-transition.test.mjs
//
// It compares with a SNAPSHOT, `fixtures/checks-baseline.json`, not with the
// current files. The snapshot was read from `.husky/pre-commit`, `.husky/pre-push`
// and the `repo-lints` job by the extractors of `ci-hook-parity.test.mjs` at the
// commit it names. Each of those places drops its own check lines when it starts
// calling `verify`, so a comparison with the current files would go red there.
//
// ⚠ The extractors see `pnpm lint*|test*` and `node --test` and nothing else.
// The turbo lines of the hooks are held by TURBO_LINES, written out below; a
// registry command neither comparison can see fails the test instead of passing
// unseen.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkId } from "../check-id.mjs";
import { CHECKS } from "../checks.mjs";

const STAGES = ["pre-commit", "pre-push", "ci"];
const CI_SKIPS = ["dependabot-pr", "no-source", "dependabot-actor-with-dedupe-fixer"];

const SNAPSHOT = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "checks-baseline.json"),
    "utf8",
  ),
);

/**
 * The owner's decisions that change the set of a stage (G4 of RFC-1 in
 * `.claude/ci-cd-architecture-2026-09-29/rfc/`), each with its reason.
 */
export const EXCEPTIONS = {
  ci: {
    added: new Map([
      ["lint:reach", "its definition layer reads the whole graph in CI too (D8.5)"],
      ["lint:audit", "osv-scanner runs in CI (D4)"],
      ["lint:security", "semgrep runs in CI (D4)"],
    ]),
    removed: new Map([
      ["lint:prose", "Vale runs in its own job, ci.yml#prose-lint, on every PR (D4)"],
    ]),
  },
};

/** The turbo lines each place ran: the extractors cannot read them. */
export const TURBO_LINES = {
  "pre-commit": ["pnpm turbo run test lint"],
  "pre-push": [
    "pnpm turbo run build lint:package lint:types",
    "pnpm turbo run lint:bench --filter=router-benchmarks",
  ],
  ci: [],
};

const isTurbo = (run) => run[0] === "pnpm" && run[1] === "turbo";
const sorted = (values) => [...new Set(values)].sort();

/** The keys of the checks of a stage that the extractors can read. */
export function stageKeys(checks, stage) {
  return sorted(
    checks
      .filter((check) => check.stages.includes(stage))
      .map((check) => checkId(check.run.join(" ")))
      .filter(Boolean),
  );
}

/** The snapshot of a stage with the exceptions applied. */
export function expectedKeys(snapshot, exceptions, stage) {
  const { added = new Map(), removed = new Map() } = exceptions[stage] ?? {};
  return sorted([
    ...snapshot[stage].filter((key) => !removed.has(key)),
    ...added.keys(),
  ]);
}

/** The turbo commands of the checks of a stage. */
export function turboLines(checks, stage) {
  return checks
    .filter((check) => check.stages.includes(stage) && isTurbo(check.run))
    .map((check) => check.run.join(" "))
    .sort();
}

/** Checks that neither comparison can see. */
export function unseen(checks) {
  return checks
    .filter((check) => !isTurbo(check.run) && checkId(check.run.join(" ")) === undefined)
    .map((check) => check.id);
}

/** Exceptions that no longer change anything: an addition the snapshot already
 * has, or a removal of a key it never had. */
export function staleExceptions(snapshot, exceptions) {
  const stale = [];
  for (const [stage, { added = new Map(), removed = new Map() }] of Object.entries(exceptions)) {
    for (const key of added.keys()) {
      if (snapshot[stage].includes(key)) stale.push(`${stage}: +${key}`);
    }
    for (const key of removed.keys()) {
      if (!snapshot[stage].includes(key)) stale.push(`${stage}: -${key}`);
    }
  }
  return stale.sort();
}

// --------------------------------------------------------------------------
// The real registry against the snapshot.
// --------------------------------------------------------------------------

for (const stage of STAGES) {
  test(`${stage}: the registry runs the snapshot's checks plus the named exceptions`, () => {
    assert.deepEqual(stageKeys(CHECKS, stage), expectedKeys(SNAPSHOT, EXCEPTIONS, stage));
  });

  test(`${stage}: the registry runs the turbo lines the place ran`, () => {
    assert.deepEqual(turboLines(CHECKS, stage), [...TURBO_LINES[stage]].sort());
  });
}

test("every check is seen by one of the two comparisons", () => {
  assert.deepEqual(unseen(CHECKS), []);
});

test("every exception still changes the snapshot", () => {
  assert.deepEqual(staleExceptions(SNAPSHOT, EXCEPTIONS), []);
});

test("the snapshot names its base and lists each stage once, sorted", () => {
  assert.match(SNAPSHOT.base, /^[0-9a-f]{7,40}$/);
  for (const stage of STAGES) {
    assert.deepEqual(SNAPSHOT[stage], sorted(SNAPSHOT[stage]), stage);
    assert.ok(SNAPSHOT[stage].length > 0, `${stage} is empty`);
  }
});

test("the registry is well-formed", () => {
  const ids = CHECKS.map((check) => check.id);
  assert.deepEqual(ids, [...new Set(ids)], "ids are unique");

  for (const check of CHECKS) {
    const where = `check ${check.id}`;
    assert.ok(
      Array.isArray(check.run) && check.run.length > 0 && check.run.every((w) => typeof w === "string" && w),
      `${where}: run is a non-empty list of words`,
    );
    assert.ok(check.stages.length > 0, `${where}: no stage`);
    assert.deepEqual(check.stages, [...new Set(check.stages)], `${where}: a stage twice`);
    for (const stage of check.stages) assert.ok(STAGES.includes(stage), `${where}: stage ${stage}`);
    assert.ok(typeof check.why === "string" && check.why.trim(), `${where}: why`);
    for (const skip of check.ciSkip ?? []) assert.ok(CI_SKIPS.includes(skip), `${where}: ciSkip ${skip}`);
    for (const place of check.ciBy ?? []) assert.match(place, /^[\w.-]+\.ya?ml#[\w-]+$/, `${where}: ciBy`);
    for (const tool of check.tools ?? []) {
      const options = Array.isArray(tool) ? tool : [tool];
      assert.ok(options.length > 0 && options.every((t) => typeof t === "string" && t), `${where}: tools`);
    }
  }
});

// --------------------------------------------------------------------------
// Fixtures: each comparison has to FAIL on the mutation it exists for.
// --------------------------------------------------------------------------

const FIXTURE_CHECKS = [
  { id: "lint:a", run: ["pnpm", "lint:a"], stages: ["pre-commit", "ci"], why: "a" },
  { id: "suite", run: ["node", "--test", "t/*.test.mjs"], stages: ["ci"], why: "b" },
  { id: "turbo:x", run: ["pnpm", "turbo", "run", "x"], stages: ["pre-commit"], why: "c" },
];
const FIXTURE_SNAPSHOT = {
  base: "0000000",
  "pre-commit": ["lint:a"],
  "pre-push": [],
  ci: ["lint:a", "node --test t/*.test.mjs"],
};

test("fixture: a registry that matches its snapshot has no difference", () => {
  for (const stage of STAGES) {
    assert.deepEqual(
      stageKeys(FIXTURE_CHECKS, stage),
      expectedKeys(FIXTURE_SNAPSHOT, {}, stage),
    );
  }
  assert.deepEqual(turboLines(FIXTURE_CHECKS, "pre-commit"), ["pnpm turbo run x"]);
});

test("fixture: a check dropped from the registry is caught", () => {
  const dropped = FIXTURE_CHECKS.filter((check) => check.id !== "suite");
  assert.notDeepEqual(stageKeys(dropped, "ci"), expectedKeys(FIXTURE_SNAPSHOT, {}, "ci"));
});

test("fixture: an edited snapshot is caught", () => {
  const edited = { ...FIXTURE_SNAPSHOT, ci: ["lint:a"] };
  assert.notDeepEqual(stageKeys(FIXTURE_CHECKS, "ci"), expectedKeys(edited, {}, "ci"));
});

test("fixture: an exception makes a changed stage match, and goes stale once absorbed", () => {
  const exceptions = { ci: { added: new Map([["lint:b", "why"]]), removed: new Map([["lint:a", "why"]]) } };
  const moved = [
    { id: "lint:a", run: ["pnpm", "lint:a"], stages: ["pre-commit"], why: "a" },
    { id: "lint:b", run: ["pnpm", "lint:b"], stages: ["ci"], why: "b" },
    FIXTURE_CHECKS[1],
  ];
  assert.deepEqual(stageKeys(moved, "ci"), expectedKeys(FIXTURE_SNAPSHOT, exceptions, "ci"));
  assert.deepEqual(staleExceptions(FIXTURE_SNAPSHOT, exceptions), []);

  const absorbed = { ...FIXTURE_SNAPSHOT, ci: ["lint:b", "node --test t/*.test.mjs"] };
  assert.deepEqual(staleExceptions(absorbed, exceptions), ["ci: +lint:b", "ci: -lint:a"]);
});

test("fixture: a command neither comparison can read is refused", () => {
  const withScript = [
    ...FIXTURE_CHECKS,
    { id: "z", run: ["node", "scripts/z.mjs"], stages: ["pre-push"], why: "z" },
  ];
  assert.deepEqual(unseen(withScript), ["z"]);
});
