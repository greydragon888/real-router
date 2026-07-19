// Single source for writing a results cell — shared by run.mjs (one cell) and
// run-all.mjs (interleaved matrix) so the smoke-grade guard (#1455) lives in ONE place.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Below this, a cell is smoke-grade: its ~95% CI is many× wider than stats.mjs (z=1.96)
// reports, and cross-session sub-ms drift can invert Δ-comparisons — such a cell is
// indistinguishable from a real one once in results/ and poisons any analysis (#1455).
export const N_MIN = 10;

// Write `out` (= { scenario, engine, framework, ...result, env }) to
// `<resultsDir>/<framework>/<scenario>/<engine>.json`. Refuses smoke-grade cells
// (runs < N_MIN) and n-downgrades of an existing higher-n cell (audit 07-18 G2o) —
// still measured/printed by the caller, just not persisted. Returns true if written.
export function writeCell(resultsDir, out, runs) {
  if (runs < N_MIN) return false; // smoke-grade (runs < N_MIN) — not persisted (#1455)
  // Reversed-sweep control runs (BENCH_REVERSE_TARGETS=1, the K10 live check) measure a
  // deliberately position-permuted sweep — persisting one would poison results/ with
  // position-biased points under the normal keys. Measure-only, always.
  if (process.env.BENCH_REVERSE_TARGETS === "1") {
    console.warn(`  ⚠ ${out.framework}/${out.scenario}/${out.engine}: BENCH_REVERSE_TARGETS control run — measure-only, not persisted`);
    return false;
  }
  const dir = `${resultsDir}/${out.framework}/${out.scenario}`;
  const file = `${dir}/${out.engine}.json`;
  // n-downgrade guard (audit 07-18 G2o): a lower-n rerun silently degrades a higher-n
  // cell (reference results/ is n=50; RME grows ~√(n_old/n_new)) — refuse unless forced.
  // Unreadable/legacy cells (no runs field) stay overwritable.
  if (process.env.BENCH_ALLOW_N_DOWNGRADE !== "1" && existsSync(file)) {
    let prevRuns;
    try {
      prevRuns = JSON.parse(readFileSync(file, "utf8")).runs;
    } catch {
      prevRuns = undefined;
    }
    if (Number.isFinite(prevRuns) && prevRuns > runs) {
      console.warn(
        `  ⚠ ${out.framework}/${out.scenario}/${out.engine}: existing n=${prevRuns} > new n=${runs} — not overwritten (BENCH_ALLOW_N_DOWNGRADE=1 to force)`,
      );
      return false;
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  return true;
}
