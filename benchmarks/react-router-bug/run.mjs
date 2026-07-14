// Runs the react-router-bug scenario two ways and prints the tables + writes results.json.
//   node run.mjs
// Uses the workspace react-router@8 (or standalone: npm i react-router@8 && node run.mjs).
import { writeFileSync } from "node:fs";

import { buildRoutes, deepPath, matchCostMs } from "./scenario.mjs";

// (1) SMOKING GUN — the SAME URL depth, matched in trees of increasing total depth.
// If the cost at a fixed depth rises with tree depth, the matcher is re-checking routes
// BELOW the match (which can't match) — that's #15249.
const TREES = [90, 150, 210];
const FIXED = [30, 60, 90];
const smokingGun = {};
console.log("matchRoutes cost (ms) — same URL, deeper tree (no browser, no render):\n");
console.log("  tree \\ URL-depth" + FIXED.map((d) => ("l" + d).padStart(10)).join(""));
for (const treeDepth of TREES) {
  const routes = buildRoutes(treeDepth);
  const row = FIXED.map((D) => matchCostMs(routes, deepPath(D)));
  smokingGun[treeDepth] = Object.fromEntries(FIXED.map((D, i) => [D, +row[i].toFixed(3)]));
  console.log("  " + (treeDepth + "-deep").padEnd(15) + row.map((v) => (v.toFixed(2) + " ms").padStart(10)).join(""));
}
const g = (t, d) => smokingGun[t][d];
console.log(`\n  → /sec/…/l90 is ${(g(210, 90) / g(90, 90)).toFixed(1)}× slower in a 210-deep tree than a 90-deep one — same URL.`);

// (2) PARABOLA — one fixed tree, swept across match depth. Cost rises then DROPS at the
// bottom (the deepest leaf has no deeper routes to re-check).
const TREE = 210;
const SWEEP = [3, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210];
const routes = buildRoutes(TREE);
const curve = SWEEP.map((D) => [D, +matchCostMs(routes, deepPath(D)).toFixed(3)]);
const peak = curve.reduce((a, b) => (b[1] > a[1] ? b : a));
console.log(`\nparabola in a ${TREE}-deep tree — peak at depth ${peak[0]} (${peak[1].toFixed(2)} ms), ~${Math.round((peak[0] / TREE) * 100)}% of the tree:\n`);
console.log("  " + curve.map(([d, v]) => `${d}:${v.toFixed(1)}`).join("  "));

writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify({ reactRouter: "8.x", smokingGun, parabola: { treeDepth: TREE, curve } }, null, 2));
console.log("\nwrote results.json");
