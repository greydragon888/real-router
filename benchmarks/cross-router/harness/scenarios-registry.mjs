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
