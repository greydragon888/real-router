/**
 * Probe 18: VERIFY — concurrent cloneRouter race conditions.
 *
 * Hypothesis: 100 parallel cloneRouter calls. Verify each clone is structurally
 * sound. (race window in getLifecycleFactories / getPluginFactories — but they're
 * sync methods reading off Maps; no race in JS single-threaded event loop unless
 * a microtask intervenes.)
 *
 * Stronger test: addRoute() interleaved with cloneRouter (in the same event loop tick),
 * verify clones are deterministic.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }]);
  await base.start("/");

  // 100 parallel clones — verify all have the same routes
  const clones = Array.from({ length: 100 }, () => cloneRouter(base));
  const allHaveHome = clones.every((c) => getRoutesApi(c).has("home"));

  console.log("100 parallel clones: all have 'home':", allHaveHome);

  // Concurrent: interleave addRoute + clone
  const baseRoutes = getRoutesApi(base);

  for (let i = 0; i < 10; i++) {
    baseRoutes.add({ name: `runtime${i}`, path: `/runtime${i}` });
    const c = cloneRouter(base);

    // The clone should have all routes added so far
    for (let j = 0; j <= i; j++) {
      if (!getRoutesApi(c).has(`runtime${j}`)) {
        console.log(`  Clone after iteration ${i} MISSING runtime${j}`);
        process.exitCode = 1;
      }
    }
  }

  if (process.exitCode !== 1) {
    console.log("\n→ Concurrent addRoute + clone — all clones snapshot-correct.");
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
