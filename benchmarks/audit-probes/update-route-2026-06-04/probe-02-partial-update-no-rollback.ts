/**
 * Probe 02 (ROOT-PROBLEM extension): update() is NOT atomic across its 6 fields.
 *
 * updateRouteConfig processes fields sequentially: forwardTo (getRoutesApi.ts:339),
 * then defaultParams (:348), decode (:356), encode (:368); then the update method
 * applies canActivate (:507) / canDeactivate (:517). No transaction wraps them.
 *
 * If forwardTo (processed FIRST) throws (cycle, WITHOUT plugin), every later field
 * is skipped — but forwardTo's own config.forwardMap mutation persists. So a
 * single update({forwardTo: cycle, defaultParams: valid, canActivate: f}) leaves a
 * partial commit: nothing the user asked for is consistently applied.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi, getRoutesApi } from "@real-router/core/api";

const router = createRouter([
  { name: "home", path: "/home" },
  { name: "loop", path: "/loop" },
]);
const routesApi = getRoutesApi(router);
const api = getPluginApi(router);
const lifecycle = getLifecycleApi(router);
void lifecycle;

// self-cycle on "loop" so the forwardTo field throws
let threw: string | false = false;
try {
  routesApi.update("loop", {
    forwardTo: "loop", // self-cycle → throws in refreshForwardMap
    defaultParams: { page: 1 }, // should this be applied? (processed after forwardTo)
    canActivate: () => () => false,
  });
} catch (e) {
  threw = (e as Error).message;
}

console.log("update threw                    :", threw);
console.log("defaultParams applied?          :", JSON.stringify(api.makeState("loop").params), "(empty => NOT applied)");
console.log("canActivate applied? (blocked?) :", router.canNavigateTo("loop") === false, "(false => guard NOT applied)");
console.log("forwardMap dirtied? buildPath ok:", (() => { try { router.buildPath("home"); return "home-ok"; } catch (e) { return `BROKEN: ${(e as Error).message}`; } })());
