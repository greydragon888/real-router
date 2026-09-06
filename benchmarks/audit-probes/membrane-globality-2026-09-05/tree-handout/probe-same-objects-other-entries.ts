// The tree family at its OTHER entry points: the same node / Map / registry
// objects reachable through `routeGetStore().tree`, the matcher's
// `getSegmentsByName` / `match(...).segments`, `getMetaForState`, and the
// per-route name registries `getQueryParams` / `port().queryNames` /
// `port().pathNames`. For each: identity with the tree handout, frozen or not,
// and whether a write through it changes what core decides.
//
// Positive control: `RoutesApi.get(name)` — a listed door that hands a FRESH
// frozen shell — judged by the same identity/isFrozen probes.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Node = {
  name: string;
  children: Map<string, Node>;
  paramTypeMap: Record<string, string>;
  paramMeta: { urlParams: readonly string[]; queryParams: readonly string[] };
};

const tryWrite = (fn: () => void): string => {
  try {
    fn();
    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 90)}`;
  }
};

const ROUTES = [
  {
    name: "u",
    path: "/u/:id?tab",
    children: [{ name: "c", path: "/c/:cid?q" }],
  },
  { name: "home", path: "/home" },
] as never;

const out: Record<string, unknown> = {};

// --- control: a listed door with a known outcome (fresh frozen shell per call)
{
  const router = createRouter(ROUTES, {} as never);
  const routes = getRoutesApi(router);
  out.control_RoutesApiGet = {
    freshPerCall: routes.get("u") !== routes.get("u"),
    frozen: Object.isFrozen(routes.get("u")),
  };
  router.dispose();
}

// --- A. routeGetStore().tree / matcher.getSegmentsByName / matcher.match → same nodes
{
  const router = createRouter(ROUTES, {} as never);
  const api = getPluginApi(router);
  const ctx = getInternals(router);
  const tree = api.getTree() as unknown as Node;
  const store = ctx.routeGetStore() as unknown as {
    tree: Node;
    matcher: {
      getSegmentsByName: (n: string) => readonly Node[] | undefined;
      match: (p: string) => { segments: readonly Node[] } | undefined;
      getDeclaredQueryParams: (n: string) => readonly string[] | undefined;
    };
    urlParamsCache: Map<string, string[]>;
    queryParamsCache: Map<string, string[]>;
  };
  const uNode = tree.children.get("u")!;
  const cNode = uNode.children.get("c")!;
  const segs = store.matcher.getSegmentsByName("u.c")!;
  const matched = store.matcher.match("/u/1/c/2")!;
  const segsFrozen = Object.isFrozen(segs);
  // write through the matcher's segment handout — lands in the tree?
  segs.at(-1)!.children.set("__viaSegments__", { name: "__viaSegments__", children: new Map() } as Node);
  const visibleViaGetTree = (api.getTree() as unknown as Node).children.get("u")!.children.get("c")!.children.has("__viaSegments__");
  cNode.children.delete("__viaSegments__"); // leaf → shared sentinel, clean up
  out.A_sameNodesOtherEntries = {
    storeTree_eq_getTree: store.tree === tree,
    getSegmentsByName_last_eq_treeNode: segs.at(-1) === cNode,
    getSegmentsByName_first_eq_treeNode: segs[0] === uNode,
    matchSegments_last_eq_treeNode: matched.segments.at(-1) === cNode,
    segmentsArrayFrozen: segsFrozen,
    segmentsArrayPush: tryWrite(() => {
      (segs as Node[]).push(cNode);
    }),
    childrenSetThroughSegments: "no-throw (see visibleViaGetTree)",
    visibleViaGetTree,
  };
  router.dispose();
}

// --- B. getMetaForState(name) → the very paramTypeMap objects on the tree nodes
{
  const router = createRouter(ROUTES, {} as never);
  const api = getPluginApi(router);
  const ctx = getInternals(router);
  const tree = api.getTree() as unknown as Node;
  const meta = ctx.getMetaForState("u.c")!;
  out.B_getMetaForState = {
    sameAcrossCalls: meta === ctx.getMetaForState("u.c"),
    outerFrozen: Object.isFrozen(meta),
    "meta['u'] === tree.u.paramTypeMap": meta.u === tree.children.get("u")!.paramTypeMap,
    "meta['u.c'] === tree.u.c.paramTypeMap": meta["u.c"] === tree.children.get("u")!.children.get("c")!.paramTypeMap,
    innerFrozen: Object.isFrozen(meta["u.c"]),
    innerWrite: tryWrite(() => {
      (meta["u.c"] as Record<string, string>).__probe__ = "url";
    }),
    outerWrite: tryWrite(() => {
      (meta as Record<string, unknown>).__probe__ = {};
    }),
    unknownRoute: ctx.getMetaForState("nope"),
  };
  router.dispose();
}

// --- C. getQueryParams / port().queryNames: the store CACHE array by reference
{
  const router = createRouter(ROUTES, {} as never);
  const api = getPluginApi(router);
  const ctx = getInternals(router);
  const store = ctx.routeGetStore() as unknown as {
    matcher: { getDeclaredQueryParams: (n: string) => readonly string[] | undefined };
    queryParamsCache: Map<string, string[]>;
  };
  const q = ctx.getQueryParams("u");
  const control_before = {
    buildNavigationState_zzInParams: tryWrite(() => {
      api.buildNavigationState("u", { id: "1", zz: "x" } as never);
    }),
    state_search_zz: (api.buildNavigationState("u", { id: "1" } as never, { zz: "x" } as never) as { search: Record<string, unknown>; path: string }),
    href_zz: router.buildPath("u", { id: "1" } as never, { zz: "x" } as never),
  };
  (q as string[]).push("zz"); // the write through the handout
  const after = {
    getQueryParams_now: [...ctx.getQueryParams("u")],
    matcherRegistry_now: [...(store.matcher.getDeclaredQueryParams("u") ?? [])],
    buildNavigationState_zzInParams: tryWrite(() => {
      api.buildNavigationState("u", { id: "1", zz: "x" } as never);
    }),
    state_search_zz: (api.buildNavigationState("u", { id: "1" } as never, { zz: "x" } as never) as { search: Record<string, unknown>; path: string }),
    href_zz: router.buildPath("u", { id: "1" } as never, { zz: "x" } as never),
  };
  out.C_getQueryParams_handout = {
    identity_eq_portQueryNames: q === ctx.port().queryNames("u"),
    identity_eq_storeCacheEntry: q === store.queryParamsCache.get("u"),
    identity_eq_matcherOwnRegistry: q === store.matcher.getDeclaredQueryParams("u"),
    frozen: Object.isFrozen(q),
    control_before: {
      paramsWithUndeclaredZz: control_before.buildNavigationState_zzInParams,
      stateSearchKeys: Object.keys(control_before.state_search_zz.search),
      statePath: control_before.state_search_zz.path,
      href: control_before.href_zz,
    },
    after_push_zz: {
      cacheRegistry: after.getQueryParams_now,
      matcherRegistry: after.matcherRegistry_now,
      paramsWithZz_nowRefused: after.buildNavigationState_zzInParams,
      stateSearchKeys: Object.keys(after.state_search_zz.search),
      statePath: after.state_search_zz.path,
      href: after.href_zz,
      "state.search ⊆ state.path still holds": after.state_search_zz.path.includes("zz="),
    },
  };
  router.dispose();
}

// --- C2. same write under queryParamsMode "strict": the mode gate ADMITS from the
//         cache registry while the printer DROPS from the matcher's — the
//         always-on "state.search ⊆ state.path" gate (#1575) splits.
{
  const router = createRouter(ROUTES, { queryParamsMode: "strict" } as never);
  const api = getPluginApi(router);
  const ctx = getInternals(router);
  const before = api.buildNavigationState("u", { id: "1" } as never, { zz: "x" } as never) as {
    search: Record<string, unknown>;
    path: string;
  };
  (ctx.getQueryParams("u") as string[]).push("zz");
  const after = api.buildNavigationState("u", { id: "1" } as never, { zz: "x" } as never) as {
    search: Record<string, unknown>;
    path: string;
  };
  out.C2_strictMode_modeGateVsPrinter = {
    control_before: { searchKeys: Object.keys(before.search), path: before.path },
    after_push_zz: { searchKeys: Object.keys(after.search), path: after.path },
    "state.search ⊆ state.path after push": Object.keys(after.search).every((k) => after.path.includes(`${k}=`)),
  };
  router.dispose();
}

// --- D. port().pathNames: the urlParamsCache array by reference → areStatesEqual / query derivation
{
  const router = createRouter(ROUTES, {} as never);
  const ctx = getInternals(router);
  const api = getPluginApi(router);
  const store = ctx.routeGetStore() as unknown as { urlParamsCache: Map<string, string[]> };
  const p = ctx.port().pathNames("u")!;
  const s1 = api.makeState("u", { id: "1", ghost: "a" } as never);
  const s2 = api.makeState("u", { id: "1", ghost: "b" } as never);
  const equalBefore = router.areStatesEqual(s1, s2, true);
  (p as string[]).push("ghost"); // the write through the handout
  const equalAfter = router.areStatesEqual(s1, s2, true);
  // query-registry derivation reads urlParams FIRST (declared minus path slots):
  // a "tab" pushed into pathNames BEFORE the query cache is warm removes it from
  // the query registry.
  const r2 = createRouter(ROUTES, {} as never);
  const ctx2 = getInternals(r2);
  (ctx2.port().pathNames("u") as string[]).push("tab");
  const queryNamesAfterPathPush = [...ctx2.getQueryParams("u")];
  const control_r3 = (() => {
    const r3 = createRouter(ROUTES, {} as never);
    const v = [...getInternals(r3).getQueryParams("u")];
    r3.dispose();
    return v;
  })();
  out.D_pathNames_handout = {
    identity_eq_storeCacheEntry: p === store.urlParamsCache.get("u"),
    frozen: Object.isFrozen(p),
    value: [...p].filter((n) => n !== "ghost"),
    areStatesEqual_ignoreQuery_before: equalBefore,
    areStatesEqual_ignoreQuery_afterPushGhost: equalAfter,
    control_queryNamesOnFreshRouter: control_r3,
    queryNamesAfterPushingTabIntoPathNames: queryNamesAfterPathPush,
    unknownRoute: ctx.port().pathNames("nope"),
  };
  router.dispose();
  r2.dispose();
}

console.log(JSON.stringify(out, null, 2));
