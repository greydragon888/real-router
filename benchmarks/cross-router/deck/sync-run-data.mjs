// Pull a published CI benchmark snapshot into the local deck pipeline.
//
//   node sync-run-data.mjs <run-id-or-url> [--pdf] [--repo owner/name]
//
// `results/` and `matcher-bench/results.json` are gitignored, so a fresh checkout has no data
// to build a deck from — and running the full matrix locally is a ~6 h job. Instead, this pulls
// the `bench-results` artifact of a "Cross Routers Benchmarks" run (via the `gh` CLI) and
// refreshes the THREE gitignored data inputs the deck reads:
//   deck/out/deck-data.json · matcher-bench/results.json · results/
// then rebuilds deck.html + print.html from the tracked SOURCE — so the local deck gets the
// fresh numbers AND whatever template/blurb edits are currently on disk. The artifact's own
// deck.html / PDF are discarded on purpose (they were built from the run's source, not yours;
// blurb multipliers re-derive from the data anyway — see deck-render.js resolveR).
//
// Prereqs: `gh auth login`. The current deck-data.json is backed up to out/deck-data.prev.json.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = import.meta.dirname; // .../deck
const CR = join(DIR, ".."); // .../cross-router
const OUT = join(DIR, "out");

const args = process.argv.slice(2);
const withPdf = args.includes("--pdf");
const repoI = args.indexOf("--repo");
const repo = repoI >= 0 ? args[repoI + 1] : "greydragon888/real-router";
const runArg = args.find((a) => !a.startsWith("--") && a !== repo);
if (!runArg) {
  console.error("usage: node sync-run-data.mjs <run-id-or-url> [--pdf] [--repo owner/name]");
  process.exit(2);
}
// accept a full Actions URL (…/runs/29695303795[/…]) or a bare run id
const runId = ((runArg.match(/runs\/(\d+)/) || [, runArg])[1] || "").replace(/\D/g, "");
if (!runId) {
  console.error(`cannot parse a run id from "${runArg}"`);
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), "bench-sync-"));
const cleanup = () => rmSync(tmp, { recursive: true, force: true });
try {
  // 1. download the bench-results artifact
  console.log(`↓ downloading bench-results from ${repo} run ${runId} …`);
  try {
    execFileSync("gh", ["run", "download", runId, "-R", repo, "-n", "bench-results", "-D", tmp], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch {
    console.error(
      "\ngh run download failed — check the run id, that its bench-results artifact hasn't expired,\n" +
        "and that you're authenticated (`gh auth login`).",
    );
    process.exit(1);
  }

  const aData = join(tmp, "deck/out/deck-data.json");
  const aMatcher = join(tmp, "matcher-bench/results.json");
  const aResults = join(tmp, "results");
  for (const [p, what] of [
    [aData, "deck/out/deck-data.json"],
    [aMatcher, "matcher-bench/results.json"],
    [aResults, "results/"],
  ]) {
    if (!existsSync(p)) {
      console.error(`artifact is missing ${what} — wrong artifact or a partial run.`);
      process.exit(1);
    }
  }

  const meta = JSON.parse(readFileSync(aData, "utf8")).META || {};
  console.log(
    `  snapshot: commit ${meta.commit} · ${String(meta.date).slice(0, 10)} · n=${meta.runs} · ` +
      `${meta.cpu} (${meta.runner}) · matrix ${meta.cells?.written}/${meta.cells?.expected}`,
  );

  // 2. back up the current deck-data, then copy the three inputs in
  mkdirSync(OUT, { recursive: true });
  if (existsSync(join(OUT, "deck-data.json"))) {
    cpSync(join(OUT, "deck-data.json"), join(OUT, "deck-data.prev.json"));
    console.log("  backed up current → out/deck-data.prev.json");
  }
  cpSync(aData, join(OUT, "deck-data.json"));
  cpSync(aMatcher, join(CR, "matcher-bench/results.json"));
  // mirror results/ exactly — drop local stale cells that aren't in this snapshot
  rmSync(join(CR, "results"), { recursive: true, force: true });
  cpSync(aResults, join(CR, "results"), { recursive: true });
  console.log("  refreshed: out/deck-data.json · matcher-bench/results.json · results/");
} finally {
  cleanup();
}

// 3. rebuild the deck from tracked SOURCE + fresh data (NOT the artifact's deck.html)
console.log("↻ rebuilding deck …");
execFileSync("node", [join(DIR, "build-deck.mjs")], { stdio: "inherit" });
if (withPdf) execFileSync("node", [join(DIR, "render-pdf.mjs")], { stdio: "inherit" });

console.log(`\n✓ local deck synced to run ${runId}.`);
console.log(
  "  Multipliers re-pin themselves from the data; only re-check the qualitative shape\n" +
    "  claims (flat / climbs / leads / draws-level) if a SWEEP/GRID verdict flipped.",
);
