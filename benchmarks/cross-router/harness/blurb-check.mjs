// blurb-check — guards the cross-router REPORT *narrative* against staleness (#1457).
//
// The REPORT prose (blurbs / scopeNotes / caveats, curated in report.mjs) hardcodes
// numbers that silently drift from the auto-generated tables on every re-baseline —
// #1457 was exactly this: "no prose↔data link of any kind". This tool adds the link
// as a gate. Three checks over the committed REPORT-<cohort>.md + results/:
//
//   1. ENGINE-ATTRIBUTED NUMBERS — every "<engine> <number><unit>" cited in prose must
//      match a real median of that engine (same unit class) within tolerance. Only
//      numbers a human attributed to a specific engine are checked (e.g. `react-router
//      0.773`, `@angular/router 2.834`) — high precision, and unit-classed so a stale
//      alloc "0.24 KB" can't coincidentally match a nav timing "0.22 ms".
//   2. n=<N> annotations must equal the actual run count (catches the "(n=15)" class).
//   3. VERDICT-FLIP — the headline winner + margin bucket per scenario, vs a stored
//      snapshot (harness/blurb-verdicts.json). A flip means the *mechanism* prose (not
//      just the numbers) likely went stale — which auto-numbers alone can't fix.
//
// Usage:
//   node cross-router/harness/blurb-check.mjs              # all cohorts, gate
//   node cross-router/harness/blurb-check.mjs vue          # one cohort
//   node cross-router/harness/blurb-check.mjs --update     # accept current verdicts as
//                                                          # the new snapshot (after you
//                                                          # re-checked the flip prose)
// Exit: 0 = clean · 1 = finding(s) · 2 = no REPORTs/results.
//
// NOTE: checks the committed REPORT-*.md — run `report.mjs <cohort>` first so they
// reflect current results/ (the tool also warns if a REPORT is older than results/).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CR = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(CR, "results");
const FW = ["react", "vue", "solid", "svelte", "angular"];
const HEADLINE = {
  "cold-start": "scriptDurationMs",
  "nav-latency": "navMsWall",
  "param-nav": "navMsWall",
  "nested-switch": "navMsWall",
  "active-links": "navMsWall",
  "back-forward": "navMsWall",
  "wide-config": "navMsTask@1000",
  "deep-config": "navMsTask@90",
  "search-param-scaling": "navMsTask@50",
  "table-heap": "jsHeapMB@10000",
  "nav-churn": "heapDeltaKB",
  "link-build": "mountMs",
};

// prose alias → results engine key. Longest-first so "@solidjs/router" wins over
// "solid-router" and "@tanstack/*-router" over "tanstack".
const ALIASES = [
  ["@tanstack/react-router", "tanstack"],
  ["@tanstack/solid-router", "tanstack"],
  ["@tanstack/svelte-router", "tanstack"],
  ["@tanstack/vue-router", "tanstack"],
  ["@solidjs/router", "solid-router"],
  ["@angular/router", "angular-router"],
  ["angular-router", "angular-router"],
  ["mateo-router", "mateo-router"],
  ["react-router", "react-router"],
  ["solid-router", "solid-router"],
  ["real-router", "real-router"],
  ["vue-router", "vue-router"],
  ["sv-router", "sv-router"],
  ["tanstack", "tanstack"],
].sort((a, b) => b[0].length - a[0].length);

const unitClass = (key) =>
  /KB/.test(key) ? "KB" : /MB/.test(key) ? "MB" : /navsPerSec|perSec/i.test(key) ? "S" : "MS";

// median tolerance: 12% relative, with a 0.02 absolute floor for sub-ms rounding.
const near = (v, c) => Math.abs(v - c) <= Math.max(0.12 * Math.abs(c), 0.02);

