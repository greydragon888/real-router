// The ONE implementation of "measure one scenario": build + serve every listed engine's
// app, measure them interleaved (#1460), and write one cell each.
//
// It exists because there were two copies of this sequence — `run-all.mjs` and
// `run-subset.mjs` each carried their own — and a third was about to appear for the
// per-scenario worker (#1746). That is the drift `benchmarks/CLAUDE.md` already guards
// against for the freshness gate, the provenance stamp, the write guard and the scenario
// registry: one implementation, several schedulers, so the runners cannot disagree about
// what a cell IS.
//
// ⚠ This module does NOT log progress, deliberately. The two callers print different
// things — `run-all` a `▸` line and a duration, `run-subset` a `===` banner and a `✔` per
// written cell — and folding that into here would mean a style flag, i.e. presentation
// decided by a parameter. Failures are the exception: a `!!` line is diagnostic, not
// presentation, so it is emitted here in one canonical form.
import { existsSync } from "node:fs";

import { build, preview } from "vite";

import { resolveEngineVersion } from "./engine-versions.mjs";
import { measureInterleaved } from "./measure.mjs";
import { envStamp } from "./provenance.mjs";
import { appRoot, runsFor, SCENARIOS } from "./scenarios-registry.mjs";
import { writeCell } from "./write-cell.mjs";

/**
 * @param {object} options
 * @param {string} options.here            cross-router root (the dir holding results/ and apps/)
 * @param {string} options.framework       cohort name
 * @param {string} options.scenarioName    key in SCENARIOS
 * @param {string[]} options.engineList    engines to interleave (already KNOWN_NA-filtered)
 * @param {number} options.baseRuns        the run's base n; runsFor() applies the sweep policy
 * @param {object} options.provenance      from freshnessGateAndProvenance()
 * @param {boolean} [options.persist]      false = BENCH_SMOKE: measure, write nothing, count ok
 * @param {(info: {engines: string[], effRuns: number}) => void} [options.onReady]
 *        called after every app is built and served, BEFORE the measurement starts — the
 *        measurement is the slow part, so a caller that logs afterwards logs too late.
 * @returns {Promise<{ok: number, failed: number, effRuns: number, written: string[]}>}
 */
export async function runScenarioCells({
  here,
  framework,
  scenarioName,
  engineList,
  baseRuns,
  provenance,
  persist = true,
  onReady,
}) {
  const scenario = SCENARIOS[scenarioName];
  // Sweep scenarios run at max(50, base/2) — see runsFor in scenarios-registry.mjs.
  const effRuns = runsFor(scenarioName, baseRuns);
  const apps = [];
  const servers = [];
  let ok = 0;
  let failed = 0;
  const written = [];

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
      const server = await preview({ root, configFile, preview: { port: 0 }, logLevel: "warn" });
      servers.push(server);
      apps.push({ engine, baseURL: server.resolvedUrls.local[0] });
    } catch (error) {
      failed += 1;
      console.error(`!! build/serve failed: ${framework}·${scenarioName}×${engine}: ${error.message}`);
    }
  }
  if (apps.length === 0) return { ok, failed, effRuns, written };

  onReady?.({ engines: apps.map((a) => a.engine), effRuns });

  let results;
  try {
    results = await measureInterleaved({ apps, scenario, runs: effRuns });
  } catch (error) {
    failed += apps.length;
    console.error(`!! measure failed: ${framework}·${scenarioName}: ${error.message}`);
    return { ok, failed, effRuns, written };
  } finally {
    await Promise.all(servers.map((s) => s.close()));
  }

  for (const { engine } of apps) {
    if (!results[engine]) {
      failed += 1; // dropped mid-interleave (threw)
      continue;
    }
    if (!persist) {
      ok += 1; // measured + drove — the smoke's only question; nothing persisted
      continue;
    }
    const out = {
      scenario: scenarioName,
      engine,
      framework,
      ...results[engine],
      version: resolveEngineVersion(appRoot(here, framework, engine, scenarioName), framework, engine),
      env: envStamp(provenance),
    };
    if (writeCell(`${here}/results`, out, effRuns)) {
      ok += 1;
      written.push(engine);
    } else {
      // Measured but NOT persisted (smoke-grade or n-downgrade refusal) — for matrix
      // purposes that cell is missing, so it must redden the run, not vanish silently
      // into a green exit (audit 07-18 K13).
      failed += 1;
      console.error(`!! cell not persisted: ${framework}·${scenarioName}×${engine} (writeCell refused)`);
    }
  }
  return { ok, failed, effRuns, written };
}
