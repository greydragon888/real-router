// L1-construction · every constructor door under a full-trap Proxy.
//
// Phase 1 (construction): which traps does `createRouter(routes, options, deps)`
// fire on each CALLER-owned container? A door whose container is copied once at
// the boundary shows reads at construction and NOTHING afterwards.
// Phase 2 (post-boundary): buildPath / start / navigate / navigateToDefault /
// add — which caller containers are read AGAIN? Those are "handle held".
//
// POSITIVE CONTROL: every proxied container carries a key whose value the router
// must have consumed for the router to answer correctly (the route matches, the
// default is printed, the dependency resolves, the cap binds).
import { createRouter } from "@real-router/core";
import { getDependenciesApi, getPluginApi, getRoutesApi } from "@real-router/core/api";

import { censused, compact, show, writes } from "./census";

import type { Census } from "./census";

async function main(): Promise<void> {
const svc = { hello: "svc" };
const customValue = { schema: "z" };

// ── caller-owned containers, one per door ───────────────────────────────────
const childRoute = censused({ name: "kid", path: "/kid" });
const childrenArray = censused([childRoute.proxy]);
const routeDefaultParams = censused({ x: "1" });
const routeDefaultSearch = censused({ tab: "d" });
const routeObject = censused({
  name: "u",
  path: "/u/:id?tab",
  defaultParams: routeDefaultParams.proxy,
  defaultSearch: routeDefaultSearch.proxy,
  children: childrenArray.proxy,
  meta: customValue, // custom (plugin) field — an object leaf
});
const homeRoute = { name: "home", path: "/home" };
const routesArray = censused([routeObject.proxy, homeRoute]);

const optQueryParams = censused({ arrayFormat: "brackets" });
const optLimits = censused({ maxListeners: 5 });
const optLogger = censused({ level: "error-only" });
const optDefaultParams = censused({ id: "9" });
const optDefaultSearch = censused({ tab: "q" });
const optionsBag = censused({
  defaultRoute: "u",
  defaultParams: optDefaultParams.proxy,
  defaultSearch: optDefaultSearch.proxy,
  queryParams: optQueryParams.proxy,
  limits: optLimits.proxy,
  logger: optLogger.proxy,
  extraUnknownKey: "kept?",
});
const depsBag = censused({ svc });

const doors: Record<string, ReturnType<typeof censused>> = {
  "routes (array)": routesArray,
  "routes[0] (route object)": routeObject,
  "routes[0].children (array)": childrenArray,
  "routes[0].children[0] (route object)": childRoute,
  "routes[0].defaultParams": routeDefaultParams,
  "routes[0].defaultSearch": routeDefaultSearch,
  "options (bag)": optionsBag,
  "options.queryParams": optQueryParams,
  "options.limits": optLimits,
  "options.logger": optLogger,
  "options.defaultParams (static bag)": optDefaultParams,
  "options.defaultSearch (static bag)": optDefaultSearch,
  "dependencies (bag)": depsBag,
};

const snapAll = (): Record<string, Census> =>
  Object.fromEntries(Object.entries(doors).map(([k, d]) => [k, d.snap()]));

const report = (phase: string, since: Record<string, Census>): void => {
  console.log(`\n== ${phase} ==`);

  for (const [label, door] of Object.entries(doors)) {
    const d = door.delta(since[label]);

    show(`  ${label}:`, compact(d));

    if (writes(d) !== 0) {
      show(`  !! WRITE into caller container ${label}:`, compact(d));
    }
  }
};

// ── Phase 1: construction ───────────────────────────────────────────────────
const before = snapAll();
const router = createRouter(
  routesArray.proxy as never,
  optionsBag.proxy as never,
  depsBag.proxy as never,
);

report("PHASE 1 · createRouter(routes, options, dependencies)", before);

// Positive controls for phase 1 — the values were consumed, not merely touched.
const opts = getPluginApi(router).getOptions();

show("\ncontrol · buildPath('u',{id:'1'}) (route registered, defaultParams x merged, defaultSearch tab printed, arrayFormat=brackets used):",
  router.buildPath("u", { id: "1" }, { list: ["a", "b"] } as never));
show("control · getDependency('svc') === svc:", getDependenciesApi(router).get("svc" as never) === svc);
show("control · custom field handed out by identity (getRouteConfig('u').meta === customValue):",
  getPluginApi(router).getRouteConfig("u")?.meta === customValue);
show("control · unknown option key survives into getOptions():", (opts as Record<string, unknown>).extraUnknownKey);
show("control · getOptions().logger (stripped?):", (opts as Record<string, unknown>).logger);
show("control · getOptions().queryParams === caller bag:", opts.queryParams === optQueryParams.proxy);
show("control · getOptions().limits === caller bag:", (opts as Record<string, unknown>).limits === optLimits.proxy);
show("control · getOptions().defaultParams === caller bag:", opts.defaultParams === optDefaultParams.proxy);
show("control · getOptions().defaultSearch === caller bag:", opts.defaultSearch === optDefaultSearch.proxy);
show("control · Object.isFrozen(getOptions()):", Object.isFrozen(opts));
show("control · Object.isFrozen(caller queryParams / limits / defaultParams):", [
  Object.isFrozen(optQueryParams.proxy), Object.isFrozen(optLimits.proxy), Object.isFrozen(optDefaultParams.proxy),
]);

let capped = 0;

try {
  for (let i = 0; i < 10; i += 1) {
    router.subscribe(() => {});
  }
} catch {
  capped = 1;
}

show("control · limits.maxListeners=5 bound (1 = threw under 10 subscribes):", capped);

// ── Phase 2: post-boundary operations ───────────────────────────────────────
const afterConstruction = snapAll();

router.buildPath("u", { id: "2" });
report("PHASE 2a · router.buildPath('u', {id:'2'}) — literal form", afterConstruction);

const afterBuild = snapAll();

await router.start("/home");
report("PHASE 2b · router.start('/home')", afterBuild);

const afterStart = snapAll();

await router.navigate("u", { id: "3" });
report("PHASE 2c · router.navigate('u', {id:'3'}) — resolving form", afterStart);
show("  state after navigate:", router.getState()?.params);
show("  state.params === routes[0].defaultParams (identity):", router.getState()?.params === routeDefaultParams.proxy);

const afterNavigate = snapAll();

await router.navigateToDefault();
report("PHASE 2d · router.navigateToDefault() — options.defaultParams / defaultSearch static bags", afterNavigate);
show("  state after navigateToDefault:", { params: router.getState()?.params, search: router.getState()?.search, path: router.getState()?.path });
show("  state.params === options.defaultParams (identity):", router.getState()?.params === optDefaultParams.proxy);

const afterDefault = snapAll();

getRoutesApi(router).add({ name: "z", path: "/z" });
getPluginApi(router).setRootPath("/root");
report("PHASE 2e · add() + setRootPath() — matcher rebuilds", afterDefault);

const afterRebuild = snapAll();

router.dispose();
report("PHASE 2f · dispose()", afterRebuild);
}

void main();
