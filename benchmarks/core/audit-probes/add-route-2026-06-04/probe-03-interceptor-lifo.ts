/**
 * Probe 03: addInterceptor("add", fn) is invoked with (next, routes, options)
 * in LIFO order. `add` IS in InterceptableMethodMap (core-types api.ts:38) and
 * is wrapped via createInterceptable("add", ...) (getRoutesApi.ts:416). CLAUDE.md
 * "Plugin Interception Points" omits it — doc drift, not a runtime gap.
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const router = createRouter([{ name: "home", path: "/" }]);
const api = getPluginApi(router);
const routesApi = getRoutesApi(router);

const order: string[] = [];
let seenRoutes: unknown;
let seenOptions: unknown;

// Registered first → innermost
api.addInterceptor("add", (next, routes, options) => {
  order.push("A:before");
  next(routes, options);
  order.push("A:after");
});

// Registered second → outermost (wraps A)
api.addInterceptor("add", (next, routes, options) => {
  order.push("B:before");
  seenRoutes = routes;
  seenOptions = options;
  next(routes, options);
  order.push("B:after");
});

routesApi.add({ name: "users", path: "/users" });

console.log("invocation order:", order.join(" "));
console.log("LIFO (B wraps A):", order.join(" ") === "B:before A:before A:after B:after");
console.log("routes arg is array:", Array.isArray(seenRoutes));
console.log("options arg        :", JSON.stringify(seenOptions));
console.log("route committed    :", routesApi.has("users"));
