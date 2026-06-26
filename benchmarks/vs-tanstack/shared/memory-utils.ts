export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

export interface RoundResult {
  round: number;
  navigations: number;
  snapshot: MemorySnapshot;
  delta: number;
}

export interface MemoryReport {
  router: string;
  baseline: MemorySnapshot;
  rounds: RoundResult[];
  summary: {
    totalNavigations: number;
    heapPerNavigation: number;
    leakSuspected: boolean;
    finalRss: number;
    crashed: boolean;
  };
}

export function forceGC(): void {
  const gc = (globalThis as Record<string, unknown>).gc as
    | (() => void)
    | undefined;

  if (typeof gc !== "function") {
    throw new TypeError(
      "gc() is not available. Run with NODE_OPTIONS='--expose-gc'",
    );
  }

  gc();
  gc(); // second pass for weak refs and weak ref dependent clean ups
}

export function takeSnapshot(): MemorySnapshot {
  forceGC();

  const mem = process.memoryUsage();

  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external,
  };
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);

  if (abs < 1024) {
    return `${bytes} B`;
  }

  if (abs < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Leak heuristic: if the last two rounds still show growing deltas
 * (both positive and not decreasing), suspect a leak.
 * A stabilizing heap shows decreasing or near-zero deltas.
 */
function detectLeak(rounds: RoundResult[]): boolean {
  if (rounds.length < 3) {
    return false;
  }

  const last = rounds.at(-1)!.delta;
  const prev = rounds.at(-2)!.delta;

  // Both still growing AND not converging toward zero
  return last > 0 && prev > 0 && last >= prev * 0.9;
}

export function buildReport(
  router: string,
  baseline: MemorySnapshot,
  rounds: RoundResult[],
  crashed: boolean,
): MemoryReport {
  const totalNavs = rounds.reduce((sum, r) => sum + r.navigations, 0);
  const totalHeapGrowth =
    (rounds.at(-1)?.snapshot.heapUsed ?? baseline.heapUsed) - baseline.heapUsed;

  return {
    router,
    baseline,
    rounds,
    summary: {
      totalNavigations: totalNavs,
      heapPerNavigation: totalNavs > 0 ? totalHeapGrowth / totalNavs : 0,
      leakSuspected: detectLeak(rounds),
      finalRss: rounds.at(-1)?.snapshot.rss ?? baseline.rss,
      crashed,
    },
  };
}

export function printReport(report: MemoryReport): void {
  const { baseline, rounds, summary } = report;

  console.log(`\n=== Memory Report: ${report.router} ===\n`);

  console.log("Baseline (after router.start):");
  console.log(`  heapUsed: ${formatBytes(baseline.heapUsed)}`);
  console.log(`  rss:      ${formatBytes(baseline.rss)}\n`);

  console.log(`Navigation rounds (${rounds[0]?.navigations ?? 0} navs each):`);

  for (const round of rounds) {
    const sign = round.delta >= 0 ? "+" : "";

    console.log(
      `  Round ${round.round}: heapUsed ${sign}${formatBytes(round.delta).padStart(10)}  (${formatBytes(round.snapshot.heapUsed)} total)`,
    );
  }

  console.log("\nSummary:");
  console.log(
    `  Heap per navigation: ~${Math.round(summary.heapPerNavigation)} bytes (avg over ${summary.totalNavigations} navs)`,
  );
  console.log(
    `  Leak suspected:      ${summary.leakSuspected ? "YES — heap still growing in last rounds" : "no"}`,
  );
  console.log(`  Final RSS:           ${formatBytes(summary.finalRss)}`);

  if (summary.crashed) {
    console.log("  ⚠ Crashed before completing all rounds (partial results)");
  }

  console.log(`\n${JSON.stringify(report)}`);
}

export interface RunMemoryBenchmarkOptions {
  router: string;
  setup: () => {
    before: () => Promise<void>;
    tick: () => Promise<void>;
    after: () => void;
  };
  warmupNavs?: number;
  rounds?: number;
  navsPerRound?: number;
}

export async function runMemoryBenchmark({
  router,
  setup,
  warmupNavs = 200,
  rounds = 5,
  navsPerRound = 1000,
}: RunMemoryBenchmarkOptions): Promise<void> {
  const test = setup();

  await test.before();

  for (let i = 0; i < warmupNavs; i++) {
    await test.tick();
  }

  const baseline = takeSnapshot();
  const results: RoundResult[] = [];
  let crashed = false;

  try {
    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < navsPerRound; i++) {
        await test.tick();
      }

      const snapshot = takeSnapshot();
      const prev = results.at(-1)?.snapshot ?? baseline;

      results.push({
        round,
        navigations: navsPerRound,
        snapshot,
        delta: snapshot.heapUsed - prev.heapUsed,
      });
    }
  } catch (error) {
    crashed = true;

    if (error instanceof RangeError) {
      console.error(
        `\n⚠ Crashed at round ${results.length + 1}: ${error.message}`,
      );
    } else {
      throw error;
    }
  }

  const report = buildReport(router, baseline, results, crashed);

  printReport(report);

  try {
    test.after();
  } catch {
    // TanStack may throw stack overflow during cleanup —
    // see TANSTACK_STACK_OVERFLOW.md
  }
}
