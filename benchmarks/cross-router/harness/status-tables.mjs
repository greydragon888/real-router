// status-tables — rr-status views of the cross-router benchmark. Three modes:
//   • verbose (default / <cohort>) — one detailed table per cohort, every metric row,
//     parsed from the committed REPORT*.md: | сценарий | metric | <engines> | rr status |.
//   • --grid — one compact 12×5 matrix (scenario × cohort), the HEADLINE metric only,
//     read straight from results/ (stable metric keys, not REPORT prose). An at-a-glance
//     index that fits one screen; the verbose tables remain the detail.
//   • --engines <cohort> — ONE cohort pivoted to routers-as-columns (scenario × engine),
//     raw median of the HEADLINE metric per cell, row winner marked 🟢. The head-to-head
//     analysis view: --grid collapses a cohort to a single rr verdict, this keeps every
//     engine's absolute number so you see WHAT rr beats (or loses to) and by how much.
// The `rr status` column reads: 🟡 ≈ parity (engines differ < 10%); 🟢 win / 🔴 loss
// otherwise, delta from the nearest competitor. Lower = better, except throughput (`/s`).
//
// Usage:
//   node cross-router/harness/status-tables.mjs            # verbose, all 5 cohorts
//   node cross-router/harness/status-tables.mjs vue        # verbose, one cohort
//   node cross-router/harness/status-tables.mjs --grid     # compact 12×5 headline grid
//   node cross-router/harness/status-tables.mjs --engines svelte  # per-router grid, one cohort
//   node cross-router/harness/status-tables.mjs > view.md  # snapshot to a file
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CR = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { react: "REPORT-react.md", vue: "REPORT-vue.md", solid: "REPORT-solid.md", svelte: "REPORT-svelte.md", angular: "REPORT-angular.md" };
const ENG = {
  react: ["real-router", "tanstack", "react-router"],
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router", "mateo-router"],
  angular: ["real-router", "angular-router"],
};

// --grid: headline metric per scenario (lower = better for all). Keys are the raw
// results/ metric names (stable), NOT the REPORT prose the verbose view parses.
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

const num = (c) => {
  const m = c.replace(/\*\*/g, "").replace(/`/g, "").match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
};

// Non-comparable metrics (#1462/CL16): `navsPerSec` is derived (= 1000/navMsWall) and
// was historically an artifact (sync vs frame-capped throughput) the harness itself
// documents as "NOT comparable" — ranking it printed the largest fictitious rr win in
// the status view. nav-churn is ranked by navMsWall + retained heap; skip a verdict here.
const NON_COMPARABLE = /throughput|navsPerSec/i;

function status(metric, vals) {
  if (NON_COMPARABLE.test(metric)) return "— (n/c — read navMsWall)";
  const rr = vals["real-router"];
  const others = Object.entries(vals).filter(([e]) => e !== "real-router");
  if (rr == null || others.length === 0) return "—";
  const higher = metric.includes("/s") || /throughput/i.test(metric);
  const all = Object.values(vals);
  const rrBest = higher ? rr >= Math.max(...all) - 1e-9 : rr <= Math.min(...all) + 1e-9;
  const pick = (a, b) => (higher ? (b[1] > a[1] ? b : a) : b[1] < a[1] ? b : a);
  const [ref, refv] = others.reduce(pick); // nearest competitor (best of the others)
  // r >= 1: how much better (rrBest) or worse (!rrBest) real-router is vs `ref`.
  const r = rrBest ? (higher ? rr / refv : refv / rr) : higher ? refv / rr : rr / refv;
  const pct = (r - 1) * 100;
  if (r < 1.1) return `🟡 ≈ (${rrBest ? "-" : "+"}${Math.abs(pct).toFixed(0)}% vs ${ref})`;
  const d = r >= 2 ? `${r.toFixed(1)}×` : `${rrBest ? "" : "+"}${pct.toFixed(0)}%`;
  return `${rrBest ? "🟢 win" : "🔴 loss"} ${d} (vs ${ref})`;
}

const sm = (m) =>
  m
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim()
    .replace("— V8 only (ScriptDuration) ", "")
    .replace("— V8 only ", "")
    .replace(/\s+/g, " ")
    .replace("( ", "(");

function cohortTable(cohort) {
  const engs = ENG[cohort];
  const lines = readFileSync(join(CR, FILES[cohort]), "utf8").split("\n");
  const out = [`\n# ${cohort} — ${engs.join(" · ")}\n`];
  out.push(`| сценарий | metric | ${engs.join(" | ")} | rr status |`);
  out.push(`|---|---|${"---|".repeat(engs.length)}---|`);
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const mm = lines[i].match(/## .*`([^`]+)`/);
    if (mm) cur = mm[1];
    if (
      lines[i].startsWith("| metric") &&
      lines[i].includes("real-router") &&
      cur &&
      cur !== "_baseline"
    ) {
      const cols = lines[i].split("|").slice(1, -1).map((c) => c.trim());
      const eidx = cols
        .map((c, j) => (c !== "metric" && !c.startsWith("bare") ? j : -1))
        .filter((j) => j >= 0);
      i += 2; // skip the |---| separator
      let first = true;
      while (i < lines.length && lines[i].startsWith("|")) {
        const cs = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        const vals = {};
        for (const j of eidx) {
          const v = num(cs[j] ?? "");
          if (v != null) vals[cols[j]] = v;
        }
        const cells = engs.map((e) => (e in vals ? `${vals[e]}` : "—"));
        out.push(`| ${first ? cur : ""} | ${sm(cs[0])} | ${cells.join(" | ")} | ${status(sm(cs[0]), vals)} |`);
        first = false;
        i++;
      }
    }
  }
  return out.join("\n");
}

// --grid: read one headline metric per (cohort, scenario) from results/ and render a
// compact matrix. Verdict vs nearest competitor, same emoji semantics as the verbose view.
function headlineVals(cohort, scenario, key) {
  const dir = join(RESULTS, cohort, scenario);
  if (!existsSync(dir)) return null;
  const vals = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const en = f.replace(/\.json$/, "");
    if (en === "_baseline") continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, f), "utf8")).metrics?.[key];
      if (m && typeof m.median === "number") vals[en] = m.median;
    } catch {
      /* skip unreadable cell */
    }
  }
  return Object.keys(vals).length ? vals : null;
}

