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
import { cpus } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { measureInterleaved } from "./harness/measure.mjs";
import { freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { appRoot, SCENARIOS } from "./harness/scenarios-registry.mjs";
import { writeCell } from "./harness/write-cell.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Per-cohort engine rosters — each cohort compares real-router against that framework's
// real competitors (see apps/<fw>/ and the REPORT Scope sections). The engines differ
// per cohort — that is why a single hardcoded list was wrong.
const COHORT_ENGINES = {
  react: ["real-router", "tanstack", "react-router"],
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router", "mateo-router"],
  angular: ["real-router", "angular-router"],
};
const SCENARIO_NAMES = Object.keys(SCENARIOS);
// _baseline (bare framework, no router) — reference floor for scenarios with a
// no-router analog. Run after the main matrix of each cohort.
const BASELINE_SCENARIOS = ["cold-start", "nav-latency", "link-build"];

// Documented competitor limitations — (cohort → scenario → [engines]) cells that CANNOT
// produce a COMPARABLE result: either the competing router errors, or it structurally
// cannot express the scenario's semantics. SKIPPED (not run, not a failure); the REPORT
// documents the N/A. Remove an entry if the competitor changes.
const KNOWN_NA = {
  solid: { "deep-config": ["tanstack"] },
  svelte: { "nested-switch": ["mateo-router"] },
};
const isKnownNA = (framework, scenario, engine) =>
  KNOWN_NA[framework]?.[scenario]?.includes(engine) ?? false;

const runs = process.argv[2] ?? "15";
const fwArg = process.argv[3];
const frameworks = fwArg ? [fwArg] : Object.keys(COHORT_ENGINES);

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
    `\n=== ${framework} · ${scenarioName} × [${apps.map((a) => a.engine).join(", ")}] interleaved ===`,
  );
  let results;
  try {
    results = await measureInterleaved({
      apps,
      scenario,
      runs: Number(runs),
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
    const out = {
      scenario: scenarioName,
      engine,
      framework,
      ...results[engine],
      env: { date: new Date().toISOString(), cpu: cpus()[0]?.model ?? "unknown", runner: process.env.BENCH_RUNNER ?? "local", ...provenance },
    };
    if (writeCell(`${here}/results`, out, Number(runs))) ok += 1;
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