function loadCohort(cohort) {
  const root = join(RESULTS, cohort);
  if (!existsSync(root)) return null;
  // byEngine[engine][unitClass] = [median, …]  (cohort-wide, all scenarios)
  const byEngine = {};
  let runs = null;
  let newestResult = 0;
  const winners = {}; // scenario → { winner, bucket }
  for (const scen of readdirSync(root)) {
    const sdir = join(root, scen);
    if (!statSync(sdir).isDirectory()) continue;
    const scenMed = {}; // engine → headline median (for verdict)
    for (const f of readdirSync(sdir)) {
      if (!f.endsWith(".json")) continue;
      const engine = f.replace(/\.json$/, "");
      let d;
      try {
        const p = join(sdir, f);
        newestResult = Math.max(newestResult, statSync(p).mtimeMs);
        d = JSON.parse(readFileSync(p, "utf8"));
      } catch {
        continue;
      }
      if (runs == null && typeof d.runs === "number") runs = d.runs;
      byEngine[engine] ??= {};
      for (const [k, s] of Object.entries(d.metrics ?? {})) {
        if (!s || typeof s.median !== "number") continue;
        (byEngine[engine][unitClass(k)] ??= []).push(s.median);
      }
      if (engine !== "_baseline") {
        const hm = d.metrics?.[HEADLINE[scen]]?.median;
        if (typeof hm === "number") scenMed[engine] = hm;
      }
    }
    // verdict: lowest headline median wins (all HEADLINE metrics are lower=better)
    const ranked = Object.entries(scenMed).sort((a, b) => a[1] - b[1]);
    if (ranked.length >= 1) {
      const [winner, w] = ranked[0];
      const second = ranked[1]?.[1];
      const r = second ? second / w : Infinity;
      const bucket =
        r < 1.05 ? "tie" : r < 1.25 ? "slim" : r < 1.75 ? "clear" : r < 2.5 ? "2x" : "3x+";
      winners[scen] = { winner, bucket };
    }
  }
  return { byEngine, runs, newestResult, winners };
}

