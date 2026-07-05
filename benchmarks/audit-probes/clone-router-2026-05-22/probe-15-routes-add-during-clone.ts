/**
 * Probe 15: VERIFY — addRoute via runtime API after start: does it transfer to clone?
 *
 * Question: cloneRouter.ts:28 reads `routeTreeToDefinitions(sourceStore.tree)`.
 * If routes were added via `getRoutesApi(router).add(...)` POST-start, they're
 * in the tree. So they should transfer.
 *
 * Similarly, routes REMOVED via removeRoute - they're not in the tree, so they
 * don't transfer.
 *
 * Verify both happy paths.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([
    { name: "home", path: "/" },
    { name: "removable", path: "/removable" },
  ]);

  await base.start("/");

  // Runtime additions
  getRoutesApi(base).add({ name: "dynamic", path: "/dynamic" });
  getRoutesApi(base).remove("removable");

  console.log("--- Base after runtime add/remove ---");
  console.log("has 'dynamic':", getRoutesApi(base).has("dynamic"));
  console.log("has 'removable':", getRoutesApi(base).has("removable"));

  const clone = cloneRouter(base);

  console.log("\n--- Clone ---");
  console.log("has 'home':", getRoutesApi(clone).has("home"));
  console.log("has 'dynamic':", getRoutesApi(clone).has("dynamic"));
  console.log("has 'removable':", getRoutesApi(clone).has("removable"));
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
