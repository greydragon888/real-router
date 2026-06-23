/**
 * Probe 02:
 * (A) async-forwardTo throw leaves a TORN internal state without plugin: the
 *     matcher still matches old paths (tree not yet rebuilt at step 5) while
 *     definitions/config were wiped at step 3 (clearRouteData). Demonstrate the
 *     inconsistency: has() vs matchPath() disagree / buildPath misbehaves.
 * (B) WITH validation-plugin, circular forwardTo is caught BEFORE replaceRoutes
 *     (pre-validation), so the old tree survives — proving the root cause is
 *     "core-level errors fire after clearRouteData with no rollback", not the
 *     error detection itself.
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";

// (A) torn state, no plugin, async forwardTo
{
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "about", path: "/about" },
  ]);
  const routesApi = getRoutesApi(router);
  const api = getPluginApi(router);

  try {
    routesApi.replace([
      { name: "x", path: "/x", forwardTo: (async () => "y") as unknown as string },
      { name: "y", path: "/y" },
    ]);
  } catch {
    /* expected throw */
  }

  console.log("(A) async-forwardTo torn state (no plugin):");
  console.log("    matchPath('/home') :", api.matchPath("/home")?.name ?? "undefined", "(stale OLD tree still matches)");
  console.log("    has('home')        :", routesApi.has("home"), "(matcher) vs definitions wiped");
  console.log("    getRouteConfig home:", JSON.stringify(api.getRouteConfig("home")), "(config wiped by clearRouteData)");
  console.log("    has('x') (new)     :", routesApi.has("x"));
}

// (B) plugin contrast, circular forwardTo
{
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "about", path: "/about" },
  ]);
  router.usePlugin(validationPlugin());
  const routesApi = getRoutesApi(router);
  const api = getPluginApi(router);

  let threw: string | false = false;
  try {
    routesApi.replace([
      { name: "a", path: "/a", forwardTo: "b" },
      { name: "b", path: "/b", forwardTo: "a" },
    ]);
  } catch (e) {
    threw = (e as Error).message;
  }

  console.log("(B) circular-forwardTo WITH validation-plugin:");
  console.log("    threw           :", threw);
  console.log("    /home survived  :", api.matchPath("/home")?.name === "home", "<-- atomicity holds WITH plugin");
}