// Extract (engine, value, unitClass) from a prose line — only numbers IMMEDIATELY after
// an engine alias (attributed citations). Skips ratios (×), percentages, k-shorthand,
// version/structural ints, and @-prefixed sweep sizes. Unit class: the number's own
// trailing unit if present, else PROPAGATED from the last explicit unit earlier on the
// line (comparison lists state the unit once — "…~11 KB/nav vs A ~30 and B ~109" makes
// 30 and 109 KB too), else defaults to MS (bare per-nav timings).
function* attributed(line) {
  const units = [];
  // \b before the alpha units so "ms" does NOT match inside words like "params"/"terms"
  for (const um of line.matchAll(/\b(KB|MB|ms|µs)\b|(\/s)\b/g)) {
    const tok = um[1] ?? um[2];
    units.push({ pos: um.index, uc: tok === "KB" ? "KB" : tok === "MB" ? "MB" : tok === "/s" ? "S" : "MS" });
  }
  const unitBefore = (pos) => {
    let u = "MS";
    for (const t of units) {
      if (t.pos < pos) u = t.uc;
      else break;
    }
    return u;
  };
  for (const [alias, key] of ALIASES) {
    let from = 0;
    for (;;) {
      const i = line.indexOf(alias, from);
      if (i < 0) break;
      from = i + alias.length;
      // number within a tiny gap after the alias: space / tilde / paren only
      const m = /^[\s:~(]{0,3}(\d+\.?\d*)\s*(KB|MB|ms|µs|\/s|%|×|k\b)?/.exec(line.slice(from));
      if (!m) continue;
      const raw = m[1];
      const unit = m[2];
      if (unit === "×" || unit === "%" || unit === "k") continue; // ratio / pct / 11.7k/s
      // '@' immediately before the number → sweep size (e.g. @1000), not a median
      const numAt = from + m[0].indexOf(raw);
      if (line[numAt - 1] === "@") continue;
      const value = Number(raw);
      if (!raw.includes(".") && value < 100) continue; // version / small count / sweep size
      const uc =
        unit === "KB" ? "KB" : unit === "MB" ? "MB" : unit === "/s" ? "S" : unit === "ms" || unit === "µs" ? "MS" : unitBefore(numAt);
      yield { engine: key, value, uc, alias, unit: unit ?? "" };
    }
  }
}

function checkCohort(cohort, findings) {
  const reportPath = join(CR, `REPORT-${cohort}.md`);
  if (!existsSync(reportPath)) return false;
  const data = loadCohort(cohort);
  if (!data) return false;
  const { byEngine, runs, newestResult } = data;

  if (statSync(reportPath).mtimeMs < newestResult - 1000) {
    findings.push({
      cohort,
      kind: "stale-report",
      msg: `REPORT-${cohort}.md is older than results/ — run \`report.mjs ${cohort}\` to regenerate before trusting the prose.`,
    });
  }

  const lines = readFileSync(reportPath, "utf8").split("\n");
  for (const line of lines) {
    if (line.startsWith("|") || line.startsWith("#")) continue; // tables + headings
    // n= annotations ((n=50) / "at n=50" — NOT the ?n=5 query-param example in prose)
    for (const nm of line.matchAll(/(?:^|[\s(])n\s*=\s*(\d+)/g)) {
      const n = Number(nm[1]);
      if (runs != null && n !== runs) {
        findings.push({
          cohort,
          kind: "stale-n",
          msg: `prose says "n=${n}" but the run is n=${runs}`,
          snippet: line.trim().slice(0, 90),
        });
      }
    }
    // engine-attributed numbers
    for (const { engine, value, uc, alias, unit } of attributed(line)) {
      const cands = byEngine[engine]?.[uc];
      if (!cands || cands.length === 0) continue; // no data of that unit class
      if (cands.some((c) => near(value, c))) continue;
      const nearest = cands.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
      findings.push({
        cohort,
        kind: "orphan-number",
        msg: `"${alias} ${value}${unit}" matches no ${uc} median of ${engine} (nearest ${nearest.toFixed(3)})`,
        snippet: line.trim().slice(0, 110),
      });
    }
  }
  return true;
}

// ---- run ----
const args = process.argv.slice(2);
const update = args.includes("--update");
const cohortArg = args.find((a) => !a.startsWith("--"));
const cohorts = cohortArg ? [cohortArg] : FW;

const findings = [];
const liveVerdicts = {};
let scanned = 0;
for (const cohort of cohorts) {
  if (checkCohort(cohort, findings)) {
    scanned++;
    const d = loadCohort(cohort);
    for (const [scen, v] of Object.entries(d.winners)) liveVerdicts[`${cohort}/${scen}`] = v;
  }
}

if (scanned === 0) {
  console.error(`blurb-check: no REPORT-*.md / results under ${CR} — run report.mjs first.`);
  process.exit(2);
}

// verdict-flip vs snapshot
const snapPath = join(dirname(fileURLToPath(import.meta.url)), "blurb-verdicts.json");
const snap = existsSync(snapPath) ? JSON.parse(readFileSync(snapPath, "utf8")) : null;
const flips = [];
if (snap) {
  for (const [k, v] of Object.entries(liveVerdicts)) {
    if (cohortArg && !k.startsWith(`${cohortArg}/`)) continue;
    const prev = snap[k];
    if (!prev) continue;
    if (prev.winner !== v.winner || prev.bucket !== v.bucket) {
      flips.push(`${k}: ${prev.winner}/${prev.bucket} → ${v.winner}/${v.bucket}`);
    }
  }
}

if (update) {
  const merged = { ...(snap ?? {}), ...liveVerdicts };
  writeFileSync(snapPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`blurb-check: verdict snapshot updated (${Object.keys(liveVerdicts).length} entries).`);
}

// ---- report ----
console.log(
  `blurb-check — ${scanned} cohort(s), engine-attributed numbers + n= + verdict-flip\n`,
);
if (findings.length === 0 && flips.length === 0) {
  console.log("✓ PASS — every attributed number matches a median, n= is current, no verdict flips.");
  if (!snap) console.log("  (no verdict snapshot yet — run with --update to create the baseline.)");
  process.exit(snap ? 0 : 0);
}

if (flips.length > 0 && !update) {
  console.log(`⚠ ${flips.length} VERDICT FLIP(S) — re-check the *mechanism* prose (not just numbers), then \`--update\`:\n`);
  for (const f of flips) console.log(`  • ${f}`);
  console.log("");
}

if (findings.length > 0) {
  const byKind = (k) => findings.filter((f) => f.kind === k);
  const order = ["orphan-number", "stale-n", "stale-report"];
  console.log(`✗ ${findings.length} finding(s):\n`);
  for (const kind of order) {
    const fs = byKind(kind);
    if (fs.length === 0) continue;
    for (const f of fs) {
      console.log(`  [${f.cohort}] ${f.msg}`);
      if (f.snippet) console.log(`      … ${f.snippet}`);
    }
    console.log("");
  }
}

if (!snap && flips.length === 0) {
  console.log("(no verdict snapshot yet — run with --update to create the baseline.)");
}
process.exit(findings.length > 0 || (flips.length > 0 && !update) ? 1 : 0);
