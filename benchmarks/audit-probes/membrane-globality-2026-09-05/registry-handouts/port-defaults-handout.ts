// Neighbours on the same signature (RouteResolver): defaultParams·return and
// defaultSearch·return. Are they core's copy or the caller's own object? If the
// caller's, the outbound handout adds no second landing — the inbound door
// (createRouter·routes[].defaultParams / defaultSearch) already owns it.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const dp = { id: "d" };
const ds = { tab: "s" };
const router = createRouter(
  [
    { name: "home", path: "/home" },
    { name: "u", path: "/u/:id?tab", defaultParams: dp, defaultSearch: ds },
  ] as never,
  { defaultRoute: "home" } as never,
);
const ctx = getInternals(router);
const port = ctx.port();
const store = ctx.routeGetStore();

const out: Record<string, unknown> = {
  defaultParams_isCallersObject: port.defaultParams("u") === dp,
  defaultParams_isStoreConfigEntry:
    port.defaultParams("u") === store.config.defaultParams.u,
  defaultParams_frozen: Object.isFrozen(port.defaultParams("u")),
  defaultSearch_isCallersObject: port.defaultSearch("u") === ds,
  defaultSearch_frozen: Object.isFrozen(port.defaultSearch("u")),
  missingRoute: [port.defaultParams("nope"), port.defaultSearch("nope")],
  // the caller's later write is what the port reads (held by reference)
  callerWriteVisibleThroughPort: (() => {
    (dp as Record<string, unknown>).late = "1";
    return (port.defaultParams("u") as Record<string, unknown>).late === "1";
  })(),
  // after `update`, is the new bag the caller's too?
  afterUpdate_isCallersObject: (() => {
    const fresh = { id: "e" };
    getRoutesApi(router).update("u", { defaultParams: fresh } as never);
    return port.defaultParams("u") === fresh;
  })(),
};

console.log(JSON.stringify(out, null, 2));
