/**
 * Probe 01 (ROOT-PROBLEM extension): update({forwardTo: <creates cycle>}) WITHOUT
 * validation-plugin leaves `config.forwardMap` corrupted, surfacing on the NEXT
 * tree rebuild (add/replace) — even though the immediate forwardState looks clean.
 *
 * Root: updateRouteConfig (getRoutesApi.ts:339) → updateForwardTo (:113) mutates
 *   config.forwardMap[name] = target  FIRST, then calls refreshForwardMap which
 *   throws on the cycle (forwardChain.ts:19). No rollback → config.forwardMap keeps
 *   the cyclic entry. resolvedForwardMap stays stale-clean (assignment never
 *   completes), so forwardState/matchPath look fine — but the next commitTreeChanges
 *   re-runs refreshForwardMap over the dirty config.forwardMap and throws.
 *
 * The existing test (updateRoute.test.ts:107 "should not corrupt forwardMap")
 * only checks forwardState (resolvedForwardMap), NOT a subsequent rebuild.
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const router = createRouter([
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "c", path: "/c" },
]);
const routesApi = getRoutesApi(router);
const api = getPluginApi(router);

routesApi.update("a", { forwardTo: "b" });
routesApi.update("b", { forwardTo: "c" });

// This creates cycle c → a → b → c. Core throws via resolveForwardChain.
let updateThrew: string | false = false;
try {
  routesApi.update("c", { forwardTo: "a" });
} catch (e) {
  updateThrew = (e as Error).message;
}

console.log("update cycle threw          :", updateThrew);
console.log("forwardState('a') (resolved):", api.forwardState("a", {}).name, "(reads resolvedForwardMap — clean)");

// Now the latent corruption: a subsequent add() rebuilds the tree, re-running
// refreshForwardMap over the DIRTY config.forwardMap (still holds c → a).
let laterAddThrew: string | false = false;
try {
  routesApi.add({ name: "z", path: "/z" });
} catch (e) {
  laterAddThrew = (e as Error).message;
}

console.log("later add('z') threw        :", laterAddThrew, laterAddThrew ? "<-- config.forwardMap LEFT CORRUPTED" : "");
console.log("has('z') (add succeeded?)   :", routesApi.has("z"));
