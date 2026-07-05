/**
 * Probe 14: VERIFY — routerExtensions array isolation.
 *
 * Router.ts:273: `routerExtensions: []` — each Router instance has its own array.
 * cloneRouter doesn't explicitly copy these. Let's verify:
 *  - base.routerExtensions === clone.routerExtensions? Should be FALSE.
 *  - If a plugin re-instantiates and calls extendRouter, clone's array gets the
 *    extension, base's does not.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }]);

  base.usePlugin((router) => {
    const api = getPluginApi(router);

    api.extendRouter({ ext1: () => "ext1" });

    return {};
  });

  const baseInt = getInternals(base);

  console.log("base.routerExtensions.length:", baseInt.routerExtensions.length);
  console.log("base.routerExtensions[0].keys:", baseInt.routerExtensions[0]?.keys);

  const clone = cloneRouter(base);
  const cloneInt = getInternals(clone);

  console.log("\nclone.routerExtensions.length:", cloneInt.routerExtensions.length);
  console.log("base.routerExtensions === clone.routerExtensions:",
    baseInt.routerExtensions === cloneInt.routerExtensions);

  // Mutate clone's array
  cloneInt.routerExtensions.push({ keys: ["test-leak"] });
  console.log("\nAfter cloneInt.routerExtensions.push:");
  console.log("base.routerExtensions.length:", baseInt.routerExtensions.length);

  if (baseInt.routerExtensions.length > 1) {
    console.log("→ Bug CONFIRMED: routerExtensions array SHARED.");
    process.exitCode = 1;
  } else {
    console.log("→ No leak.");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
