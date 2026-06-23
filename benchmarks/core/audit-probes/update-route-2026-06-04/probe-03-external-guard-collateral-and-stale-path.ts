/**
 * Probe 03:
 * (A) External-guard collateral damage (KNOWN, archived as LOW contract-gap in
 *     route-lifecycle-deep-2026-05-22.md after PR #676): update(name,{canActivate:null})
 *     calls clearCanActivate(name) WITHOUT an origin arg (getRoutesApi.ts:510), and
 *     clearCanActivate without origin deletes BOTH definition and external Maps
 *     (RouteLifecycleNamespace.ts:191-205). Verify it still reproduces on current code.
 * (B) Encoder swap leaves state.path stale: update(currentState.name,{encodeParams})
 *     does NOT revalidate state (no tree rebuild, no matchPath). getState().path was
 *     built with the OLD encoder, so it diverges from a fresh buildPath().
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

// (A) external guard collateral damage
async function partA(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "admin", path: "/admin" },
  ]);
  const routesApi = getRoutesApi(router);
  const lifecycle = getLifecycleApi(router);

  await router.start("/home");

  // EXTERNAL guard (via getLifecycleApi) — user expects this to survive route-config edits
  lifecycle.addActivateGuard("admin", () => () => false);
  console.log("(A) external guard blocks admin before update :", router.canNavigateTo("admin") === false);

  // update with canActivate:null — intends to clear the DEFINITION guard, but...
  routesApi.update("admin", { canActivate: null });

  console.log("(A) admin navigable after update null          :", router.canNavigateTo("admin") === true, "<-- external guard WIPED (collateral)");
}

// (B) stale state.path after encoder swap
async function partB(): Promise<void> {
  const router = createRouter([{ name: "item", path: "/item/:id" }]);
  const routesApi = getRoutesApi(router);

  await router.start("/item/abc");

  const pathBefore = router.getState()?.path;

  routesApi.update("item", {
    encodeParams: (p) => ({ ...p, id: `X-${p.id as string}` }),
  });

  const statePathAfter = router.getState()?.path;
  const freshBuild = router.buildPath("item", router.getState()?.params ?? {});

  console.log("(B) state.path before update :", pathBefore);
  console.log("(B) state.path after update  :", statePathAfter, "(unchanged — no revalidation)");
  console.log("(B) fresh buildPath now      :", freshBuild);
  console.log("(B) state.path === buildPath :", statePathAfter === freshBuild, statePathAfter === freshBuild ? "" : "<-- STALE state.path (inconsistent with encoder)");
}

void (async () => {
  await partA();
  await partB();
})();
