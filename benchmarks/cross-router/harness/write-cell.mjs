// Single source for writing a results cell — shared by run.mjs (one cell) and
// run-all.mjs (interleaved matrix) so the smoke-grade guard (#1455) lives in ONE place.
import { mkdirSync, writeFileSync } from "node:fs";

// Below this, a cell is smoke-grade: its ~95% CI is many× wider than stats.mjs (z=1.96)
// reports, and cross-session sub-ms drift can invert Δ-comparisons — such a cell is
// indistinguishable from a real one once in results/ and poisons any analysis (#1455).
export const N_MIN = 10;

// Write `out` (= { scenario, engine, framework, ...result, env }) to
// `<resultsDir>/<framework>/<scenario>/<engine>.json`. Refuses smoke-grade cells
// (runs < N_MIN) — still measured/printed by the caller, just not persisted. Returns
// true if written.
export function writeCell(resultsDir, out, runs) {
  if (runs < N_MIN) {
    console.error(
      `write-cell: SMOKE run (runs=${runs} < N_MIN=${N_MIN}) — ${out.framework}·${out.scenario}×${out.engine} NOT written to results/ (a smoke-grade cell poisons ground truth, #1455).`,
    );
    return false;
  }
  const dir = `${resultsDir}/${out.framework}/${out.scenario}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${out.engine}.json`, `${JSON.stringify(out, null, 2)}\n`);
  return true;
}
