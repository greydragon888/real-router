// sanity-remeasure — post-cohort guard against MID-RUN load inflation (#1261, #1461).
// bench-cross-router.sh's readiness gate checks load/thermal ONCE before the run; load
// appearing mid-run silently inflates the load-sensitive sub-ms per-nav metrics while
// the stable classes hold, and the RME gate can't catch it (a uniformly-inflated cell
// is internally consistent — 2026-07-05: nav-latency rr 0.98 ms gated-green vs 0.67 ms
// on a same-session re-measure, ~47% inflation). This re-measures nav-latency for EVERY
// engine of the cohort roster — INTERLEAVED, so all fresh cells share one load window —
// WITHOUT touching results/, then flags two ways:
//
//   • RATIO (primary, #1461): recorded(ref/engine) vs fresh(ref/engine). Load present
//     at RE-MEASURE time inflates both fresh cells equally → cancels in the ratio, so a
//     ratio shift means ONE recorded cell was inflated DURING the matrix (per-cell
//     asymmetry — a transient on one engine's window). Covers the whole roster; the old
//     guard re-measured only real-router × nav-latency (~9% of a cohort window), leaving
//     competitor cells (~67%) unchecked — a one-sided ratchet in rr's favor.
//   • ABSOLUTE uniform (retained #1261): if EVERY engine's fresh is same-sign-shifted
//     from recorded beyond the threshold, the whole matrix ran under load that has since
//     receded (fresh ≪ recorded) or load is present now (fresh ≫ recorded). Ratios are
//     preserved under uniform inflation, so this catches what the ratio can't.
//
// allocKBPerNav is a control: a byte count, not a duration — if navMsWall shifted but
// alloc held, it was load, not code. Canary metric = navMsWall (the most load-sensitive
// per-nav signal; the retired totalMs is gone — do NOT key on it).
//
// Usage: node cross-router/harness/sanity-remeasure.mjs <framework> [runs=12] [shift%=20]
// Exit: 0 = consistent · 1 = flagged (ratio and/or uniform) · 2 = cannot judge.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { navLatency } from "../scenarios/nav-latency.mjs";
import { measureInterleaved } from "./measure.mjs";

const CR = join(dirname(fileURLToPath(import.meta.url)), "..");
const argNum = (v, d) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
const framework = process.argv[2];
const runs = argNum(process.argv[3], 12);
const shiftLimit = argNum(process.argv[4], 20);
if (!framework) {
  console.error("Usage: node cross-router/harness/sanity-remeasure.mjs <framework> [runs=12] [shift%=20]");
  process.exit(2);
}

// Discover the roster from the recorded nav-latency cells (exclude _baseline).
const navDir = join(CR, "results", framework, "nav-latency");
if (!existsSync(navDir)) {
  console.error(`sanity-remeasure: no recorded results at ${navDir} — run the matrix first.`);
  process.exit(2);
}
const roster = [];
for (const file of readdirSync(navDir)) {
  if (!file.endsWith(".json") || file === "_baseline.json") continue;
  const engine = file.replace(/\.json$/, "");
  let cell;
  try {
    cell = JSON.parse(readFileSync(join(navDir, file), "utf8"));
  } catch {
    continue;
  }
  const recWall = cell?.metrics?.navMsWall?.median;
  const appDir = join(CR, "apps", framework, engine);
  if (typeof recWall === "number" && recWall > 0 && existsSync(join(appDir, "vite.config.ts"))) {
    roster.push({ engine, recorded: cell.metrics, appDir });
  }
}
if (roster.length === 0) {
  console.error("sanity-remeasure: no roster cell has navMsWall + a buildable app — cannot judge.");
  process.exit(2);
}
const refEngine = roster.some((r) => r.engine === "real-router") ? "real-router" : roster[0].engine;

