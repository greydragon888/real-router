/**
 * Probe 09: MEMORY — per-clone footprint (target 20-80KB per scope template).
 *
 * Battery-OK: heap-snapshot probe is not CPU-throttle-sensitive.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

async function main(): Promise<void> {
  // 50-route fixture
  const routes = [];
  for (let i = 0; i < 50; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }

  const base = createRouter(routes);
  await base.start("/route0/abc");

  if (typeof global.gc !== "function") {
    console.log("Run with NODE_OPTIONS='--expose-gc' for accurate measurements.");
  }

  global.gc?.();

  const heapBefore = process.memoryUsage().heapUsed;
  const NUM_CLONES = 1000;
  const clones = [];

  for (let i = 0; i < NUM_CLONES; i++) {
    clones.push(cloneRouter(base));
  }

  global.gc?.();

  const heapAfter = process.memoryUsage().heapUsed;
  const totalDelta = heapAfter - heapBefore;
  const perClone = totalDelta / NUM_CLONES;

  console.log("--- Memory probe (50 routes, 1000 clones) ---");
  console.log(`heap before:    ${(heapBefore / 1024).toFixed(2)} KB`);
  console.log(`heap after:     ${(heapAfter / 1024).toFixed(2)} KB`);
  console.log(`total delta:    ${(totalDelta / 1024 / 1024).toFixed(3)} MB`);
  console.log(`per-clone:      ${perClone.toFixed(0)} bytes (~${(perClone / 1024).toFixed(2)} KB)`);

  const target_lo = 20 * 1024;
  const target_hi = 80 * 1024;

  console.log(`\nTarget: ${target_lo / 1024}-${target_hi / 1024} KB per clone (template).`);
  if (perClone < target_lo) {
    console.log("→ Below target. Either very efficient OR sharing what should be isolated (leak risk).");
  } else if (perClone > target_hi) {
    console.log("→ Above target. Possibly excessive duplication.");
  } else {
    console.log("→ In target range. Healthy.");
  }

  // Anti-leak: keep references alive so they're not GC'd prematurely
  console.log(`(Sample first clone has tree size: ${Object.keys(clones[0].getState() ?? {}).length})`);
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
