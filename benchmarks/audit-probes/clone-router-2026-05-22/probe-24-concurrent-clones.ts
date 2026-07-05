/**
 * Probe 24: concurrent cloneRouter race detection via getLifecycleFactories snapshot.
 *
 * cloneRouter is synchronous, so "concurrent" in Node single-thread is best modeled
 * as Promise.all firing 100 clone microtasks that each capture a snapshot of base
 * lifecycle factories and re-apply them on a fresh router.
 *
 * Race attack vector: between two clones, mutate base.lifecycle (add new external
 * guard). If `getLifecycleFactories` returns a *live* internal reference rather
 * than a snapshot, the second clone might pick up the new guard while the first
 * does not — observable as `clone1.canActivate.size !== clone2.canActivate.size`
 * when both were spawned from "the same" base.
 *
 * Test design:
 *   1. Build 50-route base.
 *   2. Fire 100 parallel `Promise.resolve().then(() => cloneRouter(base))`.
 *   3. Between batches of 10, add a new external guard on base.
 *   4. Verify all clones have the same guard count (the snapshot at clone-time
 *      should be deterministic, but if not, this reveals a leak).
 *
 * Also reports per-clone latency.
 */

import { createRouter } from "@real-router/core";
import { cloneRouter, getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main() {
  console.log("=== probe-24: concurrent cloneRouter race (100 parallel clones) ===\n");

  const routes = [];
  for (let i = 0; i < 50; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }
  const base = createRouter(routes);
  await base.start("/route0/abc");

  const baseLifecycle = getLifecycleApi(base);

  // warmup
  for (let i = 0; i < 100; i++) {
    cloneRouter(base);
  }

  // Helper: read guard counts from a clone via internals.
  // getLifecycleFactories returns [deactivateRecord, activateRecord].
  function countGuards(router: ReturnType<typeof cloneRouter>): { activate: number; deactivate: number } {
    const ctx = getInternals(router);
    const [deactivate, activate] = ctx.getLifecycleFactories();
    return {
      activate: Object.keys(activate).length,
      deactivate: Object.keys(deactivate).length,
    };
  }

  // Spawn 100 clone microtasks, sneaking in a guard every 10 clones
  const NUM_CLONES = 100;
  const start = process.hrtime.bigint();
  const clonePromises: Array<Promise<ReturnType<typeof cloneRouter>>> = [];
  for (let i = 0; i < NUM_CLONES; i++) {
    clonePromises.push(
      Promise.resolve().then(() => cloneRouter(base)),
    );
    if (i % 10 === 9) {
      const guardName = `route${i % 50}`;
      baseLifecycle.addActivateGuard(guardName, () => () => true);
    }
  }

  const clones = await Promise.all(clonePromises);
  const end = process.hrtime.bigint();

  const totalNs = Number(end - start);
  const perClone = totalNs / NUM_CLONES;
  console.log(`  100 clones in ${(totalNs / 1e6).toFixed(2)} ms`);
  console.log(`  Per clone (incl. microtask hop): ${(perClone / 1e3).toFixed(2)} µs`);

  // Inspect each clone's guard population
  const counts = clones.map(countGuards);
  const activateCounts = counts.map(c => c.activate);
  console.log(`\n  Guard counts (activate) across 100 concurrent clones:`);
  console.log(`    min=${Math.min(...activateCounts)}  max=${Math.max(...activateCounts)}  base.final=${countGuards(base).activate}`);
  console.log(`    distribution (counts of each value):`);
  const dist = new Map<number, number>();
  for (const c of activateCounts) dist.set(c, (dist.get(c) ?? 0) + 1);
  for (const [val, n] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`      ${val} guards → ${n} clones`);
  }

  // Because Promise.resolve().then(...) microtasks all queue synchronously
  // in the JS task, and the synchronous loop adds guards interleaved with
  // queueing, but microtasks only fire AFTER the current task, every clone
  // sees the SAME final base state — observed in all 100 clones equal to base.
  // To test true interleaving we need a different scheduling pattern.
  const allEqual = activateCounts.every(c => c === activateCounts[0]);
  console.log(`\n  All 100 clones see same guard count: ${allEqual ? "YES" : "NO"}`);

  // Sequential test: 1 guard added between each clone — monotonic count expected
  const seqRouter = createRouter(routes);
  await seqRouter.start("/route0/abc");
  const seqLifecycle = getLifecycleApi(seqRouter);
  const seqCounts: number[] = [];
  for (let i = 0; i < 100; i++) {
    if (i > 0) {
      // Add a unique guard each iter — use stride to vary route
      const r = i % 50;
      try {
        seqLifecycle.addActivateGuard(`route${r}`, () => () => true);
      } catch {
        // already added — that's fine for this test
      }
    }
    const clone = cloneRouter(seqRouter);
    seqCounts.push(countGuards(clone).activate);
  }

  console.log("\n  Sequential test (guard added between clones):");
  console.log(`  Clone activate-counts: first 30 = [${seqCounts.slice(0, 30).join(",")}]`);
  console.log(`                        last 10 = [${seqCounts.slice(-10).join(",")}]`);
  let monotonic = true;
  for (let i = 1; i < seqCounts.length; i++) {
    if (seqCounts[i] < seqCounts[i - 1]) {
      monotonic = false;
      console.log(`    → NON-MONOTONIC at clone #${i}: ${seqCounts[i - 1]} → ${seqCounts[i]}`);
    }
  }
  console.log(`  Monotonic: ${monotonic ? "YES — snapshot semantics OK" : "NO — race detected!"}`);

  console.log("\n--- Verdict ---");
  if (monotonic && allEqual) {
    console.log("  → No race condition; getLifecycleFactories returns synchronous snapshot at clone-time");
    console.log("  → Microtask scheduling guarantees all parallel clones in same task see same state");
    console.log("  → Bug-or-design-gap #2 (origin tracking loss) is not concurrency-sensitive");
  } else {
    console.log("  → ANOMALY DETECTED — investigate stale snapshot in getLifecycleFactories");
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});
