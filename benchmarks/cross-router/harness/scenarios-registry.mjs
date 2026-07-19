// Single registry of scenario objects + the big-route-table variant subdir each sweep
// resolves to. Shared by run.mjs (one cell) and run-all.mjs (interleaved matrix) so the
// two runners can never drift on which scenarios exist or which app a sweep builds.
import { activeLinks } from "../scenarios/active-links.mjs";
import { backForward } from "../scenarios/back-forward.mjs";
import { coldStart } from "../scenarios/cold-start.mjs";
import { deepConfig } from "../scenarios/deep-config.mjs";
import { linkBuild } from "../scenarios/link-build.mjs";
import { navChurn } from "../scenarios/nav-churn.mjs";
import { navLatency } from "../scenarios/nav-latency.mjs";
import { nestedSwitch } from "../scenarios/nested-switch.mjs";
import { paramNav } from "../scenarios/param-nav.mjs";
import { searchParamScaling } from "../scenarios/search-param-scaling.mjs";
import { tableHeap } from "../scenarios/table-heap.mjs";
import { wideConfig } from "../scenarios/wide-config.mjs";

export const SCENARIOS = {
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

// Per-cohort engine rosters — each cohort compares real-router against that framework's
// real competitors. ONE list shared by run-all.mjs and run-subset.mjs: a second drifted
// copy in a runner is exactly how the O-10 env-stamp regressed (audit 07-18 K15).
export const COHORT_ENGINES = {
  react: ["real-router", "tanstack", "react-router"],
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router", "mateo-router"],
  angular: ["real-router", "angular-router"],
};

// Big-route-table scenarios render against a variant subdir so base scenarios keep a
// small table (no cold-start ↔ table-size conflation).
export const VARIANT = {
  "wide-config": "wide",
  "deep-config": "deep",
  "search-param-scaling": "searchparams",
  "table-heap": "tableheap",
  "cold-start": "tableheap", // reuses the N-route/minimal-render app for a boot sweep
  "link-build": "linkbuild",
  "nested-switch": "nested",
  "active-links": "links",
};

// App root for a (framework, engine, scenario) — variant subdir when the scenario needs
// its own big-table app, else the base app.
export function appRoot(here, framework, engine, scenarioName) {
  const variant = VARIANT[scenarioName] ?? "";
  return variant
    ? `${here}/apps/${framework}/${engine}/${variant}`
    : `${here}/apps/${framework}/${engine}`;
}

// Per-scenario sample-count policy (2026-07-19): the six sweep scenarios run at HALF
// the matrix base N, floored at 50 and never above base. A sweep sample is an inner
// aggregate (nested/active: ΔTask over MEASURE_NAVS=20; link-build: N mounts), so its
// sample-to-sample variance undercuts the per-nav scenarios' — reference verdicts
// survive the cut with huge margin. Verified on real data BEFORE shipping (07-19):
//   · CI n=100 artifact + local n=50 reference re-verdicted at rme×√2 (the halving
//     law) → 0/65 GRID flips on both; only 2–4 borderline SWEEP points (ratio
//     1.2–1.33) soften g→y — a wobble those points already show between same-N runs
//     (bootstrap flip prob 0.6% at n=100, and the CI vs local borderline sets differ);
//   · real split-half replicas over raw n=100 streams (vue cohort): nested-switch
//     0/12 flips at n=50 and 0/24 at n=25; search flips confined to its known
//     borderline @256 endpoint; empirical RME follows the √2 law (×1.21–1.41).
// The 50 floor keeps every persisted cell reference-grade AND makes the policy a
// no-op for the local n=50 reference refresh (no write-cell n-downgrade conflicts);
// quick refreshes (base ≤ 50) pass through untouched. Bar scenarios keep base N —
// the all-halved counter-factual flipped a real GRID cell (vue/back-forward g1.21→y).
export const SWEEP_SCENARIOS = new Set([
  "wide-config",
  "deep-config",
  "search-param-scaling",
  "active-links",
  "link-build",
  "nested-switch",
]);

// Effective sample count for one scenario given the matrix base N. Shared by
// run-all.mjs and run-subset.mjs (run.mjs stays literal: an explicit single-cell n is
// the operator's A/B intent — but note a hand-written sweep cell ABOVE policy-n makes
// the next matrix run refuse the overwrite via the write-cell n-downgrade guard).
export function runsFor(scenarioName, baseRuns) {
  if (!SWEEP_SCENARIOS.has(scenarioName) || baseRuns <= 50) return baseRuns;
  return Math.max(50, Math.floor(baseRuns / 2));
}
