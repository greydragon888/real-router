// Probe-03: clearCanActivate(name) origin-blind — the main UX trap.
//
// Question: when a user registers a route with `canActivate` in config
// (DEFINITION guard) and then later calls
// `getLifecycleApi(router).removeActivateGuard(name)` — does it clear the
// definition guard? Or only external guards?
//
// Expected (UX trap risk): removeActivateGuard is supposed to be the inverse
// of addActivateGuard (external). If it ALSO clears the definition guard from
// route config, that's surprising — the user expected to remove an external
// hook, not strip the route definition.
//
// Behaviour observed: clearCanActivate(name) deletes from factories Map,
// functions Map, AND definitionActivateGuardNames Set unconditionally.
// So removeActivateGuard clears definition guards too. This is what the
// replaceRoutes test at line 427-454 already proves with the comment
// «should have no stale entries after removeActivateGuard + replace».

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const router = createRouter([
  { name: "home", path: "/" },
  {
    name: "admin",
    path: "/admin",
    canActivate: () => () => false, // DEFINITION guard — blocks admin
  },
]);
await router.start("/");

const lifecycle = getLifecycleApi(router);

const blockedBefore = !router.canNavigateTo("admin");
console.log("[Probe-03] Definition canActivate blocks admin:", blockedBefore);

// Apply external removeActivateGuard — but the guard was NOT registered externally,
// it's from the route definition. Does removeActivateGuard clear it?
lifecycle.removeActivateGuard("admin");

const blockedAfter = !router.canNavigateTo("admin");
console.log("[Probe-03] After removeActivateGuard('admin') — still blocked?", blockedAfter);

if (!blockedAfter) {
  console.log(
    "\n→ VERIFIED [BEHAVIOUR]: removeActivateGuard CLEARS the definition guard too —",
  );
  console.log("   `clearCanActivate(name)` is ORIGIN-BLIND. User trap: a public",
  );
  console.log("   external-API removes definitions silently. Replace() then can't",
  );
  console.log("   restore it (clearDefinitionGuards iterates the Set which is now empty).",
  );
  process.exitCode = 1; // Bug-trap behaviour
} else {
  console.log(
    "\n→ Counter-evidence: removeActivateGuard preserves definitions (would be a separate Bug if true).",
  );
  process.exitCode = 0;
}

// Second scenario: external + definition coexist?
// addActivateGuard(name, h, false) AFTER addCanActivate via config — does the
// external add evict the definition Set entry?
const router2 = createRouter([
  { name: "home", path: "/" },
  {
    name: "admin",
    path: "/admin",
    canActivate: () => () => false, // DEFINITION
  },
]);
await router2.start("/");
const lifecycle2 = getLifecycleApi(router2);

const blockedDef = !router2.canNavigateTo("admin");
console.log("\n[Probe-03b] router2 admin blocked (definition):", blockedDef);

// External add — overwrites factory + clears definition Set entry (per addCanActivate:100)
lifecycle2.addActivateGuard("admin", () => () => true);

const allowedAfterExternal = router2.canNavigateTo("admin");
console.log("[Probe-03b] After external addActivateGuard true — allowed?:", allowedAfterExternal);

// Probe Set status: clearDefinitionGuards should now NOT clear admin because Set was reset.
const ns2 = (router2).getState; // sanity, ignored
// Call ns clearDefinitionGuards via routesStore
import("@real-router/core/validation").then(({ getInternals }) => {
  const ns = getInternals(router2).routeGetStore().lifecycleNamespace;
  ns.clearDefinitionGuards();
  const stillAllowed = router2.canNavigateTo("admin");
  console.log(
    "[Probe-03b] After clearDefinitionGuards — admin still allowed (external survives)?:",
    stillAllowed,
  );

  if (stillAllowed) {
    console.log(
      "→ VERIFIED: addCanActivate(name, h, false) re-classifies a previous definition as external —",
    );
    console.log("   the definition Set entry is removed even though factories Map is overwritten.",
    );
    console.log(
      "   Implication: a single external addActivateGuard after route config silently",
    );
    console.log(
      "   STRIPS the HMR-replace protection for that route's guard.",
    );
  }
});
