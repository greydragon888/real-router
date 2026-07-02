// rme-gate — flag cross-router benchmark metrics whose RME (relative margin of
// error) is too high to trust. Reads results/<fw>/<scenario>/<engine>.json (the
// run-all output, where stats.mjs records `rme` per metric) and checks each metric
// against a per-family threshold:
//   • stable  — the reliable signals (total / script / heap / throughput / navsPerSec)
//   • noisy   — inherently jittery families (Blink `pushState` trace, latency, FCP),
//               given a looser bound so the gate fails only on EGREGIOUS instability
// Exits non-zero if ANY metric exceeds its family threshold — wire it after a bench
// run to catch flaky numbers before they reach a REPORT (the cross-router analogue
// of core's check-rme.sh). Prints the offenders worst-first regardless of exit code.
//
// Usage:
//   node cross-router/harness/rme-gate.mjs                # defaults: stable 15%, noisy 40%
//   node cross-router/harness/rme-gate.mjs 10 30          # stable 10%, noisy 30%
//   node cross-router/harness/rme-gate.mjs 15 40 vue      # restrict to one cohort
//   RME_STABLE=12 RME_NOISY=35 node …/rme-gate.mjs        # via env
// Exit: 0 = pass · 1 = threshold(s) exceeded · 2 = no results (run run-all first)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CR = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(CR, "results");
const FW = ["react", "vue", "solid", "svelte", "angular"];

// Inherently-noisy metric families — CDP Blink trace (history.pushState), wall-clock
// latency, and FCP all have a fat RME tail by nature (small absolute / paint cadence).
const isNoisy = (k) => /blink|latency|fcp/i.test(k);

function* resultFiles(cohort) {
  const root = join(RESULTS, cohort);
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const sdir = join(root, entry);
    if (!statSync(sdir).isDirectory()) continue; // skips features.json
    for (const f of readdirSync(sdir)) {
      if (f.endsWith(".json")) yield [entry, f.replace(/\.json$/, ""), join(sdir, f)];
    }
  }
}

const argNum = (v, d) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
const stable = argNum(process.argv[2] ?? process.env.RME_STABLE, 15);
const noisy = argNum(process.argv[3] ?? process.env.RME_NOISY, 40);
const cohorts = process.argv[4] ? [process.argv[4]] : FW;

const violations = [];
let scanned = 0;
for (const cohort of cohorts) {
  for (const [scen, engine, path] of resultFiles(cohort)) {
    let data;
    try {
      data = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const [k, s] of Object.entries(data.metrics ?? {})) {
      if (s == null || typeof s.rme !== "number") continue;
      scanned++;
      const family = isNoisy(k) ? "noisy" : "stable";
      const limit = family === "noisy" ? noisy : stable;
      if (s.rme > limit) violations.push({ cohort, scen, engine, k, rme: s.rme, family, limit, n: s.n });
    }
  }
}

if (!existsSync(RESULTS) || scanned === 0) {
  console.error(`rme-gate: no results under ${RESULTS} — run \`node cross-router/run-all.mjs\` first.`);
  process.exit(2);
}

violations.sort((a, b) => b.rme - a.rme);
console.log(
  `RME-gate — stable ≤ ${stable}% · noisy(blink/latency/fcp) ≤ ${noisy}% · scanned ${scanned} metrics across ${cohorts.join("/")}\n`,
);
if (violations.length === 0) {
  console.log("✓ PASS — every metric within its RME threshold.");
  process.exit(0);
}
const stableN = violations.filter((v) => v.family === "stable").length;
console.log(`✗ FAIL — ${violations.length} metric(s) over threshold (${stableN} stable, ${violations.length - stableN} noisy):\n`);
console.log("| RME% | limit | family | cohort | scenario | engine | metric | n |");
console.log("|---|---|---|---|---|---|---|---|");
for (const v of violations) {
  console.log(`| ${v.rme.toFixed(1)} | ${v.limit} | ${v.family} | ${v.cohort} | ${v.scen} | ${v.engine} | ${v.k} | ${v.n} |`);
}
process.exit(1);
