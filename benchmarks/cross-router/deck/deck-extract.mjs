import { readFileSync, existsSync, writeFileSync } from "node:fs";

import { isKnownNA } from "../harness/known-na.mjs";

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
    return m[key] ? { v: m[key].median, rme: m[key].rme ?? null } : null;
  };
}
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const val = (x) => (x == null ? null : r3(x.v));
// class + ratio vs FASTEST rival (lower=better for all metrics).
// Margin rule (audit 07-18 K7): a g/r class must also hold at each side's ~95% CI
// edges (median ± rme%) — the bare point thresholds sat inside session drift, so a
// committed borderline plate (svelte/param-nav r@1.19) flipped class on a re-extract
// of the SAME reference. Isolated-matcher values carry no rme (rme:null → 0-width CI)
// and keep plain thresholds. `quantum`: quantized metrics (mountMs — a 0.05 ms grid)
// additionally need |Δ| > 1 quantum — a one-quantum gap is measurement grid, not a
// verdict (the committed vue link-build@8 flip was exactly one quantum).
function verdict(rr, comps, quantum = 0) {
  const rivals = comps.filter((c) => c != null);
  if (rr == null || !rivals.length) return null;
  const best = rivals.reduce((a, b) => (b.v < a.v ? b : a));
  const g = best.v / rr.v; // >1 => rr faster
  const lo = (x) => x.v * (1 - (x.rme ?? 0) / 100);
  const hi = (x) => x.v * (1 + (x.rme ?? 0) / 100);
  const quantOk = quantum <= 0 || Math.abs(best.v - rr.v) > quantum;
  if (g >= 1.12 && lo(best) / hi(rr) >= 1.12 && quantOk)
    return ["g", Math.round(g * 100) / 100];
  if (g <= 0.88 && hi(best) / lo(rr) <= 0.88 && quantOk)
    return ["r", Math.round((rr.v / best.v) * 100) / 100];
  return ["y", 1];
}

const DATA = {}, GRID = {}, SWEEP = {};
for (const [co, engines] of Object.entries(ENG)) {
  DATA[co] = {}; GRID[co] = {}; SWEEP[co] = {};
  const rivals = engines.slice(1);
  for (const [sc, [metric, kind, pts, dir]] of Object.entries(SCEN)) {
    const get = cell(co, dir ?? sc);
    if (kind === "bar") {
      const e = engines.map((eng) => [eng, val(get(eng, metric))]);
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
            return iso[eng] && k != null ? { v: r3(iso[eng][k]), rme: null } : null;
          }
        : (eng, i) => {
            const c = get(eng, `${metric}@${pts[i]}`);
            return c == null ? null : { v: r3(c.v), rme: c.rme };
          };
      const s = engines.map((eng) => [eng, pts.map((_, i) => val(sVal(eng, i)))]);
      DATA[co][sc] = s;
      const quantum = metric === "mountMs" ? 0.05 : 0; // K7 quantization guard
      // board GRID = verdict at endpoint (last point)
      const li = pts.length - 1;
      const v = verdict(sVal("real-router", li), rivals.map((eng) => sVal(eng, li)), quantum);
      if (v) GRID[co][sc] = [v[1], v[0]]; // board GRID = [ratio, class]
      // board SWEEP = per-point verdict (diverging bars). A point with no comparable
      // data (rr or ALL rivals missing — skipped/failed point, KNOWN_NA cell) is null,
      // rendered as an explicit gap — NOT a fabricated ["y",1] tie (audit 07-18 K14).
      SWEEP[co][sc] = pts.map((_, i) => {
        const pv = verdict(sVal("real-router", i), rivals.map((eng) => sVal(eng, i)), quantum);
        return pv ? [pv[0], pv[1]] : null;
      });
    }
  }
}
// O-10б: machine/provenance stamp — env of the first cell that carries it. Base cells written
// before O-10 lack cpu/runner → "unknown" fallback, so a rebuild on an old base renders a header
// instead of crashing/lying. build-deck renders it in the deck header; ci-summary prints the same.
let META = { cpu: "unknown", runner: "unknown", commit: "unknown", date: "unknown", runs: "unknown" };
// Prefer the first cell that actually CARRIES the machine fields (cpu): pre-O-10 cells
// have a date-only env, and taking the first EXISTING file let one such cell blank the
// whole stamp even when stamped cells exist (audit 07-18 K15 — the loop now does what
// its comment always promised). Falls back to the first existing cell's partial env.
let fallback = null;
outer: for (const [co, engines] of Object.entries(ENG)) {
  for (const sc of Object.keys(SCEN)) {
    for (const eng of engines) {
      const f = `${ROOT}/${co}/${sc}/${eng}.json`;
      if (!existsSync(f)) continue;
      const c = JSON.parse(readFileSync(f, "utf8")), e = c.env ?? {};
      const stamp = { cpu: e.cpu ?? "unknown", runner: e.runner ?? "unknown", commit: e.commit ?? "unknown", date: e.date ?? "unknown", runs: c.runs ?? "unknown" };
      if (e.cpu) { META = stamp; break outer; }
      fallback ??= stamp;
    }
  }
}
if (META.cpu === "unknown" && fallback) META = fallback;

