/**
 * Probe 19: VERIFY — wiki/clone.md:75 claims "defaultParams: Yes (Deep copy via structuredClone)"
 *
 * Reality: cloneRouter.ts:70 — Object.assign(newStore.config.defaultParams, routeConfig.defaultParams).
 * That's a SHALLOW copy: outer Record gets a fresh top-level, but inner params object
 * is shared by reference. Mutate clone's per-route defaultParams → base also affected.
 *
 * Wiki documentation drift.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const base = createRouter([
    {
      name: "paginated",
      path: "/paginated",
      defaultParams: { page: 1, sort: "name", nested: { deep: true } },
    },
  ]);

  const clone = cloneRouter(base);

  // Read the internal defaultParams object refs
  const baseDef = getInternals(base).routeGetStore().config.defaultParams.paginated;
  const cloneDef = getInternals(clone).routeGetStore().config.defaultParams.paginated;

  console.log("baseDef === cloneDef (per-route ref):", baseDef === cloneDef);
  console.log("baseDef.nested === cloneDef.nested:", baseDef?.nested === cloneDef?.nested);

  // Mutate clone's per-route defaultParams
  if (cloneDef && typeof cloneDef === "object") {
    (cloneDef as Record<string, unknown>).leaked = true;
  }

  console.log("\nAfter mutating cloneDef.leaked = true:");
  console.log("baseDef:", baseDef);
  console.log("cloneDef:", cloneDef);

  const leakDetected =
    baseDef === cloneDef ||
    (baseDef && (baseDef as Record<string, unknown>).leaked === true);

  console.log("\n--- Verdict ---");
  if (leakDetected) {
    console.log("→ Bug CONFIRMED: defaultParams per-route object is SHARED ref.");
    console.log("  Wiki claim 'Deep copy via structuredClone' is INCORRECT.");
    process.exitCode = 1;
  } else {
    console.log("→ defaultParams isolated. Wiki accurate.");
    process.exitCode = 0;
  }

  // For comparison, verify that the existing test 'deep clone defaultParams' uses
  // getRoutesApi(clone).update() — which is a different code path (update triggers
  // commitTreeChanges + rebuild).
  void getRoutesApi;
  void getPluginApi;
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
