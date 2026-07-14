// matcher-bench runner — measures each cohort's isolated matchers (µs per match) across
// the WIDTH sweep, engines interleaved SAME-PROCESS for ratio-fairness. Writes a single
// consolidated results.json the deck pipeline can read.
//
//   node --expose-gc run.mjs [cohort|all]     (default: all)
//
// Method: build every (engine,N) matcher once (construction excluded from timing);
// per timed loop, warm ~WARM_MS then run K iterations (K adaptive so total ≫ clock
// granularity), GC forced before the timed loop; median over REPS reps.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { COHORTS, HOLDOUTS, N_SWEEP, loadEngine } from "./matchers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUDGET_MS = 80;
const WARM_MS = 25;
const REPS = 9;
const WARM_NS = BigInt(Math.round(WARM_MS * 1e6));

function timeOne(fn) {
  let it = 0;
  const t0 = process.hrtime.bigint();
  let el = 0n;
  do {
    fn();
    if ((++it & 255) === 0) el = process.hrtime.bigint() - t0;
  } while (el < WARM_NS && it < 3_000_000);
  const est = Number(process.hrtime.bigint() - t0) / it;
  const K = Math.max(1000, Math.min(3_000_000, Math.round((BUDGET_MS * 1e6) / est)));
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

async function runCohort(cohort) {
  const ids = COHORTS[cohort];
  const loaded = {};
  for (const id of ids) loaded[id] = await loadEngine(id);

  const built = {};
  for (const id of ids) for (const n of N_SWEEP) built[`${id}@${n}`] = loaded[id].build(n);

  // correctness gate — every matcher must hit its target
  for (const id of ids) {
    for (const n of N_SWEEP) {
      if (!loaded[id].check(built[`${id}@${n}`]())) {
        throw new Error(`${cohort}/${id}@${n} returned empty match`);
      }
    }
  }

  const samples = {};
  for (let r = 0; r < REPS; r++) {
    for (const n of N_SWEEP) {
      for (const id of ids) (samples[`${id}@${n}`] ??= []).push(timeOne(built[`${id}@${n}`]));
    }
  }

  const engines = {};
  for (const id of ids) engines[id] = N_SWEEP.map((n) => median(samples[`${id}@${n}`]));
  return { engines, holdouts: HOLDOUTS[cohort] || [] };
}

const arg = process.argv[2] || "all";
const cohorts = arg === "all" ? Object.keys(COHORTS) : [arg];
const out = {
  N_SWEEP,
  meta: {
    unit: "us-per-match",
    budgetMs: BUDGET_MS,
    warmMs: WARM_MS,
    reps: REPS,
    target: "worst-case last route in an exactly-N-route flat table",
    note: "isolated matcher, pure Node — no browser/render. tanstack = @tanstack/router-core (shared across framework packages).",
  },
  cohorts: {},
};

for (const c of cohorts) {
  process.stderr.write(`▸ ${c} …\n`);
  const started = Date.now();
  out.cohorts[c] = await runCohort(c);
  const e = out.cohorts[c].engines;
  for (const id of Object.keys(e)) {
    const r = e[id];
    process.stderr.write(
      `   ${id.padEnd(14)} ${r[0].toFixed(2).padStart(7)} → ${r.at(-1).toFixed(2).padStart(8)} µs   ${(r.at(-1) / r[0]).toFixed(0).padStart(4)}×\n`,
    );
  }
  for (const h of out.cohorts[c].holdouts) {
    process.stderr.write(`   ${h.id.padEnd(14)} (holdout, ${h.class})\n`);
  }
  process.stderr.write(`   · ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

const outPath = path.join(HERE, "results.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
process.stderr.write(`\n✓ wrote ${path.relative(process.cwd(), outPath)}\n`);
