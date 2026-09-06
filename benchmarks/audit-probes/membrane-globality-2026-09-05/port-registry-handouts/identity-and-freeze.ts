// Lens "port-registry-handouts": the RouteResolver port (RouterInternals.port())
// and every other entry point that hands out the SAME objects — the
// path-slot / query-name registries cached in RoutesStore, the route defaults,
// the forwardState pass-through, the meta map, the tree, the clone snapshot.
//
// For each hand-out: is the value reached (positive control), is it the same
// object across calls, is it core's own cache entry (landsIn), is it frozen,
// what is its prototype. No mutation here — that is write-reaches-core.ts.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;

const dp = { id: "d-default" };
const ds = { page: "1" };

function build() {
  const router = createRouter(
    [
      {
        name: "u",
        path: "/u/:id?tab",
        children: [{ name: "c", path: "/c/:cid?q" }],
      },
      { name: "home", path: "/home" },
      { name: "d", path: "/d/:id?page", defaultParams: dp, defaultSearch: ds },
      { name: "f", path: "/f/:id", forwardTo: "u", defaultParams: { id: "9" } },
    ] as never,
    { defaultRoute: "home" } as never,
    { svc: { n: 1 } } as never,
  );

  return {
    router,
    ctx: getInternals(router),
    plugin: getPluginApi(router),
    routes: getRoutesApi(router),
  };
}

const out: AnyRec = {};
const proto = (v: unknown): string =>
  v === null || typeof v !== "object"
    ? typeof v
    : Object.getPrototypeOf(v) === null
      ? "null"
      : Object.getPrototypeOf(v) === Array.prototype
        ? "Array.prototype"
        : Object.getPrototypeOf(v) === Object.prototype
          ? "Object.prototype"
          : (Object.getPrototypeOf(v) as { constructor?: { name?: string } })
              .constructor?.name ?? "other";

{
  const { ctx, plugin } = build();
  const port = ctx.port();
  const store = ctx.routeGetStore() as unknown as {
    urlParamsCache: Map<string, string[]>;
    queryParamsCache: Map<string, string[]>;
    config: { defaultParams: AnyRec; defaultSearch: AnyRec };
    matcher: { getDeclaredQueryParams: (n: string) => readonly string[] | undefined };
    tree: unknown;
  };

  // --- A. port.pathNames(name) — THE GAP
  const pn1 = port.pathNames("u");
  const pn2 = port.pathNames("u");
  out["A.port.pathNames"] = {
    control_value: pn1 === undefined ? undefined : [...pn1],
    control_missingRouteArm: port.pathNames("nope"),
    control_noSlotRoute: (() => {
      const v = port.pathNames("home");
      return v === undefined ? undefined : [...v];
    })(),
    sameAcrossCalls: pn1 === pn2,
    isCacheEntry_landsIn: pn1 === store.urlParamsCache.get("u"),
    isFrozen: pn1 === undefined ? undefined : Object.isFrozen(pn1),
    proto: proto(pn1),
    // the cache array is a COPY of the engine's frozen source, not the source
    engineSourceIsFrozen: (() => {
      const tree = ctx.getTree() as unknown as {
        children: Map<string, { paramMeta: { urlParams: readonly string[] } }>;
      };
      const src = tree.children.get("u")!.paramMeta.urlParams;
      return { frozen: Object.isFrozen(src), sameAsCache: src === pn1 };
    })(),
  };

  // --- B. port.queryNames(name) === RouterInternals.getQueryParams(name)
  const qn1 = port.queryNames("u");
  const qn2 = port.queryNames("u");
  const gq = ctx.getQueryParams("u");
  out["B.port.queryNames|RouterInternals.getQueryParams"] = {
    control_value: [...qn1],
    control_missingRoute: [...port.queryNames("nope")],
    sameAcrossCalls: qn1 === qn2,
    sameObjectAcrossDoors: qn1 === gq,
    isCacheEntry_landsIn: qn1 === store.queryParamsCache.get("u"),
    isFrozen: Object.isFrozen(qn1),
    proto: proto(qn1),
    missingRouteIsSharedOrFresh:
      port.queryNames("nope") === port.queryNames("nope")
        ? "same (cached per name)"
        : "fresh",
  };

  void plugin;
}

