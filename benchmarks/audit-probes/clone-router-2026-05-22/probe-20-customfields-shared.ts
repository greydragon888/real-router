/**
 * Probe 20: VERIFY — routeCustomFields shared refs.
 *
 * cloneRouter.ts:74 — Object.assign(newStore.routeCustomFields, routeCustomFields).
 * Shallow copy: each per-route customFields object is shared.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const base = createRouter([
    {
      name: "withMeta",
      path: "/meta",
      // Custom field on Route definition (not standard key)
      meta: { title: "Page", icon: "🏠" } as never,
    },
  ]);

  const clone = cloneRouter(base);

  const baseCustom = getInternals(base).routeGetStore().routeCustomFields.withMeta;
  const cloneCustom = getInternals(clone).routeGetStore().routeCustomFields.withMeta;

  console.log("baseCustom:", baseCustom);
  console.log("cloneCustom:", cloneCustom);
  console.log("baseCustom === cloneCustom:", baseCustom === cloneCustom);

  // Mutate clone
  if (cloneCustom) {
    (cloneCustom.meta as Record<string, unknown>).leaked = true;
  }

  console.log("\nAfter mutating cloneCustom.meta.leaked = true:");
  console.log("baseCustom.meta:", baseCustom?.meta);

  if (baseCustom === cloneCustom || (baseCustom?.meta as Record<string, unknown>).leaked) {
    console.log("\n→ Bug CONFIRMED: routeCustomFields shared.");
    process.exitCode = 1;
  } else {
    console.log("\n→ No leak.");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
