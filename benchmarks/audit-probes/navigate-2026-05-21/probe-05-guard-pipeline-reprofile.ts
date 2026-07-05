/**
 * Probe 05: guard-pipeline re-profile @ current HEAD — #938 follow-up (2026-06-27).
 *
 * Context. probe-02 (2026-05-21, measured against **dist**) reported that adding the
 * first guard costs ~4.6 µs (×9.7 over the ~535 ns no-guards baseline), and that a
 * sync guard costs almost as much as an async one. #938 asked to profile
 * `executeGuardPipeline` with a flame graph and explain that sync ≈ async puzzle.
 *
 * Two flaws made the original picture misleading:
 *
 *   1. **Stale.** The guard path changed substantially after 2026-05-21 (boolean-factory
 *      cache #962, sync-guard observability/parity #970/#958/#959, error-flow refactors
 *      #933/#947/#948/#949, …). The ~4.6 µs no longer reproduces at current HEAD.
 *
 *   2. **Contended async variant.** probe-02 fired navigates fire-and-forget
 *      (`void router.navigate(...)`) in mitata's sync loop, so the async variant fired the
 *      next navigate before the previous async pipeline resolved — every async sample
 *      carried a `#abortPreviousNavigation` cancellation (the flood of "Concurrent
 *      navigation detected" warnings). probe-02 itself flagged C-B as `[NOISE — contended]`.
 *      So "sync ≈ async" was a measurement artifact, never a real cost.
 *
 * This probe fixes both: it re-measures at current HEAD and AWAITS each navigate, so the
 * async pipeline drains between iterations (no contention, no warnings). All three variants
 * are measured with the identical awaited harness, so the deltas are clean.
 *
 * Run BOTH ways (resolution is chosen by the runner, not the probe):
 *   - dist (what ships):  npx tsx <this file>
 *   - src  (live source): NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx <this file>
 *
 * Finding (see RESULTS.md § probe-05): against current **dist**, B−A (sync-guard overhead)
 * is ~0.2 µs and **below the noise floor** — the ~4.6 µs / ×9.7 premise of #938 is gone.
 * Awaited async (C) is also cheap once the contention is removed; sync ≈ async holds only
 * in the trivial sense that both are now near-free.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

interface Stats {
  avg: number;
  p50: number;
  stddev: number;
}

/** Batched, awaited measurement: K batches × M awaited navigates each. */
async function measureAwaited(
  navigateOnce: () => Promise<unknown>,
  { warmup = 4000, batches = 40, batchSize = 2000 } = {},
): Promise<Stats> {
  // Warmup — let V8 tier up and settle ICs before timing.
  for (let i = 0; i < warmup; i++) {
    try {
      await navigateOnce();
    } catch {
      /* same-state rejection / block — irrelevant to timing */
    }
  }

  const batchMeansNs: number[] = [];

  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();

    for (let i = 0; i < batchSize; i++) {
      try {
        await navigateOnce();
      } catch {
        /* ignore */
      }
    }

    const t1 = performance.now();

    batchMeansNs.push(((t1 - t0) * 1e6) / batchSize);
  }

  const n = batchMeansNs.length;
  const avg = batchMeansNs.reduce((s, x) => s + x, 0) / n;
  const variance = batchMeansNs.reduce((s, x) => s + (x - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const sorted = batchMeansNs.toSorted((a, c) => a - c);
  const p50 = sorted[Math.floor(n / 2)];

  return { avg, p50, stddev };
}

const fmt = (ns: number): string =>
  ns >= 1e3 ? `${(ns / 1e3).toFixed(2)} µs` : `${ns.toFixed(1)} ns`;

function report(name: string, s: Stats): void {
  console.log(
    `  ${name.padEnd(56)} avg=${fmt(s.avg)}  p50=${fmt(s.p50)}  σ=${fmt(s.stddev)}`,
  );
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

/**
 * Ping-pong starting at `about` (router boots at `home` via start("/")), so every
 * navigate is a real transition — no same-state no-ops to pollute the measurement.
 */
function makeNavigator(
  router: ReturnType<typeof createRouter>,
): () => Promise<unknown> {
  const names = ["about", "home"];
  let i = 0;

  return () => router.navigate(names[i++ & 1]);
}

async function main(): Promise<void> {
  console.log(
    "=== probe-05: guard-pipeline re-profile @ current HEAD (awaited, uncontended) ===\n",
  );

  // A. No guards (sync hot path baseline).
  let resultA: Stats;

  {
    const router = createRouter(routes);

    await router.start("/");
    resultA = await measureAwaited(makeNavigator(router));
    report("A. navigate, no guards", resultA);
  }

  // B. 1 sync guard returning true (still sync pipeline).
  let resultB: Stats;

  {
    const router = createRouter(routes);
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("home", () => () => true);
    lifecycle.addActivateGuard("about", () => () => true);
    await router.start("/");
    resultB = await measureAwaited(makeNavigator(router));
    report("B. navigate, 1 sync guard", resultB);
  }

  // C. 1 async guard returning Promise.resolve(true) — awaited, so NO contention.
  let resultC: Stats;

  {
    const router = createRouter(routes);
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("home", () => () => Promise.resolve(true));
    lifecycle.addActivateGuard("about", () => () => Promise.resolve(true));
    await router.start("/");
    resultC = await measureAwaited(makeNavigator(router));
    report("C. navigate, 1 async guard (awaited)", resultC);
  }

  console.log("\n--- Verdict ---");

  const syncGuard = resultB.avg - resultA.avg;
  const asyncBranch = resultC.avg - resultB.avg;
  const noiseAB = 2 * Math.max(resultA.stddev, resultB.stddev);
  const noiseBC = 2 * Math.max(resultB.stddev, resultC.stddev);

  console.log(
    `  Sync-guard overhead   (B-A): ${syncGuard.toFixed(1)} ns  (noise floor ${noiseAB.toFixed(1)} ns)${
      Math.abs(syncGuard) < noiseAB ? "  → [НЕ ПОДТВЕРЖДЕНО]" : ""
    }`,
  );
  console.log(
    `  Async-branch overhead (C-B): ${asyncBranch.toFixed(1)} ns  (noise floor ${noiseBC.toFixed(1)} ns)${
      Math.abs(asyncBranch) < noiseBC ? "  → [НЕ ПОДТВЕРЖДЕНО]" : ""
    }`,
  );
  console.log(
    `\n  0→1-guard total (C-A): ${(resultC.avg - resultA.avg).toFixed(1)} ns` +
      `  — cf. probe-02 dist@2026-05-21 reported ~4.6 µs for B-A alone.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
