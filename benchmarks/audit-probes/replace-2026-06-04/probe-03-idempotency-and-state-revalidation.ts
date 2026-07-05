/**
 * Probe 03:
 * (A) IDENTITY/idempotency — replace(sameRoutes) twice yields a structurally
 *     identical tree (no drift across repeated replaces).
 * (B) State revalidation — when current path no longer matches the new tree,
 *     state is cleared (getState() === undefined) and NO transition event is
 *     emitted (subscribe listener must NOT fire — it is a silent swap, not a
 *     navigation).
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

// (A) idempotency
{
  const router = createRouter([{ name: "home", path: "/home" }]);
  const routesApi = getRoutesApi(router);
  const api = getPluginApi(router);

  const routes = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b", children: [{ name: "c", path: "/c" }] },
  ];

  routesApi.replace(routes);
  const snap1 = [
    api.matchPath("/a")?.name,
    api.matchPath("/b/c")?.name,
    router.buildPath("b.c"),
  ].join("|");

  routesApi.replace(routes);
  const snap2 = [
    api.matchPath("/a")?.name,
    api.matchPath("/b/c")?.name,
    router.buildPath("b.c"),
  ].join("|");

  console.log("(A) idempotent replace — snapshots equal:", snap1 === snap2, `[${snap1}]`);
}

// (B) state revalidation: current route removed → state cleared, no event
async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "about", path: "/about" },
  ]);
  const routesApi = getRoutesApi(router);

  await router.start("/home");

  let subscribeFired = 0;
  router.subscribe(() => {
    subscribeFired++;
  });

  routesApi.replace([{ name: "fresh", path: "/fresh" }]); // home no longer exists

  console.log("(B) state revalidation (current route removed):");
  console.log("    getState()           :", router.getState() === undefined ? "undefined (cleared)" : router.getState()?.name);
  console.log("    subscribe fired count:", subscribeFired, subscribeFired === 0 ? "(silent swap — no event)" : "<-- event emitted");
}

void main();
