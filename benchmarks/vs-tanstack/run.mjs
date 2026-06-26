#!/usr/bin/env node
/**
 * vs-tanstack benchmark runner.
 *
 * Usage (from the benchmarks/ workspace root):
 *   node vs-tanstack/run.mjs <scenario> <engine> <framework> <mode>
 *     scenario:  client-nav | ...        (directory under vs-tanstack/)
 *     engine:    real-router | tanstack
 *     framework: react | vue | solid
 *     mode:      build | speed | flame | memory
 *
 * Resolves everything by the path convention
 *   vs-tanstack/<scenario>/<engine>/<framework>/{vite.config.ts,speed.bench.ts,speed.flame.ts,speed.memory.ts}
 * so adding a scenario needs no new package.json scripts. Non-build modes rebuild
 * the app first. Invoke via `pnpm bench:vs-tanstack -- <args>` so node_modules/.bin
 * is on PATH.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ENGINES = ["real-router", "tanstack"];
const FRAMEWORKS = ["react", "vue", "solid"];
const MODES = ["build", "speed", "flame", "memory"];

const [scenario, engine, framework, mode] = process.argv.slice(2);

function fail(message) {
  console.error(`run.mjs: ${message}\n`);
  console.error(
    "Usage: node vs-tanstack/run.mjs <scenario> <engine> <framework> <mode>",
  );
  console.error(`  engine:    ${ENGINES.join(" | ")}`);
  console.error(`  framework: ${FRAMEWORKS.join(" | ")}`);
  console.error(`  mode:      ${MODES.join(" | ")}`);
  process.exit(1);
}

if (!scenario) fail("missing <scenario>");
if (!ENGINES.includes(engine)) fail(`invalid <engine>: ${engine ?? "(none)"}`);
if (!FRAMEWORKS.includes(framework)) {
  fail(`invalid <framework>: ${framework ?? "(none)"}`);
}
if (!MODES.includes(mode)) fail(`invalid <mode>: ${mode ?? "(none)"}`);

const base = `vs-tanstack/${scenario}/${engine}/${framework}`;
const viteConfig = `${base}/vite.config.ts`;

if (!existsSync(viteConfig)) {
  fail(`no vite.config.ts at ${base} — does that scenario/engine/framework exist?`);
}

function run(command, args, extraEnv = {}) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", ...extraEnv },
  });

  if (result.error) {
    console.error(`run.mjs: failed to spawn ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Every mode builds first; non-build modes then run their measurement step.
run("vite", ["build", "--config", viteConfig]);

if (mode === "speed") {
  run("vitest", ["bench", "--config", viteConfig, `${base}/speed.bench.ts`]);
} else if (mode === "flame") {
  run("npx", ["tsx", `${base}/speed.flame.ts`]);
} else if (mode === "memory") {
  run("npx", ["tsx", `${base}/speed.memory.ts`], { NODE_OPTIONS: "--expose-gc" });
}
