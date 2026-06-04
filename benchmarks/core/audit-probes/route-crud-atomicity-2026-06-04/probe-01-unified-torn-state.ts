/**
 * Unified ROOT-CAUSE probe: "mutate-then-validate without rollback" across the
 * three mutating route-CRUD ops, WITHOUT validation-plugin (production default,
 * since CLAUDE.md wires `__DEV__ && validationPlugin()`).
 *
 * Single regression anchor for the proposed prepare-then-commit fix. After the
 * fix, every "VIOLATED" line below must flip to clean (op throws BEFORE mutating
 * the store, leaving prior routes intact).
 *
 * Per-method detail probes:
 *   add-route-2026-06-04/probe-05,06   replace-2026-06-04/probe-01,02
 *   update-route-2026-06-04/probe-01,02
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

function freshRouter() {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "about", path: "/about" },
  ]);
  return { router, routesApi: getRoutesApi(router), api: getPluginApi(router) };
}

console.log("=== ROOT CAUSE: route-CRUD mutate-then-validate w/o rollback (no plugin) ===\n");

// 1) add: duplicate existing name must NOT overwrite the live route
{
  const { router, routesApi, api } = freshRouter();
  try {
    routesApi.add({ name: "home", path: "/home-2" }); // dup name → must throw now
  } catch { /* expected throw after fix */ }
  const homeMatches = api.matchPath("/home")?.name ?? "undefined";
  console.log("add: dup name");
  console.log("  /home still matches 'home' :", homeMatches === "home", homeMatches === "home" ? "" : `<-- VIOLATED (now ${homeMatches}; buildPath=${router.buildPath("home")})`);
}

// 2) replace: core-level error (circular forwardTo) wipes the whole old tree
{
  const { routesApi, api } = freshRouter();
  try {
    routesApi.replace([
      { name: "a", path: "/a", forwardTo: "b" },
      { name: "b", path: "/b", forwardTo: "a" },
    ]);
  } catch { /* expected throw */ }
  const homeAlive = api.matchPath("/home")?.name === "home";
  console.log("replace: circular forwardTo in new set");
  console.log("  old /home survives failed replace :", homeAlive, homeAlive ? "" : "<-- VIOLATED (entire tree lost on failed replace)");
}

// 3) update: failed cycle poisons config.forwardMap → unrelated future add throws
{
  const { routesApi } = freshRouter();
  routesApi.add({ name: "a", path: "/a" });
  routesApi.add({ name: "b", path: "/b" });
  routesApi.update("a", { forwardTo: "b" });
  try { routesApi.update("b", { forwardTo: "a" }); } catch { /* expected */ }
  let unrelatedAddThrew = false;
  try { routesApi.add({ name: "z", path: "/z" }); } catch { unrelatedAddThrew = true; }
  console.log("update: failed cycle then unrelated add");
  console.log("  later add('z') stays clean        :", !unrelatedAddThrew, unrelatedAddThrew ? "<-- VIOLATED (poisoned forwardMap surfaces in unrelated op)" : "");
}
