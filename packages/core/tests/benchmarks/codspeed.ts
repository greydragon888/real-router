/**
 * Single-process CodSpeed entry (CI only).
 *
 * CodSpeed's `simulation` instrument requires the benchmarking process to carry
 * V8 flags (`--allow-natives-syntax`, `--no-opt`, `--predictable`, …) in its
 * `process.execArgv`. The CodSpeed runner injects those flags ONLY into the
 * process it wraps directly, and they cannot ride through `NODE_OPTIONS` (Node
 * rejects `--allow-natives-syntax` there). So every extra `node` hop loses them:
 * the local `run.ts` model (pnpm → tsx → spawn-per-file) leaves the actual bench
 * process flag-less, and `@codspeed/core`'s `optimizeFunction` — which uses the
 * `%OptimizeFunctionOnNextCall` V8 native — dies with
 * `SyntaxError: Unexpected token '%'`.
 *
 * Fix: under CI the CodSpeed action wraps THIS file directly —
 *   node --conditions=@real-router/internal-source --import tsx codspeed.ts
 * — which imports every `*.bench.ts`'s `run()` and awaits them serially in one
 * process, so the V8 flags (and CodSpeed's instrumentation) apply to the code
 * that actually runs. See `.github/workflows/codspeed.yml`.
 *
 * Per-file process isolation (RFC §9.2) is intentionally dropped HERE only: it
 * exists to keep V8 inline caches from cross-contaminating WALL-CLOCK numbers,
 * but `simulation` runs under `--no-opt --predictable` (JIT off), so megamorphic
 * call-sites do not perturb the deterministic instruction counts. Local
 * `pnpm bench` keeps process-per-file via `run.ts` for honest wall-clock dev.
 */
import { run as runDefault } from "./default.bench";
import { run as runEncodingNone } from "./encoding-none.bench";
import { run as runEncodingUri } from "./encoding-uri.bench";
import { run as runEncodingUriComponent } from "./encoding-uricomponent.bench";
import { run as runStrictQuery } from "./strict-query.bench";
import { run as runTrailingPreserve } from "./trailing-preserve.bench";

// Same localeCompare order as `run.ts`'s readdir, so a CI run lists suites in
// the same sequence as a local `pnpm bench`.
const suites: readonly (readonly [string, () => Promise<void>])[] = [
  ["default", runDefault],
  ["encoding-none", runEncodingNone],
  ["encoding-uri", runEncodingUri],
  ["encoding-uricomponent", runEncodingUriComponent],
  ["strict-query", runStrictQuery],
  ["trailing-preserve", runTrailingPreserve],
];

async function main(): Promise<void> {
  for (const [name, runSuite] of suites) {
    console.log(`\n=== ${name} ===`);
    await runSuite();
  }

  console.log(`\nAll ${String(suites.length)} bench suite(s) completed.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
