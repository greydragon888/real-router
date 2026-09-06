// L1-construction · which caller-owned containers does core HAND BACK OUT by
// identity, and does it READ them back afterwards (round-trip)?
//
// The lens rule: a hand-out is a door only if core later reads the object back.
// So for every `=== caller's` below, the companion line records whether a
// post-hand-out mutation of the caller's object changes what core ANSWERS.
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { show } from "./census";

async function main(): Promise<void> {
const qp = { arrayFormat: "brackets" as const };
const limits = { maxListeners: 5 };
const optDefaultParams = { id: "9" };
const optDefaultSearch = { tab: "q" };
const routeDefaultParams = { x: "1" };
const routeDefaultSearch = { tab: "d" };
const meta = { schema: "z" };
const routes = [
  { name: "u", path: "/u/:id?tab", defaultParams: routeDefaultParams, defaultSearch: routeDefaultSearch, meta },
  { name: "home", path: "/home" },
];

const router = createRouter(routes as never, {
  defaultRoute: "u",
  defaultParams: optDefaultParams,
  defaultSearch: optDefaultSearch,
  queryParams: qp,
  limits,
} as never);

const opts = getPluginApi(router).getOptions();
const cloneState = getInternals(router).getCloneState();
const store = getInternals(router).routeGetStore();

console.log("== hand-outs by identity ==");
show("getOptions().queryParams === qp:", opts.queryParams === qp);
show("getOptions().limits === limits:", (opts as Record<string, unknown>).limits === limits);
show("getOptions().defaultParams === optDefaultParams:", opts.defaultParams === optDefaultParams);
show("getOptions().defaultSearch === optDefaultSearch:", opts.defaultSearch === optDefaultSearch);
show("getCloneState().options.queryParams === qp:", cloneState.options.queryParams === qp);
show("routeGetStore().matcherOptions.queryParams === qp (snapshot, must be false):", store.matcherOptions?.queryParams === qp);
show("routeGetStore().matcherOptions frozen:", Object.isFrozen(store.matcherOptions));
show("routeGetStore().config.defaultParams.u === routeDefaultParams:", store.config.defaultParams.u === routeDefaultParams);
show("routeGetStore().config.defaultSearch.u === routeDefaultSearch:", store.config.defaultSearch.u === routeDefaultSearch);
show("getRoutesApi().get('u').defaultParams === routeDefaultParams:", getRoutesApi(router).get("u")?.defaultParams === routeDefaultParams);
show("getRoutesApi().get('u').defaultSearch === routeDefaultSearch:", getRoutesApi(router).get("u")?.defaultSearch === routeDefaultSearch);
show("getRoutesApi().get('u') is a fresh shell per call:", getRoutesApi(router).get("u") !== getRoutesApi(router).get("u"));
show("getPluginApi().getRouteConfig('u').meta === meta (leaf by reference):", getPluginApi(router).getRouteConfig("u")?.meta === meta);
show("getPluginApi().getRouteConfig('u') === store.routeCustomFields.u (record by reference):", getPluginApi(router).getRouteConfig("u") === store.routeCustomFields.u);
show("store.routeCustomFields.u === routes[0] (must be false — separate record):", store.routeCustomFields.u === (routes[0] as unknown));

console.log("\n== round-trip: mutate the caller's object AFTER construction, does core's answer move? ==");
show("buildPath before:", router.buildPath("u", { id: "1" }));
routeDefaultParams.x = "MUTATED";
show("buildPath after routeDefaultParams.x = MUTATED (params not printed; check via makeState):",
  getPluginApi(router).makeState("u", { id: "1" }, {})?.params);
show("buildPath before search mutation:", router.buildPath("u", { id: "1" }));
routeDefaultSearch.tab = "MUTATED";
show("buildPath after routeDefaultSearch.tab = MUTATED:", router.buildPath("u", { id: "1" }));
(routeDefaultSearch as Record<string, unknown>).added = "NEW";
show("buildPath after routeDefaultSearch.added = NEW (loose mode prints undeclared):", router.buildPath("u", { id: "1" }));

await router.start("/home");
optDefaultParams.id = "77";
optDefaultSearch.tab = "MUT";
await router.navigateToDefault();
show("navigateToDefault after mutating options.defaultParams/defaultSearch → state:", {
  params: router.getState()?.params,
  search: router.getState()?.search,
  path: router.getState()?.path,
});

// queryParams: the SNAPSHOT is what the matcher uses — mutation must NOT move core.
qp.arrayFormat = "none" as never;
show("buildPath with list after qp.arrayFormat=none (still brackets → snapshot holds):",
  router.buildPath("u", { id: "1" }, { l: ["a", "b"] } as never));
// …but a CLONE re-reads the caller's bag (documented, #1877 note) — so the mutation reaches the clone.
const clone = cloneRouter(router);

show("clone.buildPath with list (re-read caller bag → 'none' format):",
  clone.buildPath("u", { id: "1" }, { l: ["a", "b"] } as never));
clone.dispose();

// limits: the caller bag is handed out, but never re-read (values resolved; keys snapshotted).
limits.maxListeners = 100;
const clone2 = cloneRouter(router);
let n = 0;

try {
  for (let i = 0; i < 50; i += 1) {
    clone2.subscribe(() => {});
  }
} catch {
  /* capped */
}

show("clone after limits.maxListeners=100 mutation still capped at 5? (subscribes before throw):", (() => { n = 0; try { for (let i = 0; i < 50; i += 1) { clone2.subscribe(() => {}); n += 1; } } catch { /* */ } return n; })());
clone2.dispose();

// custom field record hand-out: a plugin mutating the handed-out record changes core's later answers (round-trip via getRouteConfig)
const rec = getPluginApi(router).getRouteConfig("u") as Record<string, unknown>;

rec.injected = "BY_PLUGIN";
show("getRouteConfig('u').injected after plugin wrote into the handed-out record:", getPluginApi(router).getRouteConfig("u")?.injected);
show("routes[0].injected (caller's route object untouched):", (routes[0] as Record<string, unknown>).injected);

router.dispose();
}

void main();
