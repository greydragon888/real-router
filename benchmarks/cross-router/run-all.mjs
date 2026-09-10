#!/usr/bin/env node
// Run the full matrix (every scenario × engine, per cohort) to populate results/
// (the source the infographic deck is rebuilt from; text REPORT-*.md are retired).
//   node cross-router/run-all.mjs [runs=15] [framework]
// No framework arg → all cohorts (react + vue + solid + svelte + angular) = the full matrix.
// A framework arg restricts to that cohort, using its OWN engine roster.
//
// ORCHESTRATOR ONLY (#1746). This module decides WHAT to measure and in what order; the
// measuring lives in `run-scenario.mjs`, forked once per scenario, over the one shared
// implementation in `harness/scenario-run.mjs` that `run-subset.mjs` calls too. The
// PROCESS boundary is there for memory and the number is in the worker's header. The
// MODULE boundary is there because an orchestrator and a worker in one file share one
// fall-through: the worker's exit had to be a branch's last statement, or execution
// reached the orchestrator's loop and every worker forked workers of its own.
//
// INTERLEAVED (#1460): for each scenario, all of a cohort's engines are built + served,
// then measured ROUND-ROBIN in one browser session (rotating order each round) rather
// than engine-at-a-time. Machine drift then hits every engine equally — no engine is
// systematically measured first — closing the position-bias class a fixed roster order
// left open. Cells are written via the shared writeCell (smoke-grade guard, #1455) with
// the shared provenance stamp (#1459).
//
// FAIL-FAST (#1746). The first failure — a refused cell, a missing app, a worker killed
// by a signal — stops the run there. The snapshot is all-or-nothing by construction:
// `publish` is gated on a fully green job, so a partial matrix ships NOTHING and every
// minute after the first failure produces numbers that are already void. On this host the
// waste is not only ours — it is a co-tenant production box, the 09-07 OOM was triggered
// by a neighbour's `redis-server` reaching for memory, and carrying on after a kill means
// leaning on a machine that has just proved it has none left.
import { fork } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isKnownNA } from "./harness/known-na.mjs";
import { freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { COHORT_ENGINES, SCENARIOS } from "./harness/scenarios-registry.mjs";
import { N_MIN } from "./harness/write-cell.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = `${here}/run-scenario.mjs`;

/** A worker that died without reporting — the OOM class, distinct so a caller can tell. */
const EXIT_WORKER_KILLED = 137; // the 128+SIGKILL convention

const SCENARIO_NAMES = Object.keys(SCENARIOS);
// _baseline (bare framework, no router) — reference floor for scenarios with a
// no-router analog. Run after the main matrix of each cohort.
const BASELINE_SCENARIOS = ["cold-start", "nav-latency", "link-build"];

const runs = process.argv[2] ?? "15";
const fwArg = process.argv[3];
const frameworks = fwArg ? [fwArg] : Object.keys(COHORT_ENGINES);
const multiCohort = frameworks.length > 1;

// Cohort separator banner. Both CI (per-cohort invocations, see cross-router-bench.yml) and
// bench-cross-router.sh locally drive cohorts one-per-invocation; a whole-matrix single
// invocation (run-all.mjs "$RUNS" with no framework arg) is still supported and self-banners —
// so run-all only banners when a single invocation actually spans multiple cohorts, else the
// per-cohort caller's own banner would double.
function banner(text) {
  const bar = "═".repeat(50);
  console.error(`\n╔${bar}╗\n║ ${text.padEnd(48)} ║\n╚${bar}╝`);
}

// BENCH_SMOKE=1 — measure-only dry matrix (the orchestrator's Step-5 smoke and CI-style
// fail-fast checks): every app must BUILD + DRIVE, nothing is persisted, and a
// non-persisted cell is NOT a failure — the exit code answers "does the matrix drive?",
// not "is the matrix written?". Without this mode the K13 refusal below would abort the
// very smoke path (`run-all.mjs 1`) it was never aimed at. Workers read the same env.
const SMOKE_MODE = process.env.BENCH_SMOKE === "1";
if (SMOKE_MODE) console.error(`run-all: BENCH_SMOKE=1 — measure-only dry matrix, results/ untouched`);

// Sub-N_MIN matrix runs are a trap (audit 07-18 K13): every writeCell refuses, yet the
// run exits green — an empty/partial matrix that a later deck rebuild would publish as
// if complete. The matrix runner therefore REFUSES below N_MIN; per-cell A/B smokes at
// low n stay possible via run.mjs, and dry matrices via BENCH_SMOKE=1.
if (!SMOKE_MODE && (!Number.isFinite(Number(runs)) || Number(runs) < N_MIN)) {
  console.error(
    `run-all: runs=${runs} is below N_MIN=${N_MIN} — nothing would be persisted (smoke-grade guard #1455), ` +
      `while the run exits green (audit 07-18 K13). Use run.mjs for sub-N_MIN A/B smokes, ` +
      `or BENCH_SMOKE=1 for a measure-only dry matrix.`,
  );
  process.exit(1);
}

// Gate a stale dist ONCE, before any fork (#1459). Each worker gates again — that call is
// what stamps its own cells — but gating here is what makes a stale tree cost one process
// instead of the first scenario of a three-hour run.
freshnessGateAndProvenance(here);

let ok = 0;
let failed = 0;
let skipped = 0;
let workerKilled = false;

/**
 * Fork one worker for this scenario and fold its counts back. A worker that exits WITHOUT
 * a message was killed by a signal — the OOM class — so it is charged its whole engine
 * list and flagged: that is the failure whose cause is not in this log at all.
 */
const runScenarioIsolated = (framework, scenarioName, engineList) =>
  new Promise((resolve) => {
    const args = [runs, framework, scenarioName, engineList.join(",")];
    if (multiCohort) args.push("--hide-framework");
    const child = fork(WORKER, args, { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    let counts;
    child.on("message", (message) => {
      counts = message;
    });
    child.on("error", (error) => {
      console.error(`!! scenario worker failed to start: ${framework}·${scenarioName}: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
      if (counts) {
        ok += counts.ok;
        failed += counts.failed;
      } else {
        failed += engineList.length;
        workerKilled = true;
        console.error(
          `!! scenario worker died before reporting: ${framework}·${scenarioName} (code=${code} signal=${signal}) — ` +
            `${engineList.length} cell(s) counted as failed. A null code with SIGKILL is the OOM-killer's ` +
            `signature; the kernel log names the trigger (#1746).`,
        );
      }
      resolve();
    });
  });

const matrixStart = Date.now();
if (multiCohort) console.error(`\nCross-router matrix — ${frameworks.length} cohorts · base n=${runs}`);

for (const framework of frameworks) {
  const engines = COHORT_ENGINES[framework];
  if (!engines) {
    failed += 1;
    console.error(
      `!! unknown framework: ${framework} (expected one of ${Object.keys(COHORT_ENGINES).join(", ")})`,
    );
    break;
  }
  const cohortStart = Date.now();
  const ok0 = ok, failed0 = failed, skipped0 = skipped;
  if (multiCohort) banner(`${framework}   ·   n=${runs}   ·   ${engines.length} engines`);

  // One queue so the fail-fast check is written once: the matrix, then the baselines.
  const queue = [
    ...SCENARIO_NAMES.map((name) => ({ name, baseline: false })),
    // _baseline is a single engine per applicable scenario (nothing to interleave).
    ...BASELINE_SCENARIOS.map((name) => ({ name, baseline: true })),
  ];
  for (const { name: scenarioName, baseline } of queue) {
    const participants = baseline
      ? ["_baseline"]
      : engines.filter((engine) => {
          if (isKnownNA(framework, scenarioName, engine)) {
            skipped += 1;
            console.error(
              `⊘ ${framework} · ${scenarioName} × ${engine}: documented competitor N/A — skipped (KNOWN_NA registry)`,
            );
            return false;
          }
          return true;
        });
    if (participants.length === 0) continue;
    await runScenarioIsolated(framework, scenarioName, participants);
    if (failed > 0) break;
  }

  if (multiCohort) {
    const dur = ((Date.now() - cohortStart) / 1000).toFixed(1);
    console.error(
      `  ✓ ${framework} — ${ok - ok0} cells · ${failed - failed0} failed · ${skipped - skipped0} n/a · ${dur}s`,
    );
  }
  if (failed > 0) break;
}

const totalDur = ((Date.now() - matrixStart) / 1000).toFixed(1);
if (failed > 0) {
  console.error(
    `\nmatrix ABORTED on the first failure: ${ok} ok, ${failed} failed, ${skipped} n/a (documented) · ${totalDur}s\n` +
      `   A partial matrix publishes nothing (the deploy is gated on a green job), so the scenarios after\n` +
      `   this one would have produced numbers that are already void. Fix, then re-run whole (#1746).`,
  );
  process.exit(workerKilled ? EXIT_WORKER_KILLED : 1);
}
console.error(
  `\nmatrix done: ${ok} ok, ${failed} failed, ${skipped} n/a (documented) · ${totalDur}s`,
);
process.exit(0);
