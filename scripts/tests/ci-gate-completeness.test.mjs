// ci-gate-completeness.test.mjs — meta-test: every ci.yml job is wired into
// the single required check ("CI Result"), or explicitly allowlisted.
//
// Run:  node --test scripts/tests/ci-gate-completeness.test.mjs
//
// Why this exists (debt-map axis A6, the #1127 class): the repo's gate model
// is "one required status check for the pipeline" — the `ci` job aggregates
// every other job via `needs`, and the branch ruleset requires that context
// beside the ones that gate on their own (`gh api
// repos/greydragon888/real-router/rules/branches/master` lists them). The model's
// failure mode is silent: a job NOT listed in the gate's `needs` can go red
// while the PR stays mergeable (#1127: `coverage` ran the R2.4 shard-integrity
// guard, failed loudly, and gated nothing). Nothing structural prevented the
// recurrence — a job added tomorrow is outside the gate by default. This test
// makes that class fail loudly: a new job must either join the gate's `needs`
// or be added to OUTSIDE_GATE with a written reason.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace; the `node:scripts-tests` check, which pre-push and Repo Lints run,
// picks this file up by glob, so the preventer needs no wiring of its own.
//
// Deliberately NOT a YAML library: the extractors of `scripts/ci-gate.mjs` read
// the forms they name and refuse the rest, and the floors below catch one that
// reads nothing — if ci.yml is restructured so they can't parse it, the
// assertions fail and point here, they don't silently pass.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GATE_JOB,
  jobLines,
  gateReads,
  parseGateScript,
  parseGateStep,
  parseJobs,
  parseNeeds,
} from "../ci-gate.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CI_YML = join(repoRoot, ".github", "workflows", "ci.yml");

/**
 * Jobs deliberately OUTSIDE the gate. Every entry carries its reason; the
 * test fails when an entry disappears from ci.yml (stale allowlist) or shows
 * up in the gate's `needs` (allowlist entry no longer true — remove it).
 */
export const OUTSIDE_GATE = new Map([
  [
    "bundle-size",
    "informational size-limit PR comment — 'not a gate' by design " +
      "(infra-review W4 §3.4); its latency/failure must not move the merge point",
  ],
  [
    "sonar",
    "gates through its OWN required context: the job posts the `SonarCloud` " +
      "status that the `protect-master` ruleset requires beside `CI Result`, " +
      "so a red analysis blocks the merge directly rather than through the " +
      "aggregator — and routing it through `CI Result` would put the ~60 s " +
      "analysis back on the gate's critical path, which is what #2442 removed",
  ],
]);

/**
 * Pure core of the check — also exercised on fixtures below so the test's
 * discriminating power does not depend on the current (healthy) ci.yml.
 */
