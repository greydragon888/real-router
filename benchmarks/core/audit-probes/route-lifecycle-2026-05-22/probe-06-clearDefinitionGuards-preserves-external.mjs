// Probe-06: clearDefinitionGuards() preserves external guards. Cross-cutting
// matrix row — must be verified for HMR safety.
//
// Setup:
//   - Route "admin" with canActivate in config (DEFINITION guard, returns false → blocks)
//   - External addDeactivateGuard("home", ...) (returns false → blocks leave)
//   - External addActivateGuard("users", ...) (returns false → blocks)
// After clearDefinitionGuards():
//   - admin should be navigable (definition cleared)
//   - home should still be sticky (external survives)
//   - users should still be blocked (external survives)

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "products", path: "/products" },
  {
    name: "admin",
    path: "/admin",
    canActivate: () => () => false, // DEFINITION blocking
  },
]);
await router.start("/users"); // current = users, not home — avoids deactivate-home blocking

const lifecycle = getLifecycleApi(router);

lifecycle.addDeactivateGuard("home", () => () => false); // EXTERNAL sticky leave (not active on /users)
lifecycle.addActivateGuard("products", () => () => false); // EXTERNAL blocking activate

console.log("[Probe-06] Before clearDefinitionGuards (current route=users):");
console.log("  admin navigable:", router.canNavigateTo("admin"));
console.log("  products navigable:", router.canNavigateTo("products"));

const ns = getInternals(router).routeGetStore().lifecycleNamespace;
ns.clearDefinitionGuards();

const adminAfter = router.canNavigateTo("admin");
const productsAfter = router.canNavigateTo("products");

console.log("\n[Probe-06] After clearDefinitionGuards:");
console.log("  admin navigable (definition cleared, expected TRUE):", adminAfter);
console.log("  products navigable (external survives, expected FALSE):", productsAfter);

// Direct internal-state inspection via getFunctions
const [d, a] = ns.getFunctions();
console.log("\n[Probe-06] Internal Maps after clearDefinitionGuards:");
console.log("  activate Map keys:", [...a.keys()]);
console.log("  deactivate Map keys:", [...d.keys()]);

const ok = adminAfter && !productsAfter;
if (ok) {
  console.log("\n→ VERIFIED: clearDefinitionGuards preserves external, clears definition.");
  process.exitCode = 0;
} else {
  console.log("\n→ BUG: clearDefinitionGuards behaves incorrectly.");
  process.exitCode = 1;
}
