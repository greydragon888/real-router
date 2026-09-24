// ci-hook-parity.test.mjs — meta-test: every check a workflow runs is also run
// by a git hook, or is allowlisted with a reason.
//
// Run:  node --test scripts/tests/ci-hook-parity.test.mjs
//
// Why this exists (#2406): a check wired into `ci.yml` and into neither hook is
// first heard of as a red **Repo Lints** job, after the push. Four of the eleven
// check steps shipped that way — `lint:deps` and the `scripts/tests/*.test.mjs` suite
// waited 76 days for a hook, `lint:doc-dup` 8, `lint:membership` 14 — and 8 of
// the 11 non-Dependabot Repo Lints failures since 2026-09-04 came from a step
// that had no hook at the time. Nothing structural refused the next one.
//
// The guard MUST live in a suite a hook runs, or it is the defect it names:
// `.husky/pre-push` runs `node --test scripts/tests/*.test.mjs`, and 5 of the 6
// commits that added or moved these steps reached master by direct push, where
// no `ci.yml` runs at all.
//
// A second axis (#2548): every check `.husky/pre-commit` runs also runs in
// `.husky/pre-push`, or is allowlisted with a reason. git runs no pre-commit for
// a tree `git rebase` or `git merge` produced, nor for a `--no-verify` commit, so
// on a direct push a check pre-commit alone runs is not run at all. The first
// axis cannot see that: it treats the two hooks as one set.
//
// Stdlib node:test/node:assert only, and deliberately NOT a YAML library — the
// extractors below are single-purpose and fail on a shape they cannot read,
// which is the same posture `ci-gate-completeness.test.mjs` takes toward its own
// two.
//
// ⚠ Parity is not effectiveness. A hook step with a skip arm satisfies this
// guard and gates nothing locally: `lint:prose` skips when Vale is absent, and a
// PR reddened on prose on 2026-09-09 with that hook line in place.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WORKFLOWS = join(repoRoot, ".github", "workflows");
const HOOKS = ["pre-commit", "pre-push"];

/**
 * The job whose steps are checks by definition, held to the stricter rule: every
 * step of it is a check, or is named below. Elsewhere a check is recognised by
 * its command, so a check written in some other shape is invisible — here it is
 * refused instead.
 */
export const CHECKS_JOB = "repo-lints";

/** Steps of {@link CHECKS_JOB} that run no check. */
export const NOT_A_CHECK = new Map([
  ["Checkout", "actions/checkout"],
  ["Setup (pnpm + Node + install)", "the composite setup action"],
  ["Install Vale", "downloads the binary the prose step needs"],
]);

/**
 * Checks that run in a workflow and in no hook, each with the reason. An entry
 * that becomes paired, or names a check no workflow runs any more, fails the
 * hygiene test below.
 */
export const CI_ONLY = new Map([
  [
    "lint:bench-apps",
    "preflight of the scheduled cross-router bench suite, which no hook runs — the " +
      "harness needs the built apps and a quiet machine (benchmarks/CLAUDE.md)",
  ],
]);

/**
 * The identifier of a check, or `undefined` for a command that runs none.
 *
 * A check is an npm script whose name starts with `lint` or `test`, or the
 * `node --test` suite. Flags, filters and a surrounding subshell are stripped,
 * so the hook and the workflow pair by WHAT they run rather than by how the line
 * happens to be written today.
 *
 * `pnpm turbo run <task>` is deliberately not a check here: task-level coverage
 * is `check-lint-reach.mjs`'s axis, and it answers a different question — which
 * workspaces a hook's lint steps read.
 *
 * @param {string} command a single shell command
 * @returns {string | undefined}
 */
export function checkId(command) {
  const text = command
    .trim()
    .replace(/^\(\s*unset \$\([^)]*\);\s*/, "")
    .replace(/\)$/, "")
    .trim();

  const suite = /^node --test\b(.*)$/.exec(text);
  if (suite) {
    const target = suite[1]
      .split(/\s+/)
      .filter((word) => word && !word.startsWith("-"))
      .join(" ");
    return target ? `node --test ${target}` : undefined;
  }

  const script = /^pnpm ((?:lint|test)[\w:-]*)(?:\s|$)/.exec(text);
  return script ? script[1] : undefined;
}