export function findViolations(yaml, outsideGate = OUTSIDE_GATE) {
  const jobs = parseJobs(yaml);
  const needs = new Set(parseNeeds(yaml, GATE_JOB));
  const gateScript = parseGateScript(yaml);
  return {
    jobs,
    needs,
    gateMissing: !jobs.includes(GATE_JOB) || needs.size === 0,
    // The OTHER half of the #1127 class. The aggregate at the top of the
    // "Determine result" script reads every job in `needs` for a failure or a
    // cancellation; whose skip is forbidden the script decides by reading jobs
    // one by one, and a job in `needs` that no line reads can never have its
    // skip forbidden — membership alone cannot see that. Every one is read
    // today (the real-file test asserts it), so this is a preventer gap, not a
    // live bug; #1127 is what a preventer gap looks like once it stops being one.
    neededButUnread: [...needs].filter((n) => !gateReads(gateScript, n)),
    // The #1127 class: a job whose red X would not block merge.
    ungated: jobs.filter(
      (j) => j !== GATE_JOB && !needs.has(j) && !outsideGate.has(j),
    ),
    // needs entries pointing at nothing (job renamed/removed under the gate).
    unknownNeeds: [...needs].filter((n) => !jobs.includes(n)),
    // A job in `needs` that needs a job outside them is SKIPPED when that one
    // fails, and the gate reads the skip, which its table may allow. Every
    // edge into a job the gate waits for starts inside the gate's `needs`.
    // A job-level `continue-on-error` may let a failed job report as passed:
    // what GitHub puts in `needs.<job>.result` then, its docs do not say.
    continueOnError: [...needs].filter((n) =>
      (jobLines(yaml, n) ?? []).some((l) => /^ {4}continue-on-error:/.test(l)),
    ),
    needsOutsideGate: [...needs].flatMap((n) =>
      parseNeeds(yaml, n)
        .filter((d) => !needs.has(d))
        .map((d) => `${n} → ${d}`),
    ),
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
    steps:
      - name: Determine result
        run: |
          if [[ "\${{ needs.check.result }}" != "success" ]]; then exit 1; fi
          COVERAGE="\${{ needs.coverage.result }}"
`;

test("fixture: fully wired workflow has no violations", () => {
  const v = findViolations(FIXTURE, new Map([["bundle-size", "info-only"]]));
  assert.equal(v.gateMissing, false);
  assert.deepEqual(v.ungated, []);
  assert.deepEqual(v.unknownNeeds, []);
  assert.deepEqual(v.staleAllowlist, []);
  assert.deepEqual(v.allowlistedButWired, []);
  assert.deepEqual(v.needsOutsideGate, []);
  assert.deepEqual(v.continueOnError, []);
});

test("fixture: a gated job with a job-level continue-on-error is caught", () => {
  const mutated = FIXTURE.replace(
    "  coverage:\n    needs: [check]\n",
    "  coverage:\n    needs: [check]\n    continue-on-error: true\n",
  );
  const v = findViolations(mutated, new Map([["bundle-size", "info-only"]]));
  assert.deepEqual(v.continueOnError, ["coverage"]);
});

// The edge coverage → bundle-size in every form GitHub accepts that parseNeeds
// reads, and the forms it refuses, which must name the job rather than read as
// "no needs".
const NEEDS_FORMS = {
  "flow on one line": "    needs: [check, bundle-size]\n",
  "flow over several lines":
    "    needs:\n      [\n        check,\n        bundle-size,\n      ]\n",
  "flow opened on the key's line": "    needs: [check,\n      bundle-size]\n",
  scalar: "    needs: bundle-size\n",
  block: "    needs:\n      - check\n      - bundle-size\n",
  "block with a comment between items":
    "    needs:\n      - check\n      # the size comment\n      - bundle-size # informational\n",
  "a quoted item": "    needs: [check, 'bundle-size']\n",
};

for (const [name, form] of Object.entries(NEEDS_FORMS)) {
  test(`fixture: a gated job that needs a job outside the gate is caught — ${name}`, () => {
    const mutated = FIXTURE.replace(
      "  coverage:\n    needs: [check]\n",
      `  coverage:\n${form}`,
    );
    assert.notEqual(mutated, FIXTURE);
    const v = findViolations(mutated, new Map([["bundle-size", "info-only"]]));
    assert.deepEqual(v.needsOutsideGate, ["coverage → bundle-size"]);
  });
}

const REFUSED_NEEDS = {
  "an alias": "    needs: *upstream\n",
  "an anchor": "    needs: &upstream [check]\n",
  "a tag": "    needs: !!seq [check]\n",
  "a flow sequence never closed":
    "    needs:\n      [\n        check,\n    runs-on: x\n",
  "a key with no list": "    needs:\n    runs-on: x\n",
  "a block item that is not a name":
    "    needs:\n      - check\n      - [bundle-size]\n",
  "a second needs key": "    needs: [check]\n    needs: [bundle-size]\n",
};

for (const [name, form] of Object.entries(REFUSED_NEEDS)) {
  test(`fixture: needs written as ${name} is refused, naming the job`, () => {
    const mutated = FIXTURE.replace(
      "  coverage:\n    needs: [check]\n",
      `  coverage:\n${form}`,
    );
    assert.notEqual(mutated, FIXTURE);
    assert.throws(
      () => findViolations(mutated, new Map([["bundle-size", "info-only"]])),
      /the needs of job coverage are written in a form parseNeeds does not read/,
    );
  });
}

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

test("fixture: a needs job whose result is never READ is caught (#1127, other half)", () => {
  // The gate still waits for `coverage`, and its aggregate fails on a failure
  // there, but no line of the script reads it, so nothing decides whether its
  // skip may pass — one step further in than membership can see (#1127).
  const mutated = FIXTURE.replace(
    '          COVERAGE="${{ needs.coverage.result }}"\n',
    "",
  );
  const v = findViolations(mutated, new Map([["bundle-size", "info-only"]]));
  assert.deepEqual(v.neededButUnread, ["coverage"]);
  // …and membership alone still reports everything as fine, which is the point.
  assert.deepEqual(v.ungated, []);
});

test("fixture: reading a job's OUTPUTS counts as gating it, not only .result", () => {
  const outputsOnly = FIXTURE.replace(
    '          if [[ "${{ needs.check.result }}" != "success" ]]; then exit 1; fi\n',
    '          MODE="${{ needs.check.outputs.mode }}"\n',
  );
  const v = findViolations(
    outputsOnly,
    new Map([["bundle-size", "info-only"]]),
  );
  assert.deepEqual(v.neededButUnread, []);
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

test("ci.yml: every job the gate waits for is also READ by it (#1127, other half)", () => {
  assert.deepEqual(
    real.neededButUnread,
    [],
    `job(s) [${real.neededButUnread.join(", ")}] are in '${GATE_JOB}'.needs but ` +
      "their result is never read in the 'Determine result' script — the " +
      "aggregate fails them on a failure or a cancellation, but nothing decides " +
      "whether their skip may pass. Read `needs.<job>.result` (or an output) there, or " +
      "drop the job from `needs` and allowlist it in OUTSIDE_GATE.",
  );
  // Parser sanity: a restructured gate job must not degrade into "empty script",
  // which would make every entry look unread rather than silently look fine.
  assert.ok(
    parseGateScript(readFileSync(CI_YML, "utf8")).includes("Determine result"),
    "parseGateScript() no longer captures the gate's step — ci.yml layout changed?",
  );
});

test("ci.yml: every job the gate waits for needs only jobs the gate waits for", () => {
  assert.deepEqual(
    real.needsOutsideGate,
    [],
    `edge(s) [${real.needsOutsideGate.join(", ")}] lead into a job the gate ` +
      "waits for from one it does not: when that one fails, GitHub skips the " +
      "job, and the gate reads a skip it may allow. Add the upstream job to " +
      `'${GATE_JOB}'.needs, with a row in SKIP_FORBIDDEN.`,
  );
});

test("ci.yml: no job the gate waits for carries a job-level continue-on-error", () => {
  assert.deepEqual(
    real.continueOnError,
    [],
    `job(s) [${real.continueOnError.join(", ")}] in '${GATE_JOB}'.needs carry ` +
      "`continue-on-error`: a failure there may reach the gate as a pass.",
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

// `sonar-trusted.yml` produces the required `SonarCloud` context, and the only
// thing it needs from THIS workflow is the `pr-meta` artifact: the PR number and
// head SHA it posts the verdict to. Nothing inside ci.yml reads that upload, so
// pruning it as unused looks harmless here and surfaces one PR later as a red
// required check nobody can place. Same class as the rest of this file — a wire
// whose absence is silent at the point where it is cut.
test("ci.yml: the pr-meta artifact sonar-trusted.yml consumes is still uploaded", () => {
  const yaml = readFileSync(CI_YML, "utf8");
  assert.match(
    yaml,
    /name: pr-meta\b/,
    "ci.yml no longer uploads the `pr-meta` artifact — `sonar-trusted.yml` " +
      "downloads it by that name to learn which SHA to post the required " +
      "`SonarCloud` status to, and fails without it.",
  );
  for (const file of ["pr-number.txt", "head-sha.txt"]) {
    assert.ok(
      yaml.includes(file),
      `ci.yml no longer writes pr-meta/${file} — sonar-trusted.yml reads it.`,
    );
  }
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

// --------------------------------------------------------------------------
// The gate's script, executed. Its aggregate fails on any job in `needs` that
// neither passed nor was skipped; the rest decides whose skip is forbidden.
// SKIP_FORBIDDEN is that decision as a table — a job in `needs` without a row
// fails, because classifying a job is a list, not a reading of its `if:` — and
// the script runs as the runner runs it: expressions substituted into its
// text, `env:` values exported, under `bash -e`.
// --------------------------------------------------------------------------

/** When a skip of each job in the gate's `needs` fails the gate. */
const SKIP_FORBIDDEN = {
  check: "always",
  "prose-lint": "always",
  actionlint: "always but on a Dependabot pull request",
  "repo-lints": "always",
  "pipeline-leaf": "when should_run, in leaf mode",
  "base-bundle": "when should_run, in sharded mode",
  "base-test": "when should_run, in sharded mode",
  "base-lint": "when should_run, in sharded mode",
  "base-coverage": "when should_run, in sharded mode",
  "base-properties": "when should_run, in sharded mode",
  "pipeline-sharded": "never",
  smoke: "never",
  coverage: "never",
  "examples-build": "never",
  "benchmarks-lint": "never",
  "cross-router-lint": "never",
};

const SKIP_RULES = {
  always: () => true,
  "always but on a Dependabot pull request": (context) => !context.dependabot,
  "when should_run, in leaf mode": (context) =>
    context.shouldRun === "true" && context.mode === "leaf",
  "when should_run, in sharded mode": (context) =>
    context.shouldRun === "true" && context.mode === "sharded",
  never: () => false,
};

// The four results GitHub documents, and one it does not: an unknown result
// must fail the gate as well.
const RESULTS = ["success", "failure", "cancelled", "skipped", "neutral"];

/** Whether the gate passes a state: the aggregate, the table, a known mode. */
function expected({ context, results }) {
  return (
    Object.values(results).every((r) => r === "success" || r === "skipped") &&
    Object.entries(results).every(
      ([job, r]) =>
        r === "success" || !SKIP_RULES[SKIP_FORBIDDEN[job]](context),
    ) &&
    (context.shouldRun !== "true" ||
      context.mode === "leaf" ||
      context.mode === "sharded")
  );
}

/** The value of one expression; anything outside the closed set is refused. */
function evaluate(expression, { context, results, needsJson }) {
  let match = /^needs\.([\w-]+)\.result$/.exec(expression);

  if (match && Object.hasOwn(results, match[1])) {
    return results[match[1]];
  }

  match = /^needs\.check\.outputs\.(should_run|mode)$/.exec(expression);

  if (match) {
    return match[1] === "should_run" ? context.shouldRun : context.mode;
  }

  if (expression === "toJSON(needs)") {
    return (
      needsJson ??
      JSON.stringify(
        Object.fromEntries(
          Object.entries(results).map(([job, result]) => [
            job,
            {
              result,
              outputs:
                job === "check"
                  ? { should_run: context.shouldRun, mode: context.mode }
                  : {},
            },
          ]),
        ),
        null,
        2,
      )
    );
  }

  if (
    expression === "github.event.pull_request.user.login == 'dependabot[bot]'"
  ) {
    return String(context.dependabot);
  }

  throw new Error(`the harness does not know the expression: ${expression}`);
}

/**
 * Substitutes expressions into a text as the runner does: an expression ends
 * at the first `}}` outside a single-quoted literal, where `''` is a quote.
 */
function substitute(text, state) {
  let out = "";
  let at = 0;

  for (;;) {
    const open = text.indexOf("${{", at);

    if (open === -1) return out + text.slice(at);

    let end = open + 3;
    let quoted = false;

    for (; end < text.length; end++) {
      if (text[end] === "'") {
        if (quoted && text[end + 1] === "'") end++;
        else quoted = !quoted;
      } else if (!quoted && text.startsWith("}}", end)) {
        break;
      }
    }

    if (end >= text.length) throw new Error("an unterminated ${{");

    out +=
      text.slice(at, open) + evaluate(text.slice(open + 3, end).trim(), state);
    at = end + 2;
  }
}

const quote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;
const BASH = execFileSync("bash", ["-c", "command -v bash"], {
  encoding: "utf8",
}).trim();

/** Each state's exit code, many states per `bash` process, one subshell each. */
function exitCodes(step, states, env = process.env) {
  const dir = mkdtempSync(join(tmpdir(), "ci-gate-"));

  try {
    const codes = [];

    for (let from = 0; from < states.length; from += 400) {
      const chunk = states.slice(from, from + 400);
      let script = "set +e\n";

      for (const state of chunk) {
        const exports = Object.entries(step.env)
          .map(
            ([name, value]) =>
              `export ${name}=${quote(substitute(value, state))}`,
          )
          .join("\n");

        script += `(\n${exports}\nset -e\n${substitute(step.run, state)}) >/dev/null 2>&1\necho "exit:$?"\n`;
      }

      const file = join(dir, "states.sh");

      writeFileSync(file, script);

      const out = spawnSync(BASH, [file], {
        encoding: "utf8",
        env,
        maxBuffer: 1 << 26,
      });
      const got = out.stdout
        .split("\n")
        .filter((line) => line.startsWith("exit:"))
        .map((line) => Number(line.slice("exit:".length)));

      assert.equal(
        got.length,
        chunk.length,
        `bash ran ${got.length} of ${chunk.length} states`,
      );
      codes.push(...got);
    }

    return codes;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CI = readFileSync(CI_YML, "utf8");
const STEP = parseGateStep(CI);
const NEEDS = parseNeeds(CI, GATE_JOB);

/** Every context × two base states × every job in every result. */
function states() {
  const all = new Map();

  for (const shouldRun of ["true", "false", ""]) {
    for (const mode of ["leaf", "sharded", "", "unknown"]) {
      for (const dependabot of [false, true]) {
        const context = { shouldRun, mode, dependabot };
        const bases = [
          Object.fromEntries(NEEDS.map((job) => [job, "success"])),
          Object.fromEntries(
            NEEDS.map((job) => [
              job,
              SKIP_RULES[SKIP_FORBIDDEN[job]](context) ? "success" : "skipped",
            ]),
          ),
        ];

        // Pairs: two jobs whose skip is forbidden here, both skipped, so a
        // script that only fails on one skip at a time is caught too.
        const forbidden = NEEDS.filter((job) =>
          SKIP_RULES[SKIP_FORBIDDEN[job]](context),
        );
        for (let a = 0; a < forbidden.length; a++) {
          for (let b = a + 1; b < forbidden.length; b++) {
            const results = {
              ...bases[0],
              [forbidden[a]]: "skipped",
              [forbidden[b]]: "skipped",
            };
            all.set(JSON.stringify([context, results]), { context, results });
          }
        }

        for (const base of bases) {
          const variants = [base];

          for (const job of NEEDS) {
            for (const result of RESULTS)
              variants.push({ ...base, [job]: result });
          }

          for (const results of variants) {
            all.set(JSON.stringify([context, results]), { context, results });
          }
        }
      }
    }
  }

  return [...all.values()];
}

test("the gate step is read in its one shape, and the table names every job it waits for", () => {
  assert.ok(STEP, "parseGateStep() could not read the `Determine result` step");
  assert.deepEqual(
    Object.keys(SKIP_FORBIDDEN).sort(),
    [...NEEDS].sort(),
    "SKIP_FORBIDDEN must have exactly one row per job in the gate's needs",
  );
});

test("the gate's verdict matches the table in every state", () => {
  const all = states();
  const codes = exitCodes(STEP, all);
  const wrong = all
    .map((state, i) => ({ state, code: codes[i], want: expected(state) }))
    .filter(({ code, want }) => (code === 0) !== want);

  assert.ok(all.length > 2000, `only ${all.length} states enumerated`);
  assert.deepEqual(
    wrong.slice(0, 3).map(({ state, code, want }) => ({
      context: state.context,
      notSuccess: Object.fromEntries(
        Object.entries(state.results).filter(([, r]) => r !== "success"),
      ),
      exit: code,
      wantPass: want,
    })),
    [],
    `${wrong.length} state(s) where the gate disagrees with the table`,
  );
});

test("a corrupted needs context fails the gate", () => {
  const context = { shouldRun: "true", mode: "leaf", dependabot: false };
  const results = Object.fromEntries(NEEDS.map((job) => [job, "success"]));
  const corrupted = [
    "",
    "null",
    "{}",
    "[]",
    "not json",
    '{"check":{"result":"success"}}{"check":{"result":"success"}}',
    '{"check":{}}',
  ];
  const codes = exitCodes(STEP, [
    { context, results },
    ...corrupted.map((needsJson) => ({ context, results, needsJson })),
  ]);

  assert.equal(codes[0], 0, "the control state must pass");
  assert.ok(
    codes.slice(1).every((code) => code !== 0),
    `a corrupted context passed: ${JSON.stringify(codes.slice(1))}`,
  );
});

test("without jq on PATH the gate fails, it does not pass", () => {
  const context = { shouldRun: "true", mode: "leaf", dependabot: false };
  const results = Object.fromEntries(NEEDS.map((job) => [job, "success"]));
  const empty = mkdtempSync(join(tmpdir(), "ci-gate-path-"));

  try {
    const [code] = exitCodes(STEP, [{ context, results }], { PATH: empty });

    assert.equal(code, 127);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("the subshell form agrees with `bash -e` — through the aggregate, jq's error and a missing jq", () => {
  const leaf = { shouldRun: "true", mode: "leaf", dependabot: false };
  const passing = Object.fromEntries(NEEDS.map((job) => [job, "success"]));
  const sample = [
    ...states().filter((_, i) => i % 300 === 0),
    { context: leaf, results: { ...passing, smoke: "cancelled" } },
    { context: leaf, results: passing, needsJson: "" },
    { context: leaf, results: passing, needsJson: "{}" },
  ];
  const dir = mkdtempSync(join(tmpdir(), "ci-gate-bash-e-"));
  const empty = mkdtempSync(join(tmpdir(), "ci-gate-path-"));

  try {
    const viaBashE = (state, path) => {
      const file = join(dir, "step.sh");

      writeFileSync(file, substitute(STEP.run, state));

      const env = { PATH: path };

      for (const [name, value] of Object.entries(STEP.env)) {
        env[name] = substitute(value, state);
      }

      return spawnSync(BASH, ["-e", file], { env, encoding: "utf8" }).status;
    };
    const codes = exitCodes(STEP, sample);

    sample.forEach((state, i) => {
      assert.equal(
        viaBashE(state, process.env.PATH),
        codes[i],
        `state ${i} differs`,
      );
    });
    assert.equal(viaBashE(sample[0], empty), 127, "a missing jq must exit 127");
    assert.deepEqual(codes.slice(-3), [1, 5, 5], "the aggregate's own exits");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

/** ci.yml with one change inside the gate job, which must occur once there. */
function inGate(from, to) {
  const at = CI.indexOf("\n  ci:\n");
  const gate = CI.slice(at);

  assert.equal(
    gate.split(from).length,
    2,
    `not exactly once in the gate job: ${from}`,
  );

  return CI.slice(0, at) + gate.replace(from, () => to);
}

const OPEN_FORMS = {
  "if: always() continued on the next line": () =>
    inGate("    if: always()\n", "    if: always()\n      && false\n"),
  "continue-on-error hidden in a comment behind CR": () =>
    inGate(
      "    steps:\n",
      "    # note\r    continue-on-error: true\n    steps:\n",
    ),
  "continue-on-error hidden in a comment behind NEL": () =>
    inGate(
      "    steps:\n",
      "    # note\u0085    continue-on-error: true\n    steps:\n",
    ),
  "continue-on-error hidden in a comment behind LS": () =>
    inGate(
      "    steps:\n",
      "    # note\u2028    continue-on-error: true\n    steps:\n",
    ),
  "a step-level continue-on-error": () =>
    `${CI.trimEnd()}\n        continue-on-error: true\n`,
  "a step-level shell": () => `${CI.trimEnd()}\n        shell: bash {0}\n`,
  "a step-level if:": () =>
    inGate(
      "      - name: Determine result\n",
      "      - name: Determine result\n        if: github.event.pull_request.user.login != 'dependabot[bot]'\n",
    ),
  "a second step": () =>
    `${CI.trimEnd()}\n      - name: Extra\n        run: echo\n`,
  "a job-level continue-on-error": () =>
    inGate("    steps:\n", "    continue-on-error: true\n    steps:\n"),
  "job-level defaults": () =>
    inGate(
      "    steps:\n",
      "    defaults:\n      run:\n        shell: bash {0}\n    steps:\n",
    ),
  "workflow-level defaults": () =>
    CI.replace(
      /^jobs:\n/m,
      "defaults:\n  run:\n    shell: bash {0}\n\njobs:\n",
    ),
  "workflow-level defaults, quoted": () =>
    CI.replace(
      /^jobs:\n/m,
      '"defaults":\n  run:\n    shell: bash {0}\n\njobs:\n',
    ),
  "workflow-level defaults behind a BOM": () =>
    CI.replace(
      /^jobs:\n/m,
      "\uFEFFdefaults:\n  run:\n    shell: bash {0}\n\njobs:\n",
    ),
  "BASH_ENV in the workflow's env": () =>
    CI.replace(/^env:\n/m, "env:\n  BASH_ENV: ./x.sh\n"),
  "the workflow's env in flow style": () =>
    `${CI.slice(0, CI.indexOf("\nenv:\n") + 1)}env: { BASH_ENV: ./x.sh }\n${CI.slice(CI.indexOf("\njobs:\n") + 1)}`,
  "BASH_ENV in the step's env": () =>
    inGate(
      "          NEEDS: ${{ toJSON(needs) }}\n",
      "          NEEDS: ${{ toJSON(needs) }}\n          BASH_ENV: ./x.sh\n",
    ),
  "no if: always()": () => inGate("    if: always()\n", ""),
  "if: always() as an expression": () =>
    inGate("    if: always()\n", "    if: ${{ always() }}\n"),
  "a quoted job-level key": () =>
    inGate("    steps:\n", '    "continue-on-error": true\n    steps:\n'),
};

for (const [name, mutate] of Object.entries(OPEN_FORMS)) {
  test(`the gate job is read closed: ${name} is refused`, () => {
    const mutated = mutate();

    assert.notEqual(mutated, CI);
    assert.ok(parseGateStep(CI), "control: the real ci.yml must be read");
    assert.equal(parseGateStep(mutated), undefined);
  });
}

test("an expression the harness does not know is refused, not guessed", () => {
  assert.throws(
    () => substitute("echo ${{ github.sha }}", { context: {}, results: {} }),
    /does not know the expression: github\.sha/,
  );
});
