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
  angular: ["real-router", "angular-router"],
};
const SCENARIOS = [
  "cold-start",
  "nav-latency",
  "param-nav",
  "wide-config",
  "deep-config",
  "search-param-scaling",
  "table-heap",
  "nav-churn",
  "active-links",
  "back-forward",
  "link-build",
  "nested-switch",
];
// _baseline (bare framework, no router) — reference floor for scenarios with a
// no-router analog. Run after the main matrix of each cohort.
const BASELINE_SCENARIOS = ["cold-start", "nav-latency", "link-build"];

// Documented competitor limitations — (cohort → scenario → [engines]) cells that
// CANNOT produce a COMPARABLE result: either the COMPETING router errors on the
// scenario, or it structurally cannot express the scenario's semantics (so a cell
// would measure different — usually less — work). Not a harness or app bug. These
// are SKIPPED: not run, not counted as a failure — the per-cohort REPORT documents
// the N/A. Remove an entry if the competitor changes and the cell should measure again.
const KNOWN_NA = {
  // @tanstack/solid-router trips its internal error boundary on 60+-segment
  // deep-nested routes (renders 3/30, errors at 60/90). @tanstack/react-router
  // renders depth 90 — a solid-port limitation. See REPORT-solid.md.
  solid: { "deep-config": ["tanstack"] },
  // @mateothegreat/svelte5-router renders through `{#key result.path.original}` (the
  // FULL evaluated URL, verified in its route.svelte.d.ts), so an idiomatic two-level
  // app REMOUNTS the outer layout + inner router on every /sec/a↔/sec/b switch —
  // full-remount, not the ancestor-REUSE nested-switch measures. The reuse contract
  // is inexpressible in this router; a cell would price different (less) work than the
  // other cohorts' verified two-level cells. See REPORT-svelte.md (#1456).
  svelte: { "nested-switch": ["mateo-router"] },
};
const isKnownNA = (framework, scenario, engine) =>
  KNOWN_NA[framework]?.[scenario]?.includes(engine) ?? false;

const runs = process.argv[2] ?? "15";
const fwArg = process.argv[3];
const frameworks = fwArg ? [fwArg] : Object.keys(COHORT_ENGINES);

let ok = 0;
let failed = 0;
let skipped = 0;

const runOne = (scenario, engine, framework) => {
  if (isKnownNA(framework, scenario, engine)) {
    skipped += 1;
    console.error(`⊘ ${framework} · ${scenario} × ${engine}: documented competitor N/A — skipped (see REPORT-${framework}.md)`);
    return;
  }
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

console.error(
  `\nmatrix done: ${ok} ok, ${failed} failed, ${skipped} n/a (documented)`,
);
process.exit(failed > 0 ? 1 : 0);