{
  // --- C. cache lifecycle: a tree rebuild drops the handed-out array
  const { ctx, routes } = build();
  const port = ctx.port();
  const before = port.pathNames("u");
  const qBefore = port.queryNames("u");
  routes.add([{ name: "z", path: "/z" }] as never);
  out["C.cacheLifecycle_afterRoutesApiAdd"] = {
    pathNamesHandleStale: port.pathNames("u") !== before,
    queryNamesHandleStale: port.queryNames("u") !== qBefore,
    valuesEqualAfterRebuild:
      JSON.stringify(port.pathNames("u")) === JSON.stringify(before) &&
      JSON.stringify(port.queryNames("u")) === JSON.stringify(qBefore),
  };
}

{
  const { ctx, plugin } = build();
  const port = ctx.port();
  const store = ctx.routeGetStore() as unknown as {
    config: { defaultParams: AnyRec; defaultSearch: AnyRec };
    matcher: { getDeclaredQueryParams: (n: string) => readonly string[] | undefined };
  };

  // --- D. port.defaultParams / defaultSearch — the caller's own bag?
  const dpOut = port.defaultParams("d");
  const dsOut = port.defaultSearch("d");
  out["D.port.defaultParams|defaultSearch"] = {
    control_valueParams: dpOut,
    control_valueSearch: dsOut,
    control_missingRoute: port.defaultParams("nope"),
    paramsIsCallersOwnBag: dpOut === dp,
    searchIsCallersOwnBag: dsOut === ds,
    paramsIsStoreEntry: dpOut === store.config.defaultParams.d,
    paramsFrozen: Object.isFrozen(dpOut),
    searchFrozen: Object.isFrozen(dsOut),
    storeMapProto: proto(store.config.defaultParams),
  };

  // --- E. port.resolveForward / PluginApi.forwardState return — pass-through?
  const bag = { id: "1" };
  const sbag = { tab: "t" };
  const r1 = port.resolveForward("u", bag as never, sbag as never);
  const r2 = plugin.forwardState("u", bag as never, sbag as never);
  const r3 = port.resolveForward("u", bag as never);
  const rf = port.resolveForward("f", { id: "1" } as never);
  out["E.port.resolveForward|PluginApi.forwardState·return"] = {
    control_name: r1.name,
    paramsIsCallersBag_port: r1.params === bag,
    searchIsCallersBag_port: r1.search === sbag,
    paramsIsCallersBag_pluginApi: r2.params === bag,
    searchIsCallersBag_pluginApi: r2.search === sbag,
    resultShellFreshPerCall: r1 !== r2,
    resultShellFrozen: Object.isFrozen(r1),
    searchAbsent_isFrozenSingleton: {
      frozen: Object.isFrozen(r3.search),
      sameAcrossCalls: r3.search === port.resolveForward("u", bag as never).search,
    },
    forwardingRoute_paramsFresh: rf.params !== bag,
    forwardingRoute_paramsFrozen: Object.isFrozen(rf.params),
    forwardingRoute_value: rf,
  };

  // --- F. RouterInternals.getMetaForState — frozen at both levels?
  const m1 = ctx.getMetaForState("u.c");
  out["F.RouterInternals.getMetaForState"] = {
    control_keys: m1 === undefined ? undefined : Object.keys(m1),
    control_missingRoute: ctx.getMetaForState("nope"),
    sameAcrossCalls: m1 === ctx.getMetaForState("u.c"),
    outerFrozen: m1 === undefined ? undefined : Object.isFrozen(m1),
    outerProto: proto(m1),
    innerFrozen:
      m1 === undefined ? undefined : Object.values(m1).map((v) => Object.isFrozen(v)),
    innerProto: m1 === undefined ? undefined : Object.values(m1).map(proto),
  };

  // --- G. PluginApi.getTree === RouterInternals.getTree === store.tree
  const t1 = plugin.getTree() as unknown as {
    children: Map<string, unknown>;
    nonAbsoluteChildren: readonly unknown[];
    paramMeta: { urlParams: readonly string[]; queryParams: readonly string[] };
  };
  out["G.PluginApi.getTree|RouterInternals.getTree"] = {
    sameObjectAcrossDoors:
      t1 === (ctx.getTree() as unknown) &&
      t1 === (ctx.routeGetStore() as unknown as { tree: unknown }).tree,
    sameAcrossCalls: plugin.getTree() === (t1 as unknown),
    nodeFrozen: Object.isFrozen(t1),
    childrenIsMap: t1.children instanceof Map,
    childrenMapFrozenAsObject: Object.isFrozen(t1.children),
    nonAbsoluteChildrenFrozen: Object.isFrozen(t1.nonAbsoluteChildren),
    paramMetaFrozen: Object.isFrozen(t1.paramMeta),
    childUrlParamsFrozen: Object.isFrozen(
      (t1.children.get("u") as { paramMeta: { urlParams: unknown } }).paramMeta
        .urlParams,
    ),
  };

  // --- H. RouterInternals.getCloneState — per-field mechanism
  const c1 = ctx.getCloneState();
  const c2 = ctx.getCloneState();
  const liveDeps = (
    ctx.dependenciesGetStore() as unknown as { dependencies: { svc: unknown } }
  ).dependencies;
  const frozenOptions = plugin.getOptions() as unknown as AnyRec;
  out["H.RouterInternals.getCloneState"] = {
    options: {
      freshPerCall: c1.options !== c2.options,
      frozen: Object.isFrozen(c1.options),
      proto: proto(c1.options),
      isTheFrozenGetOptions: (c1.options as unknown) === frozenOptions,
      leafQueryParamsByReference:
        (c1.options as unknown as AnyRec).queryParams === frozenOptions.queryParams,
      leafQueryParamsFrozen: Object.isFrozen(frozenOptions.queryParams),
    },
    dependencies: {
      freshPerCall: c1.dependencies !== c2.dependencies,
      isLiveStore: (c1.dependencies as unknown) === liveDeps,
      leafByReference: (c1.dependencies as { svc: unknown }).svc === liveDeps.svc,
      frozen: Object.isFrozen(c1.dependencies),
      proto: proto(c1.dependencies),
    },
    pluginFactories: {
      freshPerCall: c1.pluginFactories !== c2.pluginFactories,
      frozen: Object.isFrozen(c1.pluginFactories),
    },
    loggerConfig: {
      freshPerCall: c1.loggerConfig !== c2.loggerConfig,
      frozen: Object.isFrozen(c1.loggerConfig),
    },
    limits: { sameAcrossCalls: c1.limits === c2.limits, frozen: Object.isFrozen(c1.limits) },
    limitKeys: {
      value: c1.limitKeys,
      sameAcrossCalls: c1.limitKeys === c2.limitKeys,
      frozen: c1.limitKeys === undefined ? undefined : Object.isFrozen(c1.limitKeys),
    },
  };

  // --- I. store.matcher.getDeclaredQueryParams — the engine's PRINT registry
  const d1 = store.matcher.getDeclaredQueryParams("u");
  const d2 = store.matcher.getDeclaredQueryParams("u");
  const dHome = store.matcher.getDeclaredQueryParams("home");
  out["I.routeGetStore().matcher.getDeclaredQueryParams"] = {
    control_value: d1 === undefined ? undefined : [...d1],
    control_missingRoute: store.matcher.getDeclaredQueryParams("nope"),
    sameAcrossCalls: d1 === d2,
    isCoreCacheArray: d1 === port.queryNames("u"),
    isFrozen: d1 === undefined ? undefined : Object.isFrozen(d1),
    noQueryRoute_frozenSingleton: dHome === undefined ? undefined : Object.isFrozen(dHome),
    proto: proto(d1),
  };
}

{
  // --- J. positive control of the family measurement: a hand-out KNOWN frozen
  // (matchPath's search channel) and one KNOWN fresh (RoutesApi.get) by the same code
  const { router, routes } = build();
  const s1 = getPluginApi(router).matchPath("/u/1?tab=x")!;
  out["J.controls"] = {
    matchPath_state_frozen: Object.isFrozen(s1),
    matchPath_search_frozen: Object.isFrozen(s1.search),
    routesApiGet_freshShell: routes.get("u") !== routes.get("u"),
  };
}

console.log(JSON.stringify(out, null, 2));
