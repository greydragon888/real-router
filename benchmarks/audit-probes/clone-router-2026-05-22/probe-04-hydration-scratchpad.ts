/**
 * Probe 04: VERIFY — Hydration scratchpad #596 leak in clone.
 *
 * Issue: `RouterInternals.hydrationState` is set by `hydrateRouter` immediately
 * before `router.start()` and cleared in `finally`. If somehow cloneRouter is
 * called between set and clear (e.g., from inside a plugin's start interceptor),
 * the new internals registered for the clone would have `hydrationState: null`
 * (fresh constructor — Router.ts:275). Good. Verify.
 *
 * Question: does cloneRouter explicitly forward hydrationState? It shouldn't.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }]);

  // Simulate hydrateRouter setting scratchpad
  const internals = getInternals(base);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (internals as any).hydrationState = {
    path: "/",
    name: "home",
    params: {},
    context: { data: { home: { stale: "from-previous-request" } } },
    transition: { phase: "activating", reason: "success", from: undefined, segments: { deactivated: [], activated: ["home"], intersection: "" } },
  };

  console.log("--- Before clone ---");
  console.log("base.hydrationState set:", internals.hydrationState !== null);

  const clone = cloneRouter(base);
  const cloneInternals = getInternals(clone);

  console.log("\n--- After clone ---");
  console.log("base.hydrationState still set:", internals.hydrationState !== null);
  console.log("clone.hydrationState:", cloneInternals.hydrationState);
  console.log("clone.hydrationState === null:", cloneInternals.hydrationState === null);

  if (cloneInternals.hydrationState === null) {
    console.log("\n→ No leak: clone gets fresh null scratchpad (Bug REFUTED — happy path).");
    process.exitCode = 0;
  } else {
    console.log("\n→ Bug CONFIRMED: clone inherits hydrationState from base.");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
