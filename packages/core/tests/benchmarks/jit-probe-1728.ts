/**
 * #1728 — JIT/allocation probe for the `plan` vs `opts` read site.
 *
 * NOT a benchmark: it is deliberately outside the `*.bench.ts` glob, so neither
 * `pnpm bench` nor the CodSpeed suite picks it up. It exists because the effect
 * under investigation is invisible to local wall-clock (#1693), while V8's own
 * decisions — tier, deopts, inlining — and its GC activity are observable
 * without a trustworthy timer.
 *
 * The shape reproduces `navigate/sync-baseline`: three guard-free routes,
 * navigated in a cycle, warmup then measure.
 *
 * Driven by `scripts/probe-1728-jit.sh`, which runs it once per configuration
 * under the V8 tracing flags and keeps the logs side by side.
 *
 * ⚠ Run it where the effect lives. Measured 2026-08-09 on `arm64` / Darwin: the
 * two configurations are indistinguishable by tier, deopt count, inlining set,
 * GC counts and wall-clock alike — the regression was recorded on the
 * self-hosted `Linux X64` runner, and a different backend generates different
 * code. A local run answers a question about a different binary.
 */
import { createRouter } from "../../src";

// argv rather than env: an env var read from a linted file has to be
// declared in the root `turbo.json`, and a throwaway probe has no business
// in the build graph's cache key.
const ITERATIONS = Number(process.argv[2] ?? 400_000);
const WARMUP = Number(process.argv[3] ?? 80_000);

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "users", path: "/users" },
  ]);

  await router.start("/");

  const targets = ["about", "users", "home"] as const;
  let i = 0;

  // ⚑ Markers on stderr, where V8's own `--trace-opt` output goes, so the two
  // interleave: the marker preceding a `completed compiling … TURBOFAN_JS` line
  // says HOW MANY navigations it took that build to reach the top tier. That is
  // the quantity the window hypothesis is about — a benchmark measures a window,
  // and a build still climbing tiers inside it is measured climbing.
  const MARK_EVERY = 500;
  let navigations = 0;

  const spin = (n: number): void => {
    for (let k = 0; k < n; k++) {
      void router.navigate(targets[i++ % targets.length]);

      navigations += 1;

      if (navigations % MARK_EVERY === 0) {
        process.stderr.write(`[mark] ${navigations}\n`);
      }
    }
  };

  spin(WARMUP);

  const started = process.hrtime.bigint();

  spin(ITERATIONS);

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  console.log(
    `[probe] ${elapsedMs.toFixed(1)} ms for ${ITERATIONS} navigations ` +
      `(${((elapsedMs * 1e6) / ITERATIONS).toFixed(0)} ns each), ` +
      `state=${router.getState()?.name}`,
  );
}

// Not top-level `await`: the package is CJS, so esbuild refuses it. `void` on a
// promise nobody awaits is fine here — the process has nothing else to do.
void main();
