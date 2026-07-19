// react-router-bug — isolated reproduction of the deep-route match blowup (#15249).
//
// FINDING: react-router's matchRoutes() cost for a URL scales with the size of the
// route SUBTREE BELOW the matched route — routes that are DEEPER than the URL and so
// cannot possibly match, but are re-checked anyway. Matching the identical URL
// /sec/l2/.../l90 costs ~2 ms in a 90-deep tree but ~22 ms in a 210-deep tree.
// Pure matcher cost — no React, no rendering, no browser.
//
// Upstream: https://github.com/remix-run/react-router/issues/15249
// Browser-measured chart (match + render, swept to depth 210):
//   https://claude.ai/code/artifact/58736d29-e694-4c20-9f0c-3469bbcb6c44
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { matchRoutes } from "react-router";

// Data-mode (amortized) matcher — what `createBrowserRouter` actually pays per nav:
// branches are flattened + ranked ONCE (in the router constructor), each navigation
// only scans them. The public `matchRoutes()` above re-runs that construct on EVERY
// call — 54–97 % of its per-call cost here (audit 2026-07-18) — so per-call figures
// overstate the steady-state cost, while the per-nav RESCAN below the match (the
// actual #15249 mechanism) survives amortization. No public prebuild API exists; the
// internals sit next to the package index (the same deep-import the isolated
// matcher-bench uses).
const req = createRequire(import.meta.url);
const { flattenAndRankRoutes, matchRoutesImpl } = await import(
  pathToFileURL(join(dirname(req.resolve("react-router")), "lib/router/utils.js")).href
);

// A straight chain of `treeDepth` nested routes: sec → l2 → l3 → … → l{treeDepth}.
// Each level has exactly one child, so the tree is a single deep path (no branching).
export function buildRoutes(treeDepth) {
  const build = (k) => {
    const route = { path: k === 1 ? "sec" : "l" + k };
    if (k < treeDepth) route.children = [build(k + 1)];
    return route;
  };
  return [build(1)];
}

// The URL that matches the route at depth D: /sec/l2/…/lD.
export function deepPath(D) {
  let p = "/sec";
  for (let k = 2; k <= D; k++) p += "/l" + k;
  return p;
}

// Median-ish ms for ONE matchRoutes(routes, url). Adaptive iteration count so a slow
// deep match (tens of ms each) doesn't run for minutes — budget ~`budgetMs` total.
export function matchCostMs(routes, url, budgetMs = 400) {
  for (let i = 0; i < 15; i++) matchRoutes(routes, url); // warm the JIT
  let t = process.hrtime.bigint();
  matchRoutes(routes, url);
  const estMs = Number(process.hrtime.bigint() - t) / 1e6;
  const K = Math.max(3, Math.min(1000, Math.round(budgetMs / Math.max(estMs, 0.01))));
  t = process.hrtime.bigint();
  for (let i = 0; i < K; i++) matchRoutes(routes, url);
  return Number(process.hrtime.bigint() - t) / K / 1e6;
}

// Median-ish ms for ONE Data-mode navigation match: branches prebuilt (excluded from
// timing, like the router constructor), the timed call only rescans — the honest
// steady-state per-nav cost. Frame any upstream absolute in THESE terms.
export function matchCostAmortizedMs(routes, url, budgetMs = 400) {
  const branches = flattenAndRankRoutes(routes); // once — the constructor's share
  const run = () => matchRoutesImpl(routes, url, "/", false, branches);
  for (let i = 0; i < 15; i++) run(); // warm the JIT
  let t = process.hrtime.bigint();
  run();
  const estMs = Number(process.hrtime.bigint() - t) / 1e6;
  const K = Math.max(3, Math.min(5000, Math.round(budgetMs / Math.max(estMs, 0.01))));
  t = process.hrtime.bigint();
  for (let i = 0; i < K; i++) run();
  return Number(process.hrtime.bigint() - t) / K / 1e6;
}
