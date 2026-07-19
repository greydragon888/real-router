#!/usr/bin/env node
// Scoped runner: a SUBSET of scenarios × each cohort's engines, interleaved (same
// methodology as run-all.mjs), writing MAIN results/ — for refreshing a few cells
// without the full ~3 h matrix. Shares the run-all contract end-to-end (audit 07-18
// K14/K15): the COHORT_ENGINES roster and KNOWN_NA skip-map come from the same shared
// modules, and cells carry the same full env stamp (cpu/runner included, O-10).
//   node cross-router/run-subset.mjs <scenariosCSV> [runs=50] [framework]
// e.g. node cross-router/run-subset.mjs active-links,link-build 50
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { resolveEngineVersion } from "./harness/engine-versions.mjs";
import { isKnownNA } from "./harness/known-na.mjs";
import { measureInterleaved } from "./harness/measure.mjs";
import { envStamp, freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { appRoot, COHORT_ENGINES, runsFor, SCENARIOS } from "./harness/scenarios-registry.mjs";
import { N_MIN, writeCell } from "./harness/write-cell.mjs";

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

const runScenario = async (framework, scenarioName, engineList) => {
  const scenario = SCENARIOS[scenarioName];
  // Sweep scenarios run at max(50, base/2) — see runsFor in scenarios-registry.mjs.
  const effRuns = runsFor(scenarioName, Number(runs));
  const apps = [], servers = [];
  for (const engine of engineList) {
    const root = appRoot(here, framework, engine, scenarioName);
    const configFile = `${root}/vite.config.ts`;
    if (!existsSync(configFile)) { failed += 1; console.error(`!! no app ${root}`); continue; }
    try {
      await build({ root, configFile, logLevel: "warn" });
      const server = await preview({ root, configFile, preview: { port: 0 }, logLevel: "warn" });
      servers.push(server);
      apps.push({ engine, baseURL: server.resolvedUrls.local[0] });
    } catch (error) { failed += 1; console.error(`!! build/serve ${framework}·${scenarioName}×${engine}: ${error.message}`); }
  }
  if (apps.length === 0) return;
  console.error(`\n=== ${framework} · ${scenarioName} × [${apps.map((a) => a.engine).join(", ")}] interleaved (n=${effRuns}) ===`);
  let results;
  try {
    results = await measureInterleaved({ apps, scenario, runs: effRuns });
  } catch (error) { failed += apps.length; console.error(`!! measure ${framework}·${scenarioName}: ${error.message}`); return; }
  finally { await Promise.all(servers.map((s) => s.close())); }
  for (const { engine } of apps) {
    if (!results[engine]) { failed += 1; continue; }
    const out = { scenario: scenarioName, engine, framework, ...results[engine], version: resolveEngineVersion(appRoot(here, framework, engine, scenarioName), framework, engine), env: envStamp(provenance) };
    if (writeCell(`${here}/results`, out, effRuns)) { ok += 1; console.error(`✔ ${framework}·${scenarioName}×${engine}`); }
    else { failed += 1; console.error(`!! cell not persisted: ${framework}·${scenarioName}×${engine} (writeCell refused)`); }
  }
};

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
    if (engines.length > 0) await runScenario(framework, scenarioName, engines);
  }
}
console.error(`\nsubset done: ${ok} ok, ${failed} failed, ${skipped} n/a (documented)`);
process.exit(failed > 0 ? 1 : 0);
