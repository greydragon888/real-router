/**
 * Probe 12: VERIFY — plugin teardown isolation.
 *
 * Issue: clone re-instantiates plugins. But the plugin FACTORY is the same
 * reference (cloneRouter.ts:61 — `newRouter.usePlugin(...pluginFactories)`).
 * If the factory's closure references shared state (e.g., a module-level counter,
 * or a singleton resource), teardown in clone might mutate that shared state,
 * affecting original.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

async function main(): Promise<void> {
  // Simulate a plugin with shared resource (module-level counter)
  let sharedResourceCount = 0;

  const myFactory = () => {
    sharedResourceCount++;

    return {
      teardown() {
        sharedResourceCount--;
      },
    };
  };

  const base = createRouter([{ name: "home", path: "/" }]);

  base.usePlugin(myFactory);
  console.log("After base.usePlugin: sharedResourceCount =", sharedResourceCount);

  const clone = cloneRouter(base);

  console.log("After cloneRouter: sharedResourceCount =", sharedResourceCount);

  await clone.start("/");

  clone.dispose();
  console.log("After clone.dispose: sharedResourceCount =", sharedResourceCount);

  // Question: did clone.dispose() decrement the SHARED counter (factory closure),
  // affecting base's plugin state?
  if (sharedResourceCount === 1) {
    console.log("→ Acceptable: clone tear down decremented its own claim. Base still has count=1.");
  } else if (sharedResourceCount === 0) {
    console.log("→ Bug-or-design: shared counter went to 0 — base's claim is GONE.");
    console.log("  Base plugin still alive but the shared resource it depends on is invalidated.");
  } else {
    console.log("→ Unexpected:", sharedResourceCount);
  }

  // Verify base still works
  await base.start("/");
  console.log("\nbase.isActive() after clone disposed:", base.isActive());
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
