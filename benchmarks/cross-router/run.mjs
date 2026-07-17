#!/usr/bin/env node
// cross-router runner: build app (Vite prod) → serve (vite preview) → run a
// scenario K times → write results/<framework>/<scenario>/<engine>.json.
//   node cross-router/run.mjs <scenario> <engine> [framework=react] [runs]
// Path-convention: app at apps/<framework>/<engine>/, scenario in scenarios/.
import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { measure } from "./harness/measure.mjs";
import { freshnessGateAndProvenance } from "./harness/provenance.mjs";
import { appRoot, SCENARIOS } from "./harness/scenarios-registry.mjs";
import { writeCell } from "./harness/write-cell.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function fail(message) {
  console.error(`run.mjs: ${message}`);
  console.error(
    "Usage: node cross-router/run.mjs <scenario> <engine> [framework=react] [runs]",
  );
  console.error(`  scenarios: ${Object.keys(SCENARIOS).join(" | ")}`);
  process.exit(1);
}

const [scenarioName, engine, framework = "react", runsArg] =
  process.argv.slice(2);
const runs = Number(runsArg) || 30;

const scenario = SCENARIOS[scenarioName];
if (!scenario) fail(`unknown scenario: ${scenarioName ?? "(none)"}`);
if (!engine) fail("missing <engine>");

const root = appRoot(here, framework, engine, scenarioName);
const configFile = `${root}/vite.config.ts`;
if (!existsSync(configFile)) {
  fail(`no app at ${root} (missing vite.config.ts)`);
}

// Pre-flight: refuse a stale dist + capture provenance (#1459) before wasting a build.
const provenance = freshnessGateAndProvenance(here);

await build({ root, configFile, logLevel: "warn" });

const server = await preview({
  root,
  configFile,
  preview: { port: 0 },
  logLevel: "warn",
});
const baseURL = server.resolvedUrls.local[0];
console.error(`[run] ${engine} · ${scenarioName} @ ${baseURL} (runs=${runs})`);

const result = await measure({ baseURL, scenario, runs });
await server.close();

const out = {
  scenario: scenarioName,
  engine,
  framework,
  ...result,
  env: { date: new Date().toISOString(), cpu: cpus()[0]?.model ?? "unknown", runner: process.env.BENCH_RUNNER ?? "local", ...provenance },
};

console.log(JSON.stringify(out.metrics, null, 2));
writeCell(`${here}/results`, out, runs);
process.exit(0);
