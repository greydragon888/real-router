// matcher-bench runner — measures each cohort's isolated matchers (µs per match) across
// the WIDTH sweep (N_SWEEP) AND the DEPTH sweep (DEPTH_SWEEP), engines interleaved
// SAME-PROCESS for ratio-fairness. Writes one consolidated results.json the deck pipeline
// reads: `cohorts` = wide (matcher WIDTH), `deepCohorts` = deep (matcher DEPTH).
//
//   node --expose-gc run.mjs [cohort|all]     (default: all)
//
// Method: build every (engine,size) matcher once (construction excluded from timing);
// per timed loop, warm ~WARM_MS then run K iterations (K adaptive so total ≫ clock
// granularity), GC forced before the timed loop; median over REPS reps.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  COHORTS,
  DEEP_COHORTS,
  DEEP_HOLDOUTS,
  DEPTH_SWEEP,
  HOLDOUTS,
  N_SWEEP,
  loadEngine,
} from "./matchers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUDGET_MS = 80;
const WARM_MS = 25;
const REPS = 9;
const WARM_NS = BigInt(Math.round(WARM_MS * 1e6));

function timeOne(fn, minK = 1000) {
  let it = 0;
  const t0 = process.hrtime.bigint();
  let el = 0n;
  do {
    fn();
    if ((++it & 255) === 0) el = process.hrtime.bigint() - t0;
  } while (el < WARM_NS && it < 3_000_000);
  const est = Number(process.hrtime.bigint() - t0) / it;
  // K fills ~BUDGET_MS. Wide matches are sub-µs → K huge (floor never binds). Deep matches
  // are µs–ms → BUDGET/est is small, and the wide 1000 floor would over-run them ~100×
  // (react-router @90 re-matching is ms-scale); deep passes a low minK so it runs at budget.
  const K = Math.max(minK, Math.min(3_000_000, Math.round((BUDGET_MS * 1e6) / est)));
  if (global.gc) global.gc();
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < K; i++) fn();
  return Number(process.hrtime.bigint() - t1) / K / 1000; // µs per match
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Load each engine once; reuse the same loaded matcher for both wide and deep sweeps.
const loadedCache = {};
const getLoaded = async (id) => (loadedCache[id] ??= await loadEngine(id));

// Generic sweep: build every (engine, size) matcher via buildMethod ("build" | "buildDeep"),
// gate correctness, time interleaved (engines round-robin per size), return {id: [µs per size]}.
async function runSweep(ids, sweep, buildMethod) {
  const loaded = {};
  for (const id of ids) loaded[id] = await getLoaded(id);

  const built = {};
  for (const id of ids) for (const n of sweep) built[`${id}@${n}`] = loaded[id][buildMethod](n);

  // correctness gate — every matcher must hit its target
  for (const id of ids) {
    for (const n of sweep) {
      if (!loaded[id].check(built[`${id}@${n}`]())) {
        throw new Error(`${id}@${n} (${buildMethod}) returned empty match`);
      }
    }
  }

  // deep matches are µs–ms (nested walk / re-matching); the wide sub-µs floor would over-run.
  const minK = buildMethod === "buildDeep" ? 30 : 1000;
  const samples = {};
  for (let r = 0; r < REPS; r++) {
    for (const n of sweep) {
      for (const id of ids)
        (samples[`${id}@${n}`] ??= []).push(timeOne(built[`${id}@${n}`], minK));
    }
  }

  const engines = {};
  for (const id of ids) engines[id] = sweep.map((n) => median(samples[`${id}@${n}`]));
  return engines;
}

function printCohort(label, cohort, engines, holdouts, started) {
  process.stderr.write(`▸ ${label} ${cohort} …\n`);
  for (const id of Object.keys(engines)) {
    const r = engines[id];
    process.stderr.write(
      `   ${id.padEnd(14)} ${r[0].toFixed(2).padStart(7)} → ${r.at(-1).toFixed(2).padStart(8)} µs   ${(r.at(-1) / r[0]).toFixed(0).padStart(4)}×\n`,
    );
  }
  for (const h of holdouts) {
    process.stderr.write(`   ${h.id.padEnd(14)} (holdout, ${h.class})\n`);
  }
  process.stderr.write(`   · ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

const arg = process.argv[2] || "all";
const wideCohorts = arg === "all" ? Object.keys(COHORTS) : [arg];
const deepCohorts =
  arg === "all" ? Object.keys(DEEP_COHORTS) : [arg].filter((c) => DEEP_COHORTS[c]);

const out = {
  N_SWEEP,
  DEPTH_SWEEP,
  meta: {
    unit: "us-per-match",
    budgetMs: BUDGET_MS,
    warmMs: WARM_MS,
    reps: REPS,
    wideTarget: "worst-case last route in an exactly-N-route flat table",
    deepTarget: "match /deep/l1/../lD in a single 90-level nested chain (deep-spec)",
    note: "isolated matcher, pure Node — no browser/render. tanstack = @tanstack/router-core (shared across framework packages).",
  },
  cohorts: {},
  deepCohorts: {},
};

// WIDTH sweep
for (const c of wideCohorts) {
  const started = Date.now();
  const engines = await runSweep(COHORTS[c], N_SWEEP, "build");
  out.cohorts[c] = { engines, holdouts: HOLDOUTS[c] || [] };
  printCohort("wide", c, engines, out.cohorts[c].holdouts, started);
}

// DEPTH sweep — only cohorts with verified nested matchers; others keep their browser verdict.
for (const c of deepCohorts) {
  const started = Date.now();
  const engines = await runSweep(DEEP_COHORTS[c], DEPTH_SWEEP, "buildDeep");
  out.deepCohorts[c] = { engines, holdouts: DEEP_HOLDOUTS[c] || [] };
  printCohort("deep", c, engines, out.deepCohorts[c].holdouts, started);
}

const outPath = path.join(HERE, "results.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
process.stderr.write(`\n✓ wrote ${path.relative(process.cwd(), outPath)}\n`);