/**
 * Every `- name:` step of one job, with the first command of its `run:`.
 * Returns [] when the job is absent.
 *
 * @param {string} yaml workflow text
 * @param {string} jobId
 * @returns {{ name: string, command: string | undefined }[]}
 */
export function parseSteps(yaml, jobId) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`  ${jobId}:`));
  if (start === -1) return [];

  const steps = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z_][\w-]*:/.test(lines[i])) break; // next job
    const name = /^ {6}- name: (.+)$/.exec(lines[i]);
    if (!name) continue;

    let command;
    for (let j = i + 1; j < lines.length; j++) {
      if (
        /^ {6}- name: /.test(lines[j]) ||
        /^ {2}[A-Za-z_][\w-]*:/.test(lines[j])
      ) {
        break;
      }
      const run = /^ {8}run: (.*)$/.exec(lines[j]);
      if (!run) continue;
      const inline = run[1].trim();
      command = ["|", ">-", ">", "|-"].includes(inline)
        ? (lines[j + 1] ?? "").trim()
        : inline;
      break;
    }
    steps.push({ name: name[1].trim(), command });
  }
  return steps;
}

/**
 * Check ids a workflow runs, in any job.
 *
 * Every non-comment line is offered to {@link checkId}, with a leading `- ` and
 * `run:` stripped: a command written as a block scalar sits on its own line, and
 * keying on `run:` alone missed it — the fixture below is that miss. A line that
 * merely mentions a script (an `echo`, a comment) does not start with `pnpm` or
 * `node --test` and yields nothing.
 *
 * @param {string} yaml workflow text
 * @returns {string[]}
 */
