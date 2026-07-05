/**
 * Probe 13: VERIFY — claimContextNamespace records: do orphans linger in clone?
 *
 * Issue: if a plugin in base claimed "data" namespace, clone receives a fresh
 * Set in Router.ts:274 (contextClaimRecords = new Set()). Plugin re-instantiates
 * via cloneRouter.ts:61 → re-claims "data". But what if the original plugin
 * claimed via `claimContextNamespace` lazily (not in factory but in onStart)?
 *
 * In clone, onStart fires only on `start()`. Before start, contextClaimRecords
 * is empty. After start, plugin claims. So:
 *   - Clone is created in IDLE
 *   - Clone state.context is empty
 *   - Clone.start() → plugin re-claims namespace
 *
 * Verify also: contextClaimRecords on original are isolated (no shared Set).
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }]);

  base.usePlugin((router) => {
    const api = getPluginApi(router);

    api.claimContextNamespace("data");

    return {};
  });

  const baseInternals = getInternals(base);

  console.log("base.contextClaimRecords:", [...baseInternals.contextClaimRecords]);

  const clone = cloneRouter(base);
  const cloneInternals = getInternals(clone);

  console.log("clone.contextClaimRecords:", [...cloneInternals.contextClaimRecords]);
  console.log("base.contextClaimRecords === clone.contextClaimRecords:",
    baseInternals.contextClaimRecords === cloneInternals.contextClaimRecords);

  // Mutate clone's set — does it affect base?
  cloneInternals.contextClaimRecords.add("test-mutation");
  console.log("\nAfter cloneInternals.contextClaimRecords.add('test-mutation'):");
  console.log("base.contextClaimRecords:", [...baseInternals.contextClaimRecords]);

  if (baseInternals.contextClaimRecords.has("test-mutation")) {
    console.log("→ Bug CONFIRMED: contextClaimRecords SHARED ref between base and clone.");
    process.exitCode = 1;
  } else {
    console.log("→ No leak: contextClaimRecords are separate Sets.");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
