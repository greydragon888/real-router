#!/usr/bin/env node
// cross-router runner: build app (Vite prod) → serve (vite preview) → run a
// scenario K times → write results/<framework>/<scenario>/<engine>.json.
//   node cross-router/run.mjs <scenario> <engine> [framework=react] [runs]
// Path-convention: app at apps/<framework>/<engine>/, scenario in scenarios/.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { measure } from "./harness/measure.mjs";
import { activeLinks } from "./scenarios/active-links.mjs";
import { backForward } from "./scenarios/back-forward.mjs";
import { coldStart } from "./scenarios/cold-start.mjs";
import { deepConfig } from "./scenarios/deep-config.mjs";
import { linkBuild } from "./scenarios/link-build.mjs";
import { navChurn } from "./scenarios/nav-churn.mjs";
import { navLatency } from "./scenarios/nav-latency.mjs";
import { nestedSwitch } from "./scenarios/nested-switch.mjs";
import { paramNav } from "./scenarios/param-nav.mjs";
import { searchParamScaling } from "./scenarios/search-param-scaling.mjs";
import { tableHeap } from "./scenarios/table-heap.mjs";
import { wideConfig } from "./scenarios/wide-config.mjs";

const SCENARIOS = {
  "cold-start": coldStart,
  "nav-latency": navLatency,
  "param-nav": paramNav,
  "wide-config": wideConfig,
  "deep-config": deepConfig,
  "search-param-scaling": searchParamScaling,
  "table-heap": tableHeap,
  "nav-churn": navChurn,
  "active-links": activeLinks,
  "back-forward": backForward,
  "link-build": linkBuild,
  "nested-switch": nestedSwitch,
};

// Big-route-table scenarios render against a variant subdir so base scenarios
// keep a small table (no cold-start ↔ table-size conflation).
const VARIANT = {
  "wide-config": "wide",
  "deep-config": "deep",
  "search-param-scaling": "searchparams",
  "table-heap": "tableheap",
  "link-build": "linkbuild",
  "nested-switch": "nested",
  "active-links": "links",
};

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

const variant = VARIANT[scenarioName] ?? "";
const root = variant
  ? `${here}/apps/${framework}/${engine}/${variant}`
  : `${here}/apps/${framework}/${engine}`;
const configFile = `${root}/vite.config.ts`;
if (!existsSync(configFile)) {
  fail(`no app at ${root} (missing vite.config.ts)`);
}

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
  env: { date: new Date().toISOString() },
};

const outDir = `${here}/results/${framework}/${scenarioName}`;
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/${engine}.json`, `${JSON.stringify(out, null, 2)}\n`);

console.log(JSON.stringify(out.metrics, null, 2));
process.exit(0);
