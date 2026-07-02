#!/usr/bin/env node
// Run the full matrix (every scenario × engine, per cohort) to populate results/,
// then `node harness/report.mjs <fw>` turns results/ into REPORT[-<fw>].md.
//   node cross-router/run-all.mjs [runs=15] [framework]
// No framework arg → all cohorts (react + vue + solid + svelte) = the full matrix. (preact cohort removed — see COHORT_ENGINES.)
// A framework arg restricts to that cohort, using its OWN engine roster (the
// engines differ per cohort — that is why a single hardcoded list was wrong).
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Per-cohort engine rosters — each cohort compares real-router against that
// framework's real competitors (see apps/<fw>/ and the REPORT Scope sections).
const COHORT_ENGINES = {
  react: ["real-router", "tanstack", "react-router"],
  // preact cohort REMOVED — no full-router competitor: preact-iso is a minimalist (recommended) location-matcher, preact-router is deprecated. No honest competitive perf benchmark possible. (real-router/preact adapter still ships + is tested; just not benchmarked here.)
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router", "mateo-router"],
};
const SCENARIOS = [
  "cold-start",
  "nav-latency",
  "param-nav",
  "wide-config",
  "deep-config",
  "param-scaling",
  "table-heap",
  "nav-churn",
  "active-links",
  "link-build",
  "nested-switch",
];
// _baseline (bare framework, no router) — reference floor for scenarios with a
// no-router analog. Run after the main matrix of each cohort.
const BASELINE_SCENARIOS = ["cold-start", "nav-latency", "link-build"];

const runs = process.argv[2] ?? "15";
const fwArg = process.argv[3];
const frameworks = fwArg ? [fwArg] : Object.keys(COHORT_ENGINES);

let ok = 0;
let failed = 0;

const runOne = (scenario, engine, framework) => {
  console.error(`\n=== ${framework} · ${scenario} × ${engine} (runs=${runs}) ===`);
  const result = spawnSync(
    "node",
    [`${here}/run.mjs`, scenario, engine, framework, runs],
    { stdio: ["inherit", "ignore", "inherit"], env: process.env },
  );
  if (result.status === 0) {
    ok += 1;
  } else {
    failed += 1;
    console.error(`!! FAILED: ${framework} · ${scenario} × ${engine} (status ${result.status})`);
  }
};

for (const framework of frameworks) {
  const engines = COHORT_ENGINES[framework];
  if (!engines) {
    failed += 1;
    console.error(`!! unknown framework: ${framework} (expected one of ${Object.keys(COHORT_ENGINES).join(", ")})`);
    continue;
  }
  for (const scenario of SCENARIOS) {
    for (const engine of engines) runOne(scenario, engine, framework);
  }
  for (const scenario of BASELINE_SCENARIOS) runOne(scenario, "_baseline", framework);
}

console.error(`\nmatrix done: ${ok} ok, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
