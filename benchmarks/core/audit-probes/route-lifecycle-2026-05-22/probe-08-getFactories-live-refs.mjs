// Probe-08: getFactories() — returns NEW Records each call (line 212-223).
// Verify that mutating the returned record does NOT affect the namespace's
// internal Maps (would be a leak otherwise).
//
// Note: this is relevant for cloneRouter — clone-router audit Bug #2 was
// about origin-tracking loss in clone, NOT about live ref leak.

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "admin", path: "/admin" },
]);
await router.start("/");

const lifecycle = getLifecycleApi(router);
lifecycle.addActivateGuard("admin", () => () => true);

const ns = getInternals(router).routeGetStore().lifecycleNamespace;

const factories1 = ns.getFactories();
const factories2 = ns.getFactories();

console.log("[Probe-08] Identity per call:");
console.log("  outer tuple identity:", factories1 === factories2);
console.log("  deactivateRecord identity:", factories1[0] === factories2[0]);
console.log("  activateRecord identity:", factories1[1] === factories2[1]);

// They should be FRESH Records each call (line 212-213 in
// RouteLifecycleNamespace creates `const ... = {}`). So mutating the
// returned object doesn't leak.
const activateRecord = factories1[1];
const adminFactoryRef = activateRecord.admin;
delete activateRecord.admin;
activateRecord.injected = () => () => false;

const factories3 = ns.getFactories();
const stillHasAdmin = factories3[1].admin === adminFactoryRef;
const noInjection = !("injected" in factories3[1]);

console.log("\n[Probe-08] After mutating returned record:");
console.log("  namespace still has admin factory:", stillHasAdmin);
console.log("  injected key NOT propagated to namespace:", noInjection);

// Cross-clone implication: cloneRouter reads ALL factories together (definition+external)
// via this method — so it cannot distinguish origins, confirming
// clone-router audit Bug #2 (origin tracking lost).
const factoryReused = activateRecord !== factories3[1];
console.log("  fresh record per getFactories call:", factoryReused);

const ok = stillHasAdmin && noInjection && factoryReused;
if (ok) {
  console.log("\n→ VERIFIED: getFactories returns fresh Records — no live-ref leak.");
  console.log("  BUT the factory FUNCTION refs themselves are shared (closures).");
  console.log("  → cloneRouter audit Bug #2 root: combined definition+external in one Record,");
  console.log("    no origin tag → clone re-adds all as external via getLifecycleApi.");
  process.exitCode = 0;
} else {
  console.log("\n→ BUG: live-ref leak or stale identity.");
  process.exitCode = 1;
}
