// Runs the react-router-bug scenario two ways and prints the tables + writes results.json.
//   node run.mjs
// Uses the workspace react-router@8 (or standalone: npm i react-router@8 && node run.mjs).
import { writeFileSync } from "node:fs";

import { buildRoutes, deepPath, matchCostAmortizedMs, matchCostMs } from "./scenario.mjs";

// (1) SMOKING GUN — the SAME URL depth, matched in trees of increasing total depth.
// If the cost at a fixed depth rises with tree depth, the matcher is re-checking routes
// BELOW the match (which can't match) — that's #15249. Both matrices from ONE session:
//   A = public matchRoutes() (re-flattens per call — what a naive per-call bench times)
//   B = Data-mode amortized (branches prebuilt — what createBrowserRouter pays per nav)
// The finding must survive B; A's absolutes are construct-dominated (audit 2026-07-18).
const TREES = [90, 150, 210];
const FIXED = [30, 60, 90];
const matrix = (cost) => {
  const out = {};
  for (const treeDepth of TREES) {
    const routes = buildRoutes(treeDepth);
    out[treeDepth] = Object.fromEntries(FIXED.map((D) => [D, +cost(routes, deepPath(D)).toFixed(3)]));
  }
  return out;
};
const printMatrix = (label, m) => {
  console.log(`\n${label}\n`);
  console.log("  tree \\ URL-depth" + FIXED.map((d) => ("l" + d).padStart(10)).join(""));
  for (const treeDepth of TREES) {
    const row = FIXED.map((D) => m[treeDepth][D]);
    console.log("  " + (treeDepth + "-deep").padEnd(15) + row.map((v) => (v.toFixed(2) + " ms").padStart(10)).join(""));
  }
};
const smokingGun = matrix(matchCostMs);
printMatrix("A · public matchRoutes() per call (flatten+rank EVERY call) — ms:", smokingGun);
const smokingGunAmortized = matrix(matchCostAmortizedMs);
printMatrix("B · Data-mode amortized (branches prebuilt, scan only) — ms:", smokingGunAmortized);
const g = (m, t, d) => m[t][d];
console.log(
  `\n  → per-call: /sec/…/l90 is ${(g(smokingGun, 210, 90) / g(smokingGun, 90, 90)).toFixed(1)}× slower in a 210-deep tree than a 90-deep one.` +
    `\n  → amortized: the same comparison holds ${(g(smokingGunAmortized, 210, 90) / g(smokingGunAmortized, 90, 90)).toFixed(1)}× — the rescan below the match survives amortization (#15249 is real);` +
    `\n    construct share of the per-call @l90-in-210 figure: ${(100 * (1 - g(smokingGunAmortized, 210, 90) / g(smokingGun, 210, 90))).toFixed(0)}%.`,
);

// (2) PARABOLA — one fixed tree, swept across match depth. Cost rises then DROPS at the
// bottom (the deepest leaf has no deeper routes to re-check). Swept on BOTH variants —
// the shape must survive amortization (only the construct floor differs).
const TREE = 210;
const SWEEP = [3, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210];
const routes = buildRoutes(TREE);
const curve = SWEEP.map((D) => [D, +matchCostMs(routes, deepPath(D)).toFixed(3)]);
const curveAmortized = SWEEP.map((D) => [D, +matchCostAmortizedMs(routes, deepPath(D)).toFixed(3)]);
const peakOf = (c) => c.reduce((a, b) => (b[1] > a[1] ? b : a));
const peak = peakOf(curve);
const peakB = peakOf(curveAmortized);
console.log(`\nparabola in a ${TREE}-deep tree — per-call peak at depth ${peak[0]} (${peak[1].toFixed(2)} ms), amortized peak at depth ${peakB[0]} (${peakB[1].toFixed(2)} ms, ~${Math.round((peakB[0] / TREE) * 100)}% of the tree):\n`);
console.log("  per-call:  " + curve.map(([d, v]) => `${d}:${v.toFixed(1)}`).join("  "));
console.log("  amortized: " + curveAmortized.map(([d, v]) => `${d}:${v.toFixed(1)}`).join("  "));

writeFileSync(
  new URL("./results.json", import.meta.url),
  JSON.stringify(
    { reactRouter: "8.x", smokingGun, smokingGunAmortized, parabola: { treeDepth: TREE, curve, curveAmortized } },
    null,
    2,
  ),
);
console.log("\nwrote results.json");
