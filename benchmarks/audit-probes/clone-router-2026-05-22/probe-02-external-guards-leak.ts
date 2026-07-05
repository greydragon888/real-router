/**
 * Probe 02: VERIFY — External guards (addCanActivate after start) leak to clone.
 *
 * Hypothesis: external guards registered via `getLifecycleApi(router).addActivateGuard(...)`
 * AFTER router.start() are stored in the same `#canActivateFactories` Map as
 * definition guards. `cloneRouter` reads ALL factories via getLifecycleFactories()
 * and re-applies them on clone. So external guards from a *previous request* in
 * SSR-multi-tenant will be REPLAYED on the new clone — and via re-registration
 * through getLifecycleApi.addActivateGuard, they are NOT marked as fromDefinition.
 *
 * Two questions:
 * 1) Do external guards copy over? (YES if all factories copy)
 * 2) Even if yes — does the original router's external guard reference any
 *    captured per-request state via closure? (That's the leak vector.)
 *
 * Security impact: imagine an Auth-plugin that adds an `addCanActivate("admin", ...)`
 * with a closure capturing `userSession`. If the base router had a stale session
 * captured at some past clone, it would persist into all clones.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getLifecycleApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([
    { name: "home", path: "/" },
    { name: "admin", path: "/admin" },
  ]);

  await base.start("/");

  // Simulate: SSR boot added an external guard with closure over per-request state
  let requestUserId = "user-A";
  const externalGuard = (): (() => boolean) => () => {
    console.log(`  [guard] saw userId=${requestUserId}`);

    return requestUserId === "user-A";
  };

  getLifecycleApi(base).addActivateGuard("admin", externalGuard);

  // Now CLONE the router. Does the external guard come along?
  const clone = cloneRouter(base);

  await clone.start("/");

  console.log("--- Clone canNavigateTo('admin') with userId=user-A ---");
  const result1 = clone.canNavigateTo("admin");

  console.log("  result:", result1);

  // Mutate per-request closure state — would simulate "next request"
  requestUserId = "user-B";

  console.log("\n--- After requestUserId mutated to 'user-B' (simulating next request reusing the same closure) ---");
  const result2 = clone.canNavigateTo("admin");

  console.log("  result:", result2);

  // Verdict
  console.log("\n--- Verdict ---");
  console.log("Question 1: Did external guard from original router carry over to clone?");
  console.log("  Yes if guard fired (look for [guard] log lines).");
  console.log("Question 2: Does the clone share the SAME closure → SAME captured state?");
  console.log("  If result2 === false (rejected after mutation), then yes — leak confirmed.");

  if (result2 === false) {
    console.log("→ Bug CONFIRMED: External guards from original share closure refs in clone.");
    console.log("  SSR multi-tenant: clone inherits guards that close over previous request state.");
    process.exitCode = 1;
  } else {
    console.log("→ Bug REFUTED (or test inconclusive).");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