function gridCell(vals) {
  const rr = vals["real-router"];
  const others = Object.entries(vals).filter(([e]) => e !== "real-router").map(([, v]) => v);
  if (rr == null || others.length === 0) return "—";
  const ref = Math.min(...others); // nearest (best) competitor
  const rrBest = rr <= ref + 1e-9;
  const r = rrBest ? ref / rr : rr / ref;
  const pct = (r - 1) * 100;
  // Signed delta, rr's view of a lower-is-better metric: "-N%" = rr faster,
  // "+N%" = rr slower. The 🟢/🔴 emoji is the verdict, the sign the direction; a
  // whole column reads uniformly (- everywhere rr leads). Near-ties are 🟡, same sign.
  if (r < 1.1) return `🟡 ${rrBest ? "-" : "+"}${Math.abs(pct).toFixed(0)}%`;
  const d = r >= 2 ? `${r.toFixed(1)}×` : `${rrBest ? "-" : "+"}${pct.toFixed(0)}%`;
  return `${rrBest ? "🟢" : "🔴"} ${d}`;
}

function gridTable() {
  const out = ["\n# cross-router — rr headline-status grid (source: results/, lower = better)\n"];
  out.push(`| scenario (headline) | ${FW.join(" | ")} |`);
  out.push(`|---|${"---|".repeat(FW.length)}`);
  const tally = Object.fromEntries(FW.map((fw) => [fw, { g: 0, y: 0, r: 0 }]));
  for (const sc of Object.keys(HEADLINE)) {
    const cells = FW.map((fw) => {
      const vals = headlineVals(fw, sc, HEADLINE[sc]);
      const cell = vals ? gridCell(vals) : "—";
      if (cell.startsWith("🟢")) tally[fw].g++;
      else if (cell.startsWith("🟡")) tally[fw].y++;
      else if (cell.startsWith("🔴")) tally[fw].r++;
      return cell;
    });
    out.push(`| ${sc} \`${HEADLINE[sc]}\` | ${cells.join(" | ")} |`);
  }
  out.push(
    `\n**Tally:** ${FW.map((fw) => `${fw} ${tally[fw].g}🟢/${tally[fw].y}🟡/${tally[fw].r}🔴`).join(" · ")}`,
  );
  out.push("\n> ⚠ Mechanical status vs nearest competitor — an index, not the authority. Read the per-cohort");
  out.push("> REPORT for sweep curves (e.g. react/vue/svelte deep@90 = competitor non-monotonicity / scale-floor)");
  out.push("> and cohort caveats. Angular per-nav now commits in-task (#1466 fixed), so its wall ≈ task.");
  return out.join("\n");
}

// --engines <cohort>: raw median per HEADLINE metric, routers as columns, row winner 🟢.
const fmtVal = (v) => {
  const a = Math.abs(v);
  return v.toFixed(a < 1 ? 3 : a < 100 ? 2 : 1);
};

function enginesTable(cohort) {
  const engs = ENG[cohort];
  if (!engs) return `\n# unknown cohort "${cohort}" — expected: ${Object.keys(ENG).join(", ")}`;
  const out = [`\n# ${cohort} — per-router headline grid (source: results/, lower = better)\n`];
  out.push(`| scenario (headline) | ${engs.join(" | ")} |`);
  out.push(`|---|${"---|".repeat(engs.length)}`);
  const wins = Object.fromEntries(engs.map((e) => [e, 0]));
  for (const sc of Object.keys(HEADLINE)) {
    const key = HEADLINE[sc];
    const vals = headlineVals(cohort, sc, key) ?? {};
    const present = engs.map((e) => (e in vals ? vals[e] : null));
    const nums = present.filter((v) => v != null);
    const min = nums.length ? Math.min(...nums) : null;
    const cells = present.map((v, i) => {
      if (v == null) return "—";
      if (v === min) {
        wins[engs[i]]++;
        return `🟢 **${fmtVal(v)}**`;
      }
      return fmtVal(v);
    });
    out.push(`| ${sc} \`${key}\` | ${cells.join(" | ")} |`);
  }
  out.push(`\n**Row wins (🟢 lowest):** ${engs.map((e) => `${e} ${wins[e]}`).join(" · ")}`);
  out.push("\n> Raw medians in each row-metric's unit; 🟢 = fastest/lowest that row. Lower = better for");
  out.push("> every headline metric. Pair with `--grid` (which collapses this to one rr-vs-best verdict).");
  return out.join("\n");
}

const args = process.argv.slice(2);
const positional = args.find((a) => !a.startsWith("--"));
if (args.includes("--engines")) {
  console.log(enginesTable(positional ?? "svelte"));
} else if (args.includes("--grid")) {
  console.log(gridTable());
} else {
  const cohorts = positional ? [positional] : ["react", "vue", "solid", "svelte", "angular"];
  for (const c of cohorts) console.log(cohortTable(c));
}
