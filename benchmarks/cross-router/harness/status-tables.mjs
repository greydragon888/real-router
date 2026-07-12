// status-tables — flat per-cohort view of the committed REPORTs, one table per
// cohort: | сценарий | metric | <engines> | rr status |. The `rr status` column
// reads: 🟡 ≈ parity (engines differ < 10%); 🟢 win / 🔴 loss otherwise, with the
// delta measured from the WINNER (when real-router is not first) or from the
// nearest competitor (when real-router IS first). Lower = better, except
// throughput (`/s`). Source of truth = the committed REPORT*.md (no results/ needed).
//
// Usage:
//   node cross-router/harness/status-tables.mjs            # all 3 cohorts
//   node cross-router/harness/status-tables.mjs vue        # one cohort
//   node cross-router/harness/status-tables.mjs > view.md  # snapshot to a file
import { readFileSync } from "node:fs";
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

const arg = process.argv[2];
const cohorts = arg ? [arg] : ["react", "vue"];
for (const c of cohorts) console.log(cohortTable(c));
