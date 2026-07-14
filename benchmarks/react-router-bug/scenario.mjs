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
import { matchRoutes } from "react-router";

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
