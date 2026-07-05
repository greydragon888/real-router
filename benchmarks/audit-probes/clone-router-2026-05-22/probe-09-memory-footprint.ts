/**
 * Probe 09: MEMORY — per-clone footprint (#966).
 *
 * Finding: a clone retains ≈ the cost of a FRESH independent N-route router.
 * This probe measures BOTH and compares (clone / fresh ratio). The earlier
 * "20-80KB template" target was aspirational and never reflected an
 * independent-instance cost — a clone deliberately rebuilds its own tree +
 * matcher + namespaces so route-CRUD on a clone cannot touch the base
 * (isolation). So the health check is "clone ≈ fresh createRouter", NOT a fixed
 * KB band: a clone that costs ≫ a fresh router would mean real excess; a clone
 * that costs ≈ a fresh router is paying only the unavoidable independent-
 * instance price (measured ~173KB vs ~175KB for 50 routes — clone is in fact a
 * touch cheaper). No safe reduction exists without sharing the tree, which would
 * break per-clone route-CRUD isolation.
 *
 * Battery-OK: heap-snapshot probe is not CPU-throttle-sensitive.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

function makeRoutes(): { name: string; path: string }[] {
  const routes: { name: string; path: string }[] = [];

  for (let i = 0; i < 50; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }

  return routes;
}

/** Retained heap per instance, holding all N alive until after the snapshot. */
function perInstance(label: string, factory: () => unknown, n: number): number {
  global.gc?.();

  const before = process.memoryUsage().heapUsed;
  const held: unknown[] = [];

  for (let i = 0; i < n; i++) {
    held.push(factory());
  }

  global.gc?.();

  const after = process.memoryUsage().heapUsed;
  const per = (after - before) / n;

  // Reference `held` after the snapshot so it is not GC'd prematurely.
  console.log(
    `${label.padEnd(26)} ~${(per / 1024).toFixed(2)} KB/instance (held ${held.length})`,
  );

  return per;
}

async function main(): Promise<void> {
  const base = createRouter(makeRoutes());

  await base.start("/route0/abc");

  if (typeof global.gc !== "function") {
    console.log(
      "Run with NODE_OPTIONS='--expose-gc' for accurate measurements.",
    );
  }

  const N = 1000;

  console.log("--- Memory probe (50 routes, 1000 instances each) ---");

  // Baseline: a fresh, fully independent 50-route router — the floor cost of an
  // isolated instance (its own tree + matcher + namespaces).
  const freshPer = perInstance(
    "createRouter(50 routes)",
    () => createRouter(makeRoutes()),
    N,
  );
  // A per-request clone of the base.
  const clonePer = perInstance("cloneRouter(base)", () => cloneRouter(base), N);

  const ratio = clonePer / freshPer;

  console.log(`\nclone / fresh ratio: ${ratio.toFixed(2)}× (#966)`);
  if (ratio > 1.25) {
    console.log(
      "→ Clone ≫ fresh router: excess per-clone duplication beyond an independent instance — investigate.",
    );
  } else {
    console.log(
      "→ Clone ≈ fresh router: the footprint is the inherent cost of an independent N-route instance (rebuilt tree+matcher for route-CRUD isolation), not waste. The old 20-80KB 'template' target did not reflect this.",
    );
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