// Re-measure nav-latency for the whole roster INTERLEAVED (one shared load window →
// the ratio truly cancels re-measure-time load). results/ untouched.
console.error(`[sanity] re-measuring nav-latency × [${roster.map((r) => r.engine).join(", ")}] × ${framework} interleaved (runs=${runs})…`);
const servers = [];
const apps = [];
for (const r of roster) {
  const configFile = join(r.appDir, "vite.config.ts");
  await build({ root: r.appDir, configFile, logLevel: "warn" });
  const server = await preview({ root: r.appDir, configFile, preview: { port: 0 }, logLevel: "warn" });
  servers.push(server);
  apps.push({ engine: r.engine, baseURL: server.resolvedUrls.local[0] });
}
let freshResults;
try {
  freshResults = await measureInterleaved({ apps, scenario: navLatency, runs });
} finally {
  await Promise.all(servers.map((s) => s.close()));
}
for (const r of roster) r.fresh = freshResults[r.engine]?.metrics;
const measured = roster.filter((r) => r.fresh?.navMsWall?.median > 0);
if (measured.length === 0) {
  console.error("sanity-remeasure: every re-measure failed — cannot judge.");
  process.exit(2);
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const wall = (m) => m?.navMsWall?.median;
const pct = (a, b) => ((a - b) / a) * 100;
const sgn = (x) => (x >= 0 ? "+" : "");

// Per-engine absolute shift (informational + uniform-load detector).
console.log(`\nsanity-remeasure — nav-latency × [${measured.map((r) => r.engine).join(", ")}] × ${framework} (runs=${runs}, results/ untouched) · flag |shift| > ${shiftLimit}%\n`);
console.log("Per-engine navMsWall (recorded vs fresh) — uniform same-sign shift ⇒ whole-matrix / re-measure load:");
console.log("| engine | recorded | fresh | shift% |");
console.log("|---|---|---|---|");
const absShifts = [];
for (const r of measured) {
  const s = pct(wall(r.recorded), wall(r.fresh));
  absShifts.push(s);
  console.log(`| ${r.engine} | ${wall(r.recorded).toFixed(3)} | ${wall(r.fresh).toFixed(3)} | ${sgn(s)}${s.toFixed(1)}% |`);
}
const uniform =
  measured.length >= 2 &&
  absShifts.every((s) => Math.sign(s) === Math.sign(absShifts[0])) &&
  median(absShifts.map(Math.abs)) > shiftLimit;

// Cross-engine RATIO (ref / engine) — robust to re-measure-time load.
const ref = measured.find((r) => r.engine === refEngine) ?? measured[0];
let ratioFlag = false;
if (measured.length >= 2) {
  console.log(`\nCross-engine ratio (${ref.engine} / competitor) — robust to re-measure load, catches per-cell inflation:`);
  console.log("| pair | recorded | fresh | ratio-shift% |");
  console.log("|---|---|---|---|");
  for (const r of measured) {
    if (r === ref) continue;
    const recR = wall(ref.recorded) / wall(r.recorded);
    const freshR = wall(ref.fresh) / wall(r.fresh);
    const s = pct(recR, freshR);
    if (Math.abs(s) > shiftLimit) ratioFlag = true;
    console.log(`| ${ref.engine}/${r.engine} | ${recR.toFixed(3)} | ${freshR.toFixed(3)} | ${sgn(s)}${s.toFixed(1)}% |`);
  }
}

// alloc control (bytes, load-stable) — if navMsWall shifted but alloc held, it was load.
const ra = ref.recorded?.allocKBPerNav?.median;
const fa = ref.fresh?.allocKBPerNav?.median;
if (typeof ra === "number" && typeof fa === "number") {
  console.log(`\nalloc control (${ref.engine} allocKBPerNav, bytes/load-stable): recorded ${ra.toFixed(2)} vs fresh ${fa.toFixed(2)} (${sgn(pct(ra, fa))}${pct(ra, fa).toFixed(1)}%)`);
}

console.log("");
if (!uniform && !ratioFlag) {
  console.log(`✓ PASS — no ${ref.engine}/competitor ratio shift > ${shiftLimit}% and no uniform same-sign drift: no sign of mid-run load inflation across the roster.`);
  process.exit(0);
}
if (ratioFlag) {
  console.log(`✗ FLAG (ratio) — a recorded ${ref.engine}/competitor ratio shifted > ${shiftLimit}% vs a fresh interleaved re-measure: one engine's matrix cell was likely load-tainted (per-cell inflation the RME gate can't see). Re-run this cohort.`);
}
if (uniform) {
  const dir =
    absShifts[0] > 0
      ? "recorded ABOVE fresh — the matrix ran under load that has since receded"
      : "fresh ABOVE recorded — load is present NOW and this comparison is itself tainted";
  console.log(`✗ FLAG (uniform) — every engine shifted the same way (${dir}). Treat this cohort's sub-ms per-nav absolutes as load-affected; stable classes (sweeps, heap, alloc) are unaffected.`);
}
process.exit(1);