export function workflowChecks(yaml) {
  const ids = [];
  for (const raw of yaml.split("\n")) {
    const line = raw
      .trim()
      .replace(/^- /, "")
      .replace(/^run:\s*/, "");
    if (!line || line.startsWith("#")) continue;
    const id = checkId(line);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * Check ids a hook runs.
 *
 * ⚠ A line this cannot read yields no id, which surfaces as an UNPAIRED check
 * rather than as silence: the guard reds, and the hook line is the first place
 * the reader is sent.
 *
 * @param {string} hookText
 * @returns {string[]}
 */
export function hookChecks(hookText) {
  const ids = [];
  for (const raw of hookText.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const id = checkId(line);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * The whole check, pure. `workflows` maps a file name to its text, `hooks` a
 * hook name to its text.
 *
 * @returns {{ unpaired: string[], unclassified: string[], staleAllowed: string[], paired: Map<string, string[]> }}
 */
export function findViolations(
  workflows,
  hooks,
  { ciOnly = CI_ONLY, notACheck = NOT_A_CHECK, checksJob = CHECKS_JOB } = {},
) {
  const inHooks = new Map();
  for (const [hook, text] of Object.entries(hooks)) {
    for (const id of hookChecks(text)) {
      inHooks.set(id, [...(inHooks.get(id) ?? []), hook]);
    }
  }

  const inWorkflows = new Set();
  for (const text of Object.values(workflows)) {
    for (const id of workflowChecks(text)) inWorkflows.add(id);
  }

  const unpaired = [...inWorkflows]
    .filter((id) => !inHooks.has(id) && !ciOnly.has(id))
    .sort();

  // The stricter half: in the job that exists to run checks, a step is a check
  // or it is named. A check in a shape `checkId` cannot read is invisible to the
  // pairing above; here it is refused.
  const unclassified = [];
  for (const text of Object.values(workflows)) {
    for (const { name, command } of parseSteps(text, checksJob)) {
      if (notACheck.has(name)) continue;
      if (command === undefined || checkId(command) === undefined) {
        unclassified.push(name);
      }
    }
  }

  const staleAllowed = [...ciOnly.keys()]
    .filter((id) => inHooks.has(id) || !inWorkflows.has(id))
    .sort();

  const paired = new Map(
    [...inWorkflows]
      .filter((id) => inHooks.has(id))
      .map((id) => [id, inHooks.get(id)]),
  );

  return { unpaired, unclassified, staleAllowed, paired };
}

/**
 * Checks `.husky/pre-commit` runs that `.husky/pre-push` does not, each with the
 * reason. An entry that gets its twin, or names a check pre-commit no longer
 * runs, fails the hygiene test below.
 */
export const PRE_COMMIT_ONLY = new Map();

/**
 * The second axis, pure: the checks pre-commit runs that have no pre-push twin.
 * `hooks` maps a hook name to its text, as {@link findViolations} takes it.
 *
 * ⚠ It pairs by {@link checkId}, so it sees what the first axis sees and no
 * more. `pnpm turbo run …` and a writer such as `pnpm dedupe` are not checks,
 * and a check written as a bare `node scripts/…` is invisible.
 *
 * @param {Record<string, string>} hooks
 * @returns {{ missing: string[], staleAllowed: string[], twinned: string[] }}
 */
export function findPrePushGaps(
  hooks,
  { preCommitOnly = PRE_COMMIT_ONLY } = {},
) {
  const commit = hookChecks(hooks["pre-commit"]);
  const push = new Set(hookChecks(hooks["pre-push"]));

  const missing = commit
    .filter((id) => !push.has(id) && !preCommitOnly.has(id))
    .sort();
  const staleAllowed = [...preCommitOnly.keys()]
    .filter((id) => push.has(id) || !commit.includes(id))
    .sort();
  const twinned = commit.filter((id) => push.has(id)).sort();

  return { missing, staleAllowed, twinned };
}

// --------------------------------------------------------------------------
// Fixtures: the check has to FAIL on the mutations it exists for. A green run
// against the real repository proves nothing on its own.
// --------------------------------------------------------------------------

const WORKFLOW = `name: X
jobs:
  repo-lints:
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: Check dependency consistency
        run: pnpm lint:deps
      - name: Test CI meta
        run: node --test scripts/tests/*.test.mjs
`;

const HOOK = `#!/bin/sh
# pnpm lint:commented — a comment is not a step
pnpm lint:deps
(unset $(git rev-parse --local-env-vars); node --test --test-reporter=dot scripts/tests/*.test.mjs)
`;

const opts = { ciOnly: new Map(), notACheck: NOT_A_CHECK };

test("fixture: a workflow whose checks all run in a hook has no violations", () => {
  const found = findViolations(
    { "ci.yml": WORKFLOW },
    { "pre-push": HOOK },
    opts,
  );

  assert.deepEqual(found.unpaired, []);
  assert.deepEqual(found.unclassified, []);
  assert.deepEqual([...found.paired.keys()].sort(), [
    "lint:deps",
    "node --test scripts/tests/*.test.mjs",
  ]);
});

test("fixture: the #2406 mutation — a check in CI and in no hook — is caught", () => {
  const withNewStep = WORKFLOW.replace(
    "      - name: Test CI meta",
    "      - name: Check membership predicates\n        run: pnpm lint:membership\n      - name: Test CI meta",
  );
  const found = findViolations(
    { "ci.yml": withNewStep },
    { "pre-push": HOOK },
    opts,
  );

  assert.deepEqual(found.unpaired, ["lint:membership"]);
});

test("fixture: the drift direction that happened — a hook line removed — is caught", () => {
  const found = findViolations(
    { "ci.yml": WORKFLOW },
    { "pre-push": HOOK.replace("pnpm lint:deps\n", "") },
    opts,
  );

  assert.deepEqual(found.unpaired, ["lint:deps"]);
});

test("fixture: an allowlisted CI-only check is not a violation, and going stale is", () => {
  const ciOnly = new Map([["lint:deps", "a reason"]]);

  assert.deepEqual(
    findViolations(
      { "ci.yml": WORKFLOW },
      { "pre-push": HOOK },
      { ...opts, ciOnly },
    ).staleAllowed,
    ["lint:deps"],
    "the allowlist names a check the hook runs — the entry is stale",
  );

  const hookless = HOOK.replace("pnpm lint:deps\n", "");
  const found = findViolations(
    { "ci.yml": WORKFLOW },
    { "pre-push": hookless },
    { ...opts, ciOnly },
  );
  assert.deepEqual(found.unpaired, []);
  assert.deepEqual(found.staleAllowed, []);
});

test("fixture: an allowlist entry for a check no workflow runs any more is stale", () => {
  const ciOnly = new Map([["lint:retired", "a reason"]]);
  const found = findViolations(
    { "ci.yml": WORKFLOW },
    { "pre-push": HOOK },
    { ...opts, ciOnly },
  );

  assert.deepEqual(found.staleAllowed, ["lint:retired"]);
});

test("fixture: a step of the checks job that runs no recognised check is refused", () => {
  const withOddStep = WORKFLOW.replace(
    "      - name: Test CI meta",
    "      - name: Check something\n        run: bash scripts/check-something.sh\n      - name: Test CI meta",
  );
  const found = findViolations(
    { "ci.yml": withOddStep },
    { "pre-push": HOOK },
    opts,
  );

  assert.deepEqual(found.unclassified, ["Check something"]);
});

test("fixture: a check in another workflow is covered too", () => {
  const other = `name: Y
jobs:
  bench:
    steps:
      - name: Contract preflight
        run: pnpm lint:bench-apps
`;
  const found = findViolations(
    { "ci.yml": WORKFLOW, "bench.yml": other },
    { "pre-push": HOOK },
    opts,
  );

  assert.deepEqual(found.unpaired, ["lint:bench-apps"]);
});

test("fixture: pairing survives the shapes a hook line is written in", () => {
  // Same two checks, rewritten: a subshell, a reporter flag, a block scalar in
  // the workflow, extra arguments. A reformatted line must not read as drift.
  const workflow = WORKFLOW.replace(
    "        run: node --test scripts/tests/*.test.mjs",
    "        run: |\n          node --test scripts/tests/*.test.mjs",
  );
  const hook = `#!/bin/sh
pnpm lint:deps --silent
( unset $(git rev-parse --local-env-vars); node --test --test-reporter=dot --test-concurrency=2 scripts/tests/*.test.mjs )
`;
  const found = findViolations(
    { "ci.yml": workflow },
    { "pre-commit": hook },
    opts,
  );

  assert.deepEqual(found.unpaired, []);
  assert.deepEqual([...found.paired.keys()].sort(), [
    "lint:deps",
    "node --test scripts/tests/*.test.mjs",
  ]);
});

test("fixture: a commented-out hook line does not count as coverage", () => {
  const hook =
    "#!/bin/sh\n# pnpm lint:deps\nnode --test scripts/tests/*.test.mjs\n";
  const found = findViolations(
    { "ci.yml": WORKFLOW },
    { "pre-push": hook },
    opts,
  );

  assert.deepEqual(found.unpaired, ["lint:deps"]);
});

// The second axis. PRE_COMMIT carries a conditional check, a writer and a turbo
// run, the three shapes a real pre-commit holds beside its plain checks.
const PRE_COMMIT = `#!/bin/sh
pnpm lint:deps
pnpm lint:repo-scans
if git diff --cached --name-only | grep -q shared/; then
  pnpm lint:conditional
fi
pnpm dedupe
pnpm turbo run test lint --filter='!./examples/**'
`;

const PRE_PUSH = `#!/bin/sh
pnpm lint:deps
pnpm lint:repo-scans
pnpm lint:conditional
`;

const noAllowlist = { preCommitOnly: new Map() };

test("fixture: every pre-commit check with a pre-push twin — no gap, and the writer and the turbo run need none", () => {
  const found = findPrePushGaps(
    { "pre-commit": PRE_COMMIT, "pre-push": PRE_PUSH },
    noAllowlist,
  );

  assert.deepEqual(found.missing, []);
  assert.deepEqual(found.twinned, [
    "lint:conditional",
    "lint:deps",
    "lint:repo-scans",
  ]);
});

test("fixture: the #2548 shape — a check pre-commit alone runs — is caught", () => {
  const found = findPrePushGaps(
    {
      "pre-commit": PRE_COMMIT,
      "pre-push": PRE_PUSH.replace("pnpm lint:repo-scans\n", ""),
    },
    noAllowlist,
  );

  assert.deepEqual(found.missing, ["lint:repo-scans"]);
});

test("fixture: a check inside a pre-commit conditional needs its twin too", () => {
  const found = findPrePushGaps(
    {
      "pre-commit": PRE_COMMIT,
      "pre-push": PRE_PUSH.replace("pnpm lint:conditional\n", ""),
    },
    noAllowlist,
  );

  assert.deepEqual(found.missing, ["lint:conditional"]);
});

test("fixture: an allowlisted pre-commit-only check is not a gap, and going stale is", () => {
  const preCommitOnly = new Map([["lint:repo-scans", "a reason"]]);
  const twinless = PRE_PUSH.replace("pnpm lint:repo-scans\n", "");

  const allowed = findPrePushGaps(
    { "pre-commit": PRE_COMMIT, "pre-push": twinless },
    { preCommitOnly },
  );
  assert.deepEqual(allowed.missing, []);
  assert.deepEqual(allowed.staleAllowed, []);

  assert.deepEqual(
    findPrePushGaps(
      { "pre-commit": PRE_COMMIT, "pre-push": PRE_PUSH },
      { preCommitOnly },
    ).staleAllowed,
    ["lint:repo-scans"],
    "the allowlist names a check pre-push runs — the entry is stale",
  );
  assert.deepEqual(
    findPrePushGaps(
      { "pre-commit": PRE_COMMIT, "pre-push": PRE_PUSH },
      { preCommitOnly: new Map([["lint:retired", "a reason"]]) },
    ).staleAllowed,
    ["lint:retired"],
    "the allowlist names a check pre-commit no longer runs — the entry is stale",
  );
});

// --------------------------------------------------------------------------
// The real repository.
// --------------------------------------------------------------------------

const workflows = Object.fromEntries(
  readdirSync(WORKFLOWS)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => [file, readFileSync(join(WORKFLOWS, file), "utf8")]),
);
const hooks = Object.fromEntries(
  HOOKS.map((hook) => [
    hook,
    readFileSync(join(repoRoot, ".husky", hook), "utf8"),
  ]),
);
const real = findViolations(workflows, hooks);

test("every check a workflow runs is run by a hook, or allowlisted (#2406)", () => {
  assert.deepEqual(
    real.unpaired,
    [],
    "add the check to .husky/pre-commit or .husky/pre-push, or to CI_ONLY with the reason it cannot run locally",
  );
});

test(`every step of the ${CHECKS_JOB} job runs a check this guard can read`, () => {
  assert.deepEqual(
    real.unclassified,
    [],
    "a step of the checks job that runs no recognised check: give it a `pnpm lint:*` / `node --test` command, or name it in NOT_A_CHECK",
  );
});

test("the CI_ONLY allowlist is current", () => {
  assert.deepEqual(
    real.staleAllowed,
    [],
    "an entry that is now paired, or names a check no workflow runs — drop it",
  );
});

test("the guard is reading both sides: the pairing is not vacuously empty", () => {
  // Without this, an extractor that returns nothing would pass every assertion
  // above while measuring nothing — the failure mode #2406 is about.
  assert.ok(
    real.paired.size >= 5,
    `only ${String(real.paired.size)} paired checks found — the extractors are reading less than the repository has`,
  );
  assert.ok(
    real.paired.get("lint:membership")?.length === 2,
    "lint:membership is expected in both hooks (#2392)",
  );
});

const gaps = findPrePushGaps(hooks);

test("every check pre-commit runs also runs in pre-push, or is allowlisted (#2548)", () => {
  assert.deepEqual(
    gaps.missing,
    [],
    "add the check to .husky/pre-push, or to PRE_COMMIT_ONLY with the reason it cannot run there",
  );
});

test("the PRE_COMMIT_ONLY allowlist is current", () => {
  assert.deepEqual(
    gaps.staleAllowed,
    [],
    "an entry that now has its twin, or names a check pre-commit no longer runs — drop it",
  );
});

test("the second axis is reading both hooks: its pairing is not vacuously empty", () => {
  // An extractor that returned nothing for either hook would pass the two
  // assertions above while measuring nothing.
  for (const id of ["lint:membership", "lint:repo-scans"]) {
    assert.ok(
      gaps.twinned.includes(id),
      `${id} is expected in both hooks (#2392, #2548)`,
    );
  }
});
