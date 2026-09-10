#!/usr/bin/env node
// ONE scenario, ONE process — the worker `run-all.mjs` forks per scenario (#1746).
//   node cross-router/run-scenario.mjs <runs> <framework> <scenario> <enginesCSV> [--hide-framework]
//
// Why a process per scenario, measured: an in-process `vite build()` RETAINS ~73 MB of
// live heap (~105 MB RSS) per call — after two forced GCs, linearly, with no saturation
// out to 24 builds, and identically on macOS and on the Linux runner. A cohort makes
// 24-27 of them, so a cohort-lifetime process carries 2.7-3.3 GB by the end and has been
// OOM-killed three times (07-21 at 10.6 GB, 08-31 at 9.6 GB, 09-07 at 9.07 GB). The
// measure phase itself is FLAT (120 contexts: heapUsed 253 -> 247 MB), so the process
// boundary is drawn around the one term that grows. Measured on the same cohort, same n,
// same machine: peak RSS 3134 MB -> 1011 MB, 27 cells both times, 324 s against 381 s —
// the forks carry no measurable cost.
//
// ⚠ This is a SEPARATE module from the orchestrator on purpose, not for tidiness. While
// the two shared one file, the worker's exit path had to be the last statement of a
// branch or execution fell THROUGH into the orchestrator's own loop and every worker
// began forking workers of its own — a fork bomb, measured, whose log reads as the first
// scenario repeating. With two modules there is nothing to fall through into.
//
// Methodologically the boundary is free: the #1460 engine interleave lives ENTIRELY inside
// a single `measureInterleaved` call, which is inside a single scenario, so no comparison
// is split. Provenance is identical across processes on the same machine (commit/cpu/
// runner/dirty/distMtime) and env.date was already per-cell.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { runScenarioCells } from "./harness/scenario-run.mjs";
import { COHORT_ENGINES, SCENARIOS } from "./harness/scenarios-registry.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const [runsArg, framework, scenarioName, enginesArg] = positional;
// The orchestrator already printed the cohort banner when a run spans cohorts, so the
// scenario line must not repeat the name. A worker sees one framework and cannot derive
// that on its own — the orchestrator hands its answer down rather than letting it guess.
const hideFramework = argv.includes("--hide-framework");

const usage =
  "usage: run-scenario.mjs <runs> <framework> <scenario> <enginesCSV> [--hide-framework]";
if (!runsArg || !framework || !scenarioName || !enginesArg) {
  console.error(usage);
  process.exit(2);
}
if (!SCENARIOS[scenarioName]) {
  console.error(`run-scenario: unknown scenario: ${scenarioName}\n${usage}`);
  process.exit(2);
}
if (!COHORT_ENGINES[framework]) {
  console.error(
    `run-scenario: unknown framework: ${framework} (expected one of ${Object.keys(COHORT_ENGINES).join(", ")})`,
  );
  process.exit(2);
}
const baseRuns = Number(runsArg);
if (!Number.isFinite(baseRuns)) {
  console.error(`run-scenario: runs=${runsArg} is not a number\n${usage}`);
  process.exit(2);
}

// Gate a stale dist + capture provenance (#1459). The orchestrator gates too, so a stale
// tree is refused before any fork; this call is what stamps THIS process's cells.
const provenance = freshnessGateAndProvenance(here);

const started = Date.now();
const { ok, failed, effRuns } = await runScenarioCells({
  here,
  framework,
  scenarioName,
  engineList: enginesArg.split(",").filter(Boolean),
  baseRuns,
  provenance,
  persist: process.env.BENCH_SMOKE !== "1",
  onReady: ({ engines, effRuns: eff }) => {
    // n is shown once per cohort in the banner; annotate a scenario only when its effective
    // n differs from the base (the sweep-halving policy at base > 50 — runsFor).
    const nNote = eff !== baseRuns ? ` · n=${eff}` : "";
    const fwPrefix = hideFramework ? "" : `${framework} · `;
    console.error(`\n  ▸ ${fwPrefix}${scenarioName} × [${engines.join(", ")}]${nNote}`);
  },
});
void effRuns;
console.error(`  · ${scenarioName}: ${((Date.now() - started) / 1000).toFixed(1)}s`);

// ⚠ `send` is ASYNCHRONOUS — awaiting its flush is not optional. Exiting on the next line
// can drop the counts, and the orchestrator reads a missing message as "killed by a
// signal", which is the one case it treats as fatal.
if (process.send) await new Promise((flushed) => process.send({ ok, failed }, flushed));
process.exit(failed > 0 ? 1 : 0);
