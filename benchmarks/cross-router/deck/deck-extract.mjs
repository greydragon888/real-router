import { readFileSync, existsSync, writeFileSync } from "node:fs";
const HERE = import.meta.dirname;
const ROOT = `${HERE}/../results`;
// Isolated-matcher microbench (pure Node) — the honest instrument for wide-config's
// "matcher scaling" claim. Browser navMsTask buries the sub-ms matcher in render/settle
// noise (waves); the isolated µs curve is clean O(1)-flat vs O(N)-rising. Used for every
// cohort EXCEPT angular, whose competitor can't be isolated headless (angular keeps the
// browser card — its matcher is expensive enough to read cleanly there anyway).
const MATCHER = JSON.parse(
  readFileSync(
    `${HERE}/../matcher-bench/results.json`,
    "utf8",
  ),
);
const ENG = {
  react: ["real-router", "react-router", "tanstack"],
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router", "mateo-router"],
  angular: ["real-router", "angular-router"],
};
// scenario: [metric, kind, pointsOrNull, resultsDirOverride?]. bars: points=null (single),
// sweeps: points array. The optional 4th element points the reader at a DIFFERENT results
// dir than the card key — used by gc-per-nav (a second card off the search-param-scaling
// results: its allocKBPerNav bar, the memory counterpart to the navMsTask CPU sweep).
const SCEN = {
  "nav-latency": ["navMsWall", "bar", null],
  "param-nav": ["navMsWall", "bar", null],
  "back-forward": ["navMsWall", "bar", null],
  "nav-churn": ["heapDeltaKB", "bar", null],
  "gc-per-nav": ["allocKBPerNav", "bar", null, "search-param-scaling"],
  "active-links": ["navMsTask", "sweep", [4, 8, 16, 32, 64, 128, 256]],
  "nested-switch": ["navMsTask", "sweep", [1, 2, 4, 8, 16, 32]],
  "link-build": ["mountMs", "sweep", [4, 8, 16, 32, 64, 128, 256]],
  "cold-start": ["scriptDurationMs@10", "bar", null],
  "wide-config": ["navMsTask", "sweep", [4, 16, 64, 256]],
  "deep-config": ["navMsTask", "sweep", [3, 30, 60, 90]],
  "search-param-scaling": ["navMsTask", "sweep", [1, 2, 4, 8, 16, 32, 64, 128, 256]],
  "table-heap": ["jsHeapMB@100", "bar", null],
};
function cell(co, sc) {
  const p = `${ROOT}/${co}/${sc}`;
  return (eng, key) => {
    const f = `${p}/${eng}.json`;
    if (!existsSync(f)) return null;
    const m = JSON.parse(readFileSync(f, "utf8")).metrics;
    return m[key] ? m[key].median : null;
  };
}
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
// class + ratio vs fastest rival (lower=better for all metrics)
function verdict(rr, comps) {
  const rivals = comps.filter((v) => v != null);
  if (rr == null || !rivals.length) return null;
  const best = Math.min(...rivals);
  const g = best / rr; // >1 => rr faster
  if (g >= 1.12) return ["g", Math.round(g * 100) / 100];
  if (g <= 0.88) return ["r", Math.round((rr / best) * 100) / 100];
  return ["y", 1];
}

const DATA = {}, GRID = {}, SWEEP = {};
for (const [co, engines] of Object.entries(ENG)) {
  DATA[co] = {}; GRID[co] = {}; SWEEP[co] = {};
  const rivals = engines.slice(1);
  for (const [sc, [metric, kind, pts, dir]] of Object.entries(SCEN)) {
    const get = cell(co, dir ?? sc);
    if (kind === "bar") {
      const e = engines.map((eng) => [eng, r3(get(eng, metric))]);
      DATA[co][sc] = e;
      const v = verdict(get("real-router", metric), rivals.map((eng) => get(eng, metric)));
      if (v) GRID[co][sc] = [v[1], v[0]]; // board GRID = [ratio, class]
    } else {
      // wide-config reads the isolated matcher (µs) for every cohort — angular included
      // now that its recognizer isolates (parse + defaultUrlMatcher). Its arrays are
      // indexed by the matcher-bench N_SWEEP, so map each deck point N → that index
      // (deck pts are a subset, e.g. [4,16,64,256] → matcher indices [0,2,4,6]).
      // deep-config now reads the isolated matcher too (deepCohorts) — but ONLY where the
      // cohort's competitor isolates: angular-router's recognizer is a deep holdout, so the
      // angular deep card falls back to the browser navMsTask (matcher+render). mateo (svelte)
      // is absent from the isolated data → renders null, same as its wide holdout.
      const deepIso = sc === "deep-config" ? MATCHER.deepCohorts?.[co]?.engines : null;
      const iso =
        sc === "wide-config"
          ? MATCHER.cohorts[co]?.engines
          : deepIso && deepIso[rivals[0]]
            ? deepIso
            : null;
      const isoSweep = sc === "deep-config" ? MATCHER.DEPTH_SWEEP : MATCHER.N_SWEEP;
      const mIdx = iso ? Object.fromEntries(isoSweep.map((n, k) => [n, k])) : null;
      const sVal = iso
        ? (eng, i) => {
            const k = mIdx[pts[i]];
            return iso[eng] && k != null ? r3(iso[eng][k]) : null;
          }
        : (eng, i) => r3(get(eng, `${metric}@${pts[i]}`));
      const s = engines.map((eng) => [eng, pts.map((_, i) => sVal(eng, i))]);
      DATA[co][sc] = s;
      // board GRID = verdict at endpoint (last point)
      const li = pts.length - 1;
      const v = verdict(sVal("real-router", li), rivals.map((eng) => sVal(eng, li)));
      if (v) GRID[co][sc] = [v[1], v[0]]; // board GRID = [ratio, class]
      // board SWEEP = per-point verdict (diverging bars)
      SWEEP[co][sc] = pts.map((_, i) => {
        const pv = verdict(sVal("real-router", i), rivals.map((eng) => sVal(eng, i)));
        return pv ? [pv[0], pv[1]] : ["y", 1];
      });
    }
  }
}
writeFileSync(`${HERE}/deck-data.json`, JSON.stringify({ DATA, GRID, SWEEP }, null, 0));
// quick sanity print
console.log("react active-links (sweep):", JSON.stringify(DATA.react["active-links"]));
console.log("react GRID:", JSON.stringify(GRID.react));
console.log("solid active-links SWEEP:", JSON.stringify(SWEEP.solid["active-links"]));
console.log("wrote deck-data.json");
