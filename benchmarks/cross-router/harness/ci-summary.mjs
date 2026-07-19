// ci-summary — one markdown summary of a cross-router CI benchmark run, for
// $GITHUB_STEP_SUMMARY + the Pages dashboard (O-2 / O-5 / O-11). It reads the FRESH
// deck-data.json that CI's deck-extract wrote from this run's results/ — a workspace
// artifact, NOT the committed reference (S3-part2: no committed layer in the read chain) —
// for the machine stamp (META) and the win/loss/parity grid (GRID), then does a light RME
// scan of results/ for the noise watch (mirrors rme-gate families). Prints to stdout.
//
// The rme-gate step (its own workflow step) owns pass/fail; this section is informational.
//
//   node cross-router/harness/ci-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RME_NOISY_DEFAULT, RME_STABLE_DEFAULT, familyOf } from "./rme-policy.mjs";

const CR = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(CR, "results");
const FW = ["react", "vue", "solid", "svelte", "angular"];
// Scenario order + labels (the headline metric per scenario is already baked into GRID
// by deck-extract, so this view is metric-agnostic — it renders the verdict, not the number).
const SCEN = [
  ["nav-latency", "Navigation latency"],
  ["param-nav", "Param change"],
  ["back-forward", "Back / forward"],
  ["active-links", "Active-link nav"],
  ["nested-switch", "Sibling switch"],
  ["wide-config", "Wide table match"],
  ["deep-config", "Deep tree match"],
  ["search-param-scaling", "Query-param scaling"],
  ["table-heap", "Route memory"],
  ["nav-churn", "Heap per nav"],
  ["gc-per-nav", "GC per nav"],
  ["cold-start", "Cold start"],
  ["link-build", "Link mounting"],
];

// ── fresh deck-data.json (this run's snapshot; workspace, not the committed reference) ──
const ddPath = join(CR, "deck", "deck-data.json");
if (!existsSync(ddPath)) {
  console.error("ci-summary: deck/deck-data.json not found — run deck-extract first (workflow order).");
  process.exit(2);
}
const { META = null, GRID = {} } = JSON.parse(readFileSync(ddPath, "utf8"));

const out = ["# Cross-router benchmark — CI snapshot\n"];

// ── stamp (O-5 / O-10) ──
const ci = !!(META && META.runner && META.runner !== "local" && META.runner !== "unknown");
if (META) {
  const d = String(META.date || "").slice(0, 10);
  const cells = META.cells ? ` · matrix ${META.cells.written}/${META.cells.expected}` : "";
  out.push(`\`${META.cpu}\` · ${META.runner} · commit \`${META.commit}\` · ${d} · **n=${META.runs}**${cells}\n`);
  if (META.cells && META.cells.written < META.cells.expected)
    out.push(
      `> ⚠️ **Partial snapshot** — ${META.cells.expected - META.cells.written} of ${META.cells.expected} matrix cells are missing from results/ (audit 07-18 K13): the grid below under-represents the matrix; missing cells render as —.\n`,
    );
  if (META.matcher && META.matcher.commit && META.commit !== "unknown" && META.matcher.commit !== META.commit)
    out.push(
      `> ⚠️ **Mixed epochs** — matcher-bench results (\`${META.matcher.commit}\`) vs browser cells (\`${META.commit}\`): wide/deep cards are from a different dist epoch (audit 07-18 K12); re-run matcher-bench.\n`,
    );
  if (ci)
    out.push(
      "> ⚠️ The cards below are **this run's fresh snapshot** (CI runner — see stamp). The curated **Why** analysis in the committed deck is anchored to the committed reference snapshot, not necessarily this run.\n",
    );
}

// ── win/loss/parity grid (O-11 competitive-ratio, advisory) ──
const EM = { g: "🟢", y: "🟡", r: "🔴" };
out.push("## real-router vs the fastest rival — headline metric per scenario\n");
out.push(`| scenario | ${FW.join(" | ")} |`);
out.push(`|---|${FW.map(() => "---").join("|")}|`);
let g = 0, y = 0, r = 0;
for (const [sc, label] of SCEN) {
  const cells = FW.map((co) => {
    const cell = GRID[co]?.[sc];
    if (!cell) return "—";
    const [ratio, cls] = cell; // deck-extract writes [ratio, class]
    if (cls === "g") g++;
    else if (cls === "y") y++;
    else r++;
    return cls === "y" ? "🟡 tie" : `${EM[cls] ?? "?"} ${ratio}×`;
  });
  out.push(`| ${label} | ${cells.join(" | ")} |`);
}
out.push(
  `\n_Tally: ${g} 🟢 lead · ${y} 🟡 tie · ${r} 🔴 trail — real-router vs the nearest competitor at each scenario's headline metric; lower is better. Advisory competitive signal (drift-invariant ratio), never a gate._\n`,
);

// ── RME noise watch (light scan of results/) — families from the SHARED rme-policy, so
// this watch is a true mirror of rme-gate and can't silently diverge again (K16).
// Single-nav sweep points are report-only in the gate → excluded from the watch too
// (they'd otherwise flood the top-25 with healthy quantization noise).
const STABLE = RME_STABLE_DEFAULT, NOISY = RME_NOISY_DEFAULT;
const flagged = [];
for (const co of FW) {
  const root = join(RESULTS, co);
  if (!existsSync(root)) continue;
  for (const sc of readdirSync(root)) {
    const sdir = join(root, sc);
    if (!statSync(sdir).isDirectory()) continue; // skip features.json
    for (const f of readdirSync(sdir)) {
      if (!f.endsWith(".json")) continue;
      let data;
      try {
        data = JSON.parse(readFileSync(join(sdir, f), "utf8"));
      } catch {
        continue;
      }
      for (const [k, s] of Object.entries(data.metrics ?? {})) {
        if (!s || typeof s.rme !== "number") continue;
        const family = familyOf(sc, k);
        if (family === "sweep-point") continue;
        const lim = family === "noisy" ? NOISY : STABLE;
        if (s.rme > lim) flagged.push({ co, sc, eng: f.replace(/\.json$/, ""), k, rme: s.rme, lim });
      }
    }
  }
}
out.push("## RME noise watch\n");
if (!flagged.length) {
  out.push(`✓ Every metric within its RME threshold (stable ≤ ${STABLE}%, noisy families ≤ ${NOISY}%).\n`);
} else {
  flagged.sort((a, b) => b.rme - a.rme);
  out.push(
    `⚠️ ${flagged.length} metric(s) over threshold — read with caution (runner noise expected; the rme-gate step is report-only unless armed):\n`,
  );
  out.push("| RME% | limit | cohort | scenario | engine | metric |");
  out.push("|---|---|---|---|---|---|");
  for (const v of flagged.slice(0, 25)) out.push(`| ${v.rme.toFixed(1)} | ${v.lim} | ${v.co} | ${v.sc} | ${v.eng} | ${v.k} |`);
  if (flagged.length > 25) out.push(`\n_…and ${flagged.length - 25} more._`);
}

console.log(out.join("\n"));
