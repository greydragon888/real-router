#!/usr/bin/env node
// TEMP scoped runner (delete after use): run a SUBSET of scenarios × each cohort's
// engines, interleaved (same methodology as run-all.mjs), writing MAIN results/.
//   node cross-router/run-subset.mjs <scenariosCSV> [runs=50] [framework]
// e.g. node cross-router/run-subset.mjs active-links,link-build 50
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { measureInterleaved } from "./harness/measure.mjs";
import { freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { appRoot, SCENARIOS } from "./harness/scenarios-registry.mjs";
import { writeCell } from "./harness/write-cell.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const COHORT_ENGINES = {
  react: ["real-router", "tanstack", "react-router"],
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router", "mateo-router"],
  angular: ["real-router", "angular-router"],
};

const scenariosArg = (process.argv[2] ?? "").split(",").filter(Boolean);
const runs = process.argv[3] ?? "50";
const fwArg = process.argv[4];
const frameworks = fwArg ? [fwArg] : Object.keys(COHORT_ENGINES);
const scenarioNames = scenariosArg.length ? scenariosArg : ["active-links", "link-build"];
for (const s of scenarioNames) if (!SCENARIOS[s]) { console.error(`unknown scenario: ${s}`); process.exit(1); }

const provenance = freshnessGateAndProvenance(here);
let ok = 0, failed = 0;

const runScenario = async (framework, scenarioName, engineList) => {
  const scenario = SCENARIOS[scenarioName];
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
  console.error(`\n=== ${framework} · ${scenarioName} × [${apps.map((a) => a.engine).join(", ")}] interleaved (runs=${runs}) ===`);
  let results;
  try {
    results = await measureInterleaved({ apps, scenario, runs: Number(runs) });
  } catch (error) { failed += apps.length; console.error(`!! measure ${framework}·${scenarioName}: ${error.message}`); return; }
  finally { await Promise.all(servers.map((s) => s.close())); }
  for (const { engine } of apps) {
    if (!results[engine]) { failed += 1; continue; }
    const out = { scenario: scenarioName, engine, framework, ...results[engine], env: { date: new Date().toISOString(), ...provenance } };
    if (writeCell(`${here}/results`, out, Number(runs))) { ok += 1; console.error(`✔ ${framework}·${scenarioName}×${engine}`); }
  }
};

for (const framework of frameworks) {
  const engines = COHORT_ENGINES[framework];
  for (const scenarioName of scenarioNames) await runScenario(framework, scenarioName, engines);
}
console.error(`\nsubset done: ${ok} ok, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
