#!/usr/bin/env node
// Scoped runner: a SUBSET of scenarios × each cohort's engines, interleaved (same
// methodology as run-all.mjs), writing MAIN results/ — for refreshing a few cells
// without the full ~3 h matrix. Shares the run-all contract end-to-end (audit 07-18
// K14/K15): the COHORT_ENGINES roster and KNOWN_NA skip-map come from the same shared
// modules, and cells carry the same full env stamp (cpu/runner included, O-10).
//   node cross-router/run-subset.mjs <scenariosCSV> [runs=50] [framework]
// e.g. node cross-router/run-subset.mjs active-links,link-build 50
//
// The build → serve → interleave → write sequence itself lives in
// `harness/scenario-run.mjs` (#1746). It used to be copied here, and the copy is exactly
// the drift the K14/K15 audit was about: two runners can disagree about what a cell IS
// only if each carries its own idea of one.
//
// ⚠ No fail-fast here, unlike run-all. This runner exists to refresh a handful of named
// cells by hand, so a failure in one says nothing about the next — while run-all builds a
// snapshot that publishes all-or-nothing, which is what makes carrying on after a failure
// there work whose output is already void.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isKnownNA } from "./harness/known-na.mjs";
import { freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { runScenarioCells } from "./harness/scenario-run.mjs";
import { COHORT_ENGINES, SCENARIOS } from "./harness/scenarios-registry.mjs";
import { N_MIN } from "./harness/write-cell.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const scenariosArg = (process.argv[2] ?? "").split(",").filter(Boolean);
const runs = process.argv[3] ?? "50";
const fwArg = process.argv[4];
const frameworks = fwArg ? [fwArg] : Object.keys(COHORT_ENGINES);
const scenarioNames = scenariosArg.length ? scenariosArg : ["active-links", "link-build"];
for (const s of scenarioNames) if (!SCENARIOS[s]) { console.error(`unknown scenario: ${s}`); process.exit(1); }
for (const fw of frameworks) if (!COHORT_ENGINES[fw]) { console.error(`unknown framework: ${fw} (expected one of ${Object.keys(COHORT_ENGINES).join(", ")})`); process.exit(1); }
// Same sub-N_MIN refusal as run-all (audit 07-18 K13): this runner exists to WRITE
// results/ — a run that persists nothing while exiting green is a trap.
if (!Number.isFinite(Number(runs)) || Number(runs) < N_MIN) {
  console.error(`run-subset: runs=${runs} is below N_MIN=${N_MIN} — nothing would be persisted (#1455). Use run.mjs for sub-N_MIN A/B smokes.`);
  process.exit(1);
}

const provenance = freshnessGateAndProvenance(here);
let ok = 0, failed = 0, skipped = 0;

for (const framework of frameworks) {
  for (const scenarioName of scenarioNames) {
    const engines = COHORT_ENGINES[framework].filter((engine) => {
      if (isKnownNA(framework, scenarioName, engine)) {
        skipped += 1;
        console.error(`⊘ ${framework} · ${scenarioName} × ${engine}: documented competitor N/A — skipped (harness/known-na.mjs)`);
        return false;
      }
      return true;
    });
    if (engines.length === 0) continue;
    const cell = await runScenarioCells({
      here,
      framework,
      scenarioName,
      engineList: engines,
      baseRuns: Number(runs),
      provenance,
      onReady: ({ engines: measured, effRuns }) => {
        console.error(`\n=== ${framework} · ${scenarioName} × [${measured.join(", ")}] interleaved (n=${effRuns}) ===`);
      },
    });
    ok += cell.ok;
    failed += cell.failed;
    for (const engine of cell.written) console.error(`✔ ${framework}·${scenarioName}×${engine}`);
  }
}
console.error(`\nsubset done: ${ok} ok, ${failed} failed, ${skipped} n/a (documented)`);
process.exit(failed > 0 ? 1 : 0);
