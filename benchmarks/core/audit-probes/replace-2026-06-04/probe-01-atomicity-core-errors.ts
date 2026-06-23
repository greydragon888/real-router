/**
 * Probe 01: replace() ATOMICITY for CORE-level errors WITHOUT validation-plugin.
 *
 * Central documented invariant (core/CLAUDE.md "Atomic Route Replacement" step 2:
 * "Validation — fail-fast, tree unchanged on error"; wiki replaceRoutes contract).
 *
 * `replaceRoutes` (getRoutesApi.ts:247-295) runs:
 *   3. clearRouteData(store)        <-- WIPES old tree FIRST
 *   5. registerAllRouteHandlers(...)  <-- async-forwardTo throws here (core, always on)
 *   6. commitTreeChanges(store)       <-- circular-forwardTo / dup-path throw here (core)
 * There is NO try/catch. So a core-level throw AFTER step 3 leaves the store
 * wiped → old routes lost → atomicity violated.
 *
 * Without validation-plugin, validateRoutes (the opt-in pre-check) is a no-op,
 * so these errors are the first line of defense — and they fire too late.
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

function scenario(label: string, badRoutes: unknown): void {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "about", path: "/about" },
  ]);
  const routesApi = getRoutesApi(router);
  const api = getPluginApi(router);

  const beforeHome = api.matchPath("/home")?.name ?? "undefined";

  let threw: string | false = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routesApi.replace(badRoutes as any);
  } catch (e) {
    threw = (e as Error).message;
  }

  const afterHome = api.matchPath("/home")?.name ?? "undefined";
  const afterAbout = api.matchPath("/about")?.name ?? "undefined";

  console.log(`[${label}]`);
  console.log("  threw            :", threw);
  console.log("  /home before     :", beforeHome);
  console.log("  /home after      :", afterHome, afterHome === beforeHome ? "" : "<-- OLD ROUTE LOST (ATOMICITY VIOLATED)");
  console.log("  /about after     :", afterAbout);
}

scenario("async-forwardTo", [
  { name: "x", path: "/x", forwardTo: (async () => "y") as unknown as string },
  { name: "y", path: "/y" },
]);

scenario("circular-forwardTo", [
  { name: "a", path: "/a", forwardTo: "b" },
  { name: "b", path: "/b", forwardTo: "a" },
]);

scenario("duplicate-path", [
  { name: "p", path: "/dup" },
  { name: "q", path: "/dup" },
]);
