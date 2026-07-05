/**
 * Probe 04: two invariants.
 *
 * (1) NO_REGRESSION: after add(newRoutes), an already-existing route's config
 *     (returned by get) is unchanged.
 * (2) DEFINITION_GUARD vs EXTERNAL_GUARD: a canActivate declared in an add()ed
 *     route config is registered as isFromDefinition=true (RouterWiringBuilder
 *     wires addActivateGuard → addCanActivate(name, h, true)), so a later
 *     replace() clears it; an external addActivateGuard survives replace().
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

const router = createRouter([{ name: "home", path: "/home" }]);
const routesApi = getRoutesApi(router);
const lifecycle = getLifecycleApi(router);

// (1) NO_REGRESSION
routesApi.add({ name: "alpha", path: "/alpha", defaultParams: { a: "1" } });
const alphaBefore = JSON.stringify(routesApi.get("alpha")?.defaultParams);
routesApi.add([
  { name: "beta", path: "/beta" },
  { name: "gamma", path: "/gamma" },
]);
const alphaAfter = JSON.stringify(routesApi.get("alpha")?.defaultParams);
console.log("NO_REGRESSION (alpha config stable):", alphaBefore === alphaAfter, alphaAfter);

// (2) guard origin
routesApi.add({ name: "secure", path: "/secure", canActivate: () => () => false });
lifecycle.addActivateGuard("home", () => () => false);

console.log("definition guard active (secure):", router.canNavigateTo("secure") === false);
console.log("external guard active (home)    :", router.canNavigateTo("home") === false);

routesApi.replace([
  { name: "home", path: "/home" },
  { name: "secure", path: "/secure" },
]);

console.log("after replace — definition guard cleared (secure navigable):", router.canNavigateTo("secure") === true);
console.log("after replace — external guard survives (home blocked)     :", router.canNavigateTo("home") === false);
