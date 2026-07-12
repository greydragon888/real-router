// sanity-remeasure — post-cohort guard against MID-RUN load inflation (#1261).
// bench-cross-router.sh's machine-readiness gate checks load/thermal ONCE, before
// the run; load appearing mid-run silently inflates the load-sensitive sub-ms
// per-nav metrics while the stable classes (matcher sweeps, heap, alloc) hold —
// and the RME gate cannot catch it, because a uniformly-inflated cell is
// internally consistent (2026-07-05 incident: nav-latency real-router read
// 0.98 ms in a gated n=30 run vs 0.67 ms on a same-session re-measure minutes
// later, ~47% inflation with RME green). This is the automated form of the manual
// diagnostic that caught it: re-measure ONE canonical sub-ms cell — nav-latency ×
// real-router — at small n WITHOUT touching results/, and compare medians against
// the value the matrix just wrote.
//   fresh ≪ recorded → the matrix ran under load that has since receded: every
//                      sub-ms per-nav absolute in this cohort is suspect.
//   fresh ≫ recorded → load (or heat) is present NOW: late-matrix sub-ms cells
//                      may be inflated and this comparison itself is tainted.
// Either direction flags. allocKBPerNav is printed as a control: allocation is a
// byte count, not a duration — if navMsWall shifted but alloc held, it was load,
// not a code change. Wire it after run-all in bench-cross-router.sh. Canary metric =
// `navMsWall` (the unified click→settle wall-clock, #1451/#1452): it is the MOST
// load-sensitive per-nav signal, so it is the sharpest load canary (the retired
// `totalMs` is gone — do NOT key on it, or this guard silently exit-2's on every run).
//
// Usage:
//   node cross-router/harness/sanity-remeasure.mjs <framework> [runs=12] [shift%=20]
// Exit: 0 = consistent · 1 = shifted (sub-ms class suspect) · 2 = skipped (no
//       recorded nav-latency cell / no app) — "cannot judge", not a failure.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build, preview } from "vite";

import { navLatency } from "../scenarios/nav-latency.mjs";
import { measure } from "./measure.mjs";

const CR = join(dirname(fileURLToPath(import.meta.url)), "..");

const argNum = (v, d) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
const framework = process.argv[2];
const runs = argNum(process.argv[3], 12);
const shiftLimit = argNum(process.argv[4], 20);

if (!framework) {
  console.error("Usage: node cross-router/harness/sanity-remeasure.mjs <framework> [runs=12] [shift%=20]");
  process.exit(2);
}

const recordedPath = join(CR, "results", framework, "nav-latency", "real-router.json");
if (!existsSync(recordedPath)) {
  console.error(`sanity-remeasure: no recorded result at ${recordedPath} — nothing to compare (run the matrix first).`);
  process.exit(2);
}
let recorded;
try {
  recorded = JSON.parse(readFileSync(recordedPath, "utf8"));
} catch {
  console.error(`sanity-remeasure: cannot parse ${recordedPath} — skipping.`);
  process.exit(2);
}
const recordedWall = recorded?.metrics?.navMsWall?.median;
if (typeof recordedWall !== "number" || recordedWall <= 0) {
  console.error("sanity-remeasure: recorded result has no navMsWall.median — skipping.");
  process.exit(2);
}

// nav-latency is a base scenario (no VARIANT subdir) — app at apps/<fw>/real-router/.
const root = join(CR, "apps", framework, "real-router");
const configFile = join(root, "vite.config.ts");
if (!existsSync(configFile)) {
  console.error(`sanity-remeasure: no app at ${root} — skipping.`);
  process.exit(2);
}

console.error(`[sanity] re-measuring nav-latency × real-router × ${framework} (runs=${runs}, results/ untouched)…`);
await build({ root, configFile, logLevel: "warn" });
const server = await preview({ root, configFile, preview: { port: 0 }, logLevel: "warn" });
let fresh;
try {
  fresh = await measure({ baseURL: server.resolvedUrls.local[0], scenario: navLatency, runs });
} finally {
  await server.close();
}

const freshWall = fresh.metrics.navMsWall.median;
// + = recorded higher than fresh (the matrix was the inflated one).
const shift = ((recordedWall - freshWall) / recordedWall) * 100;

console.log(
  `sanity-remeasure — nav-latency × real-router × ${framework}: recorded (n=${recorded.metrics.navMsWall.n}) vs fresh (n=${fresh.metrics.navMsWall.n}) · flag |shift| > ${shiftLimit}%\n`,
);
console.log("| metric | recorded | fresh | recorded−fresh |");
console.log("|---|---|---|---|");
for (const key of ["navMsWall", "navMsTask", "scriptDurationMs", "blinkMs", "allocKBPerNav"]) {
  const r = recorded.metrics?.[key]?.median;
  const f = fresh.metrics?.[key]?.median;
  if (typeof r !== "number" || typeof f !== "number") continue; // alloc absent in pre-07-05 results
  const d = r ? ((r - f) / r) * 100 : 0;
  console.log(`| ${key} | ${r.toFixed(3)} | ${f.toFixed(3)} | ${d >= 0 ? "+" : ""}${d.toFixed(1)}% |`);
}
console.log("");

if (Math.abs(shift) <= shiftLimit) {
  console.log(`✓ PASS — navMsWall medians agree within ${shiftLimit}% (shift ${shift >= 0 ? "+" : ""}${shift.toFixed(1)}%): no sign of mid-run load inflation.`);
  process.exit(0);
}
if (shift > 0) {
  console.log(`✗ FLAG — recorded navMsWall is ${shift.toFixed(1)}% above a fresh same-session re-measure.`);
  console.log("  The matrix likely ran under load that has since receded: treat this cohort's");
  console.log("  sub-ms per-nav absolutes (nav-latency / param-nav / active-links / nested-switch /");
  console.log("  per-nav script) as load-inflated. Stable classes (wide/deep sweeps, table-heap,");
  console.log("  link-build, alloc) are unaffected. Re-run the cohort for trustworthy sub-ms numbers.");
} else {
  console.log(`✗ FLAG — fresh navMsWall is ${(-shift).toFixed(1)}% above the recorded value.`);
  console.log("  Load (or heat) is present NOW: late-matrix sub-ms cells may be inflated and this");
  console.log("  comparison itself is tainted. Check the machine (pnpm cpu, thermal) and consider");
  console.log("  re-running the cohort.");
}
process.exit(1);