// Completeness marker (audit 07-18 K13): physical result cells present vs the full
// ENG×scenario grid (KNOWN_NA excluded; the gc-per-nav alias card and _baseline cells
// are not physical matrix cells). A partial snapshot then renders as "matrix N/M" in
// ci-summary instead of masquerading as a complete run.
let cellsWritten = 0, cellsExpected = 0;
const epochCommits = new Set();
let minDate = null, maxDate = null;
let minRuns = null, maxRuns = null;
for (const [co, engines] of Object.entries(ENG)) {
  for (const [sc, [, , , dir]] of Object.entries(SCEN)) {
    if (dir) continue; // alias card — reads another scenario's files
    for (const eng of engines) {
      if (isKnownNA(co, sc, eng)) continue;
      cellsExpected += 1;
      const f = `${ROOT}/${co}/${sc}/${eng}.json`;
      if (!existsSync(f)) continue;
      cellsWritten += 1;
      const cellJson = JSON.parse(readFileSync(f, "utf8"));
      const env = cellJson.env ?? {};
      if (Number.isFinite(cellJson.runs)) {
        minRuns = minRuns == null ? cellJson.runs : Math.min(minRuns, cellJson.runs);
        maxRuns = maxRuns == null ? cellJson.runs : Math.max(maxRuns, cellJson.runs);
      }
      if (env.commit && env.commit !== "unknown") epochCommits.add(env.commit);
      if (env.date) {
        if (!minDate || env.date < minDate) minDate = env.date;
        if (!maxDate || env.date > maxDate) maxDate = env.date;
      }
    }
  }
}
META.cells = { written: cellsWritten, expected: cellsExpected };
// Per-scenario N policy (2026-07-19): sweeps persist at max(50, base/2), so one honest
// snapshot legitimately mixes runs — stamp the RANGE across physical cells, not the
// first cell's value (which would label a 50/100 matrix "n=100").
if (minRuns != null) META.runs = minRuns === maxRuns ? minRuns : `${minRuns}–${maxRuns}`;

// Same-session discipline (audit 07-18 K7 регламент): the deck must be rebuilt from
// ONE session's final results — the committed deck once shipped cells finalized AFTER
// its own build, and borderline plates flipped on the next honest extract. Mechanical
// check: one commit epoch, one time window. Warn by default; DECK_REQUIRE_SAME_EPOCH=1
// hardens it to a refusal (for CI / release rebuilds).
// Span bound 12h, NOT 6h: one honest same-session n=100 matrix runs ~6–6.5h on the CI
// VPS (cells are stamped at write time, first cohort → last), so a 6h bound would
// wolf-cry on every full CI run. Commit-mix stays the primary mixed-epoch signal.
const spanH = minDate && maxDate ? (new Date(maxDate) - new Date(minDate)) / 3.6e6 : 0;
if (epochCommits.size > 1 || spanH > 12) {
  const msg = `deck-extract: snapshot mixes epochs — commits [${[...epochCommits].join(", ")}], time span ${spanH.toFixed(1)}h (audit 07-18 K7: rebuild the deck from ONE session's final results).`;
  if (process.env.DECK_REQUIRE_SAME_EPOCH === "1") {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.warn(`⚠ ${msg}`);
}

// Epoch coherence of instrument №2 (audit 07-18 K12): the wide/deep cards read
// matcher-bench/results.json — if its dist epoch differs from the browser cells',
// the deck would hang ONE stamp over two epochs. Warn loudly; stamp what we know.
const mEnv = MATCHER.env ?? null;
META.matcher = mEnv ? { commit: mEnv.commit ?? "unknown", date: mEnv.date ?? "unknown" } : null;
if (!mEnv)
  console.warn("⚠ matcher-bench/results.json carries no env stamp (pre-K12 epoch) — its wide/deep curves are undatable; re-run matcher-bench.");
else if (mEnv.commit && META.commit !== "unknown" && mEnv.commit !== META.commit)
  console.warn(`⚠ matcher-bench results epoch (${mEnv.commit}) ≠ browser cells epoch (${META.commit}) — wide/deep cards would mix epochs under one stamp; re-run matcher-bench (audit 07-18 K12/G1o).`);

writeFileSync(`${HERE}/deck-data.json`, JSON.stringify({ META, DATA, GRID, SWEEP }, null, 0));
// quick sanity print
console.log("react active-links (sweep):", JSON.stringify(DATA.react["active-links"]));
console.log("react GRID:", JSON.stringify(GRID.react));
console.log("solid active-links SWEEP:", JSON.stringify(SWEEP.solid["active-links"]));
console.log("wrote deck-data.json");
