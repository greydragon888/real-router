#!/usr/bin/env node
/**
 * Build every bundle-size fixture (framework baselines + all engine/framework/
 * variant app fixtures) with Vite, then hand off to measure.mjs. Run from the
 * benchmarks/ workspace root (via `pnpm bench:bundle-size`).
 */
import { execFileSync } from "node:child_process";

const ENGINES = ["real-router", "tanstack"];
const FRAMEWORKS = ["react", "vue", "solid"];
const VARIANTS = ["minimal", "full"];
const ROOT = "vs-tanstack/bundle-size";

const dirs = FRAMEWORKS.map((framework) => `${ROOT}/_baseline/${framework}`);

for (const engine of ENGINES) {
  for (const framework of FRAMEWORKS) {
    for (const variant of VARIANTS) {
      dirs.push(`${ROOT}/${engine}/${framework}/${variant}`);
    }
  }
}

for (const dir of dirs) {
  process.stdout.write(`building ${dir} ... `);
  execFileSync("npx", ["vite", "build", "--config", `${dir}/vite.config.ts`], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  console.log("ok");
}

console.log("");
execFileSync("node", [`${ROOT}/measure.mjs`], { stdio: "inherit" });
