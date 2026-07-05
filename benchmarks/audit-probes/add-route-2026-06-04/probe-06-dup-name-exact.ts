/**
 * Probe 06: exact behavior of add({name: <existing>, path: <different>}) with
 * and without validation-plugin. Confirms NO_REGRESSION violation on the core
 * (no-plugin) path and that validation-plugin restores the documented throw.
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";

// --- core only (no validation plugin) ---
{
  const router = createRouter([{ name: "home", path: "/home" }]);
  const routesApi = getRoutesApi(router);
  const api = getPluginApi(router);

  routesApi.add({ name: "home", path: "/home-2" });

  console.log("[no-plugin] buildPath('home')   :", JSON.stringify(router.buildPath("home")));
  console.log("[no-plugin] matchPath('/home')  :", api.matchPath("/home")?.name ?? "undefined");
  console.log("[no-plugin] matchPath('/home-2'):", api.matchPath("/home-2")?.name ?? "undefined");
}

// --- with validation plugin ---
{
  const router = createRouter([{ name: "home", path: "/home" }]);
  router.usePlugin(validationPlugin());
  const routesApi = getRoutesApi(router);

  let threw: string | false = false;
  try {
    routesApi.add({ name: "home", path: "/home-2" });
  } catch (e) {
    threw = (e as Error).message;
  }
  console.log("[plugin]    add dup threw       :", threw);
  console.log("[plugin]    buildPath('home')   :", JSON.stringify(router.buildPath("home")));
}
