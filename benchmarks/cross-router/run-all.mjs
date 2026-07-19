#!/usr/bin/env node
// Run the full matrix (every scenario × engine, per cohort) to populate results/
// (the source the infographic deck is rebuilt from; text REPORT-*.md are retired).
//   node cross-router/run-all.mjs [runs=15] [framework]
// No framework arg → all cohorts (react + vue + solid + svelte + angular) = the full matrix.
// A framework arg restricts to that cohort, using its OWN engine roster.
//
// INTERLEAVED (#1460): for each scenario, all of a cohort's engines are built + served,
// then measured ROUND-ROBIN in one browser session (rotating order each round) rather
// than engine-at-a-time. Machine drift then hits every engine equally — no engine is
// systematically measured first — closing the position-bias class a fixed roster order
// left open. Cells are written via the shared writeCell (smoke-grade guard, #1455) with
// the shared provenance stamp (#1459).
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { isKnownNA } from "./harness/known-na.mjs";
import { measureInterleaved } from "./harness/measure.mjs";
import { envStamp, freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { appRoot, COHORT_ENGINES, runsFor, SCENARIOS } from "./harness/scenarios-registry.mjs";
import { N_MIN, writeCell } from "./harness/write-cell.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const SCENARIO_NAMES = Object.keys(SCENARIOS);
// _baseline (bare framework, no router) — reference floor for scenarios with a
// no-router analog. Run after the main matrix of each cohort.
const BASELINE_SCENARIOS = ["cold-start", "nav-latency", "link-build"];

const runs = process.argv[2] ?? "15";
const fwArg = process.argv[3];
const frameworks = fwArg ? [fwArg] : Object.keys(COHORT_ENGINES);

// BENCH_SMOKE=1 — measure-only dry matrix (the orchestrator's Step-5 smoke and CI-style
// fail-fast checks): every app must BUILD + DRIVE, nothing is persisted, and a
// non-persisted cell is NOT a failure — the exit code answers "does the matrix drive?",
// not "is the matrix written?". Without this mode the K13 refusal below would abort the
// very smoke path (`run-all.mjs 1`) it was never aimed at.
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

// Gate a stale dist + capture provenance ONCE, before any build (#1459).
const provenance = freshnessGateAndProvenance(here);

let ok = 0;
let failed = 0;
let skipped = 0;

// Build + serve every listed engine's app for one scenario, measure them interleaved,
// write one cell each. Engines whose app is missing / fails to build are counted and
// skipped; an engine whose scenario throws mid-run is dropped by measureInterleaved.
const runScenario = async (framework, scenarioName, engineList) => {
  const scenario = SCENARIOS[scenarioName];
  // Sweep scenarios run at max(50, base/2) — see runsFor in scenarios-registry.mjs.
  const effRuns = runsFor(scenarioName, Number(runs));
  const started = Date.now();
  const apps = [];
  const servers = [];
  for (const engine of engineList) {
    const root = appRoot(here, framework, engine, scenarioName);
    const configFile = `${root}/vite.config.ts`;
    if (!existsSync(configFile)) {
      failed += 1;
      console.error(`!! no app at ${root} (${framework}·${scenarioName}×${engine})`);
      continue;
    }
    try {
      await build({ root, configFile, logLevel: "warn" });
      const server = await preview({
        root,
        configFile,
        preview: { port: 0 },
        logLevel: "warn",
      });
      servers.push(server);
      apps.push({ engine, baseURL: server.resolvedUrls.local[0] });
    } catch (error) {
      failed += 1;
      console.error(
        `!! build/serve failed: ${framework}·${scenarioName}×${engine}: ${error.message}`,
      );
    }
  }
  if (apps.length === 0) return;

  console.error(
    `\n=== ${framework} · ${scenarioName} × [${apps.map((a) => a.engine).join(", ")}] interleaved (n=${effRuns}) ===`,
  );
  let results;
  try {
    results = await measureInterleaved({
      apps,
      scenario,
      runs: effRuns,
    });
  } catch (error) {
    failed += apps.length;
    console.error(`!! measure failed: ${framework}·${scenarioName}: ${error.message}`);
    return;
  } finally {
    await Promise.all(servers.map((s) => s.close()));
  }

  for (const { engine } of apps) {
    if (!results[engine]) {
      failed += 1; // dropped mid-interleave (threw)
      continue;
    }
    if (SMOKE_MODE) {
      ok += 1; // measured + drove — the smoke's only question; nothing persisted
      continue;
    }
    const out = {
      scenario: scenarioName,
      engine,
      framework,
      ...results[engine],
      env: envStamp(provenance),
    };
    if (writeCell(`${here}/results`, out, effRuns)) {
      ok += 1;
    } else {
      // Measured but NOT persisted (smoke-grade or n-downgrade refusal) — for matrix
      // purposes that cell is missing, so it must redden the run, not vanish silently
      // into a green exit (audit 07-18 K13).
      failed += 1;
      console.error(`!! cell not persisted: ${framework}·${scenarioName}×${engine} (writeCell refused)`);
    }
  }
  console.error(
    `  · ${scenarioName}: ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
};

for (const framework of frameworks) {
  const engines = COHORT_ENGINES[framework];
  if (!engines) {
    failed += 1;
    console.error(
      `!! unknown framework: ${framework} (expected one of ${Object.keys(COHORT_ENGINES).join(", ")})`,
    );
    continue;
  }
  for (const scenarioName of SCENARIO_NAMES) {
    const participants = engines.filter((engine) => {
      if (isKnownNA(framework, scenarioName, engine)) {
        skipped += 1;
        console.error(
          `⊘ ${framework} · ${scenarioName} × ${engine}: documented competitor N/A — skipped (KNOWN_NA registry)`,
        );
        return false;
      }
      return true;
    });
    if (participants.length > 0) {
      await runScenario(framework, scenarioName, participants);
    }
  }
  // _baseline is a single engine per applicable scenario (nothing to interleave).
  for (const scenarioName of BASELINE_SCENARIOS) {
    await runScenario(framework, scenarioName, ["_baseline"]);
  }
}

console.error(
  `\nmatrix done: ${ok} ok, ${failed} failed, ${skipped} n/a (documented)`,
);
process.exit(failed > 0 ? 1 : 0);
