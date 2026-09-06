// Door: PluginApi.getTree·return ≡ RouterInternals.getTree·return (one
// reference — `store.tree`). The tree is frozen at every level core owns
// (`engine/builder/computeCaches.ts · processNode`), and the wiki page
// `getTree.md` § Immutability promises the `children` Map is read-only. But
// `Object.freeze` does not reach a Map's internal slots, so `children.set`
// lands. Leaf nodes share ONE module-level `EMPTY_CHILDREN_MAP` sentinel
// (`computeCaches.ts`), so a write through one router's leaf is visible from
// every router in the process — and registration walks `node.children.values()`
// (`registration/index.ts · registerNode`), so a router created AFTER the write
// compiles the injected node into its matcher.
//
// Also here: RouterInternals.getMetaForState·return (frozen — non-door proof),
// RouterInternals.port·return (the read-model object itself), and the WeakMap
// identity reliance of `getRouteUtils` on the tree root.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { getRouteUtils } from "../../../../packages/route-utils/src/getRouteUtils";

type AnyRec = Record<string, unknown>;
type Node = {
  name: string;
  path: string;
  fullName: string;
  absolute: boolean;
  children: Map<string, Node>;
  nonAbsoluteChildren: readonly Node[];
  paramMeta: AnyRec;
  paramTypeMap: AnyRec;
  parent: Node | null;
};

const tryRun = (fn: () => unknown): string => {
  try {
    fn();
    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}:${(error as Error).message.slice(0, 80)}`;
  }
};

const fakeLeaf = (parent: Node, name: string, path: string): Node => ({
  name,
  path,
  fullName: parent.fullName ? `${parent.fullName}.${name}` : name,
  absolute: false,
  children: new Map(),
  nonAbsoluteChildren: [],
  paramMeta: {
    urlParams: [],
    queryParams: [],
    paramTypeMap: {},
    pathPattern: path,
  },
  paramTypeMap: {},
  parent,
});

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const ROUTES = [
    { name: "home", path: "/home" },
    { name: "u", path: "/u/:id?tab", children: [{ name: "c", path: "/c/:cid?q" }] },
  ] as never;
  const A = createRouter(ROUTES, { defaultRoute: "home" } as never);
  const B = createRouter(ROUTES, { defaultRoute: "home" } as never);
  const apiA = getPluginApi(A);
  const ctxA = getInternals(A);
  const treeA = apiA.getTree() as unknown as Node;
  const treeB = getPluginApi(B).getTree() as unknown as Node;

  // 1. identity + frozenness at the levels core owns
  out.handout = {
    sameObjectAcrossDoors: treeA === (ctxA.getTree() as unknown),
    sameObjectAcrossCalls: apiA.getTree() === apiA.getTree(),
    isTheStoreTree: treeA === (ctxA.routeGetStore().tree as unknown),
    rootFrozen: Object.isFrozen(treeA),
    childrenIsMap: treeA.children instanceof Map,
    childrenFrozen: Object.isFrozen(treeA.children),
    leafHomeChildrenFrozen: Object.isFrozen(treeA.children.get("home")!.children),
    paramMetaFrozen: Object.isFrozen(treeA.children.get("u")!.paramMeta),
    urlParamsFrozen: Object.isFrozen(treeA.children.get("u")!.paramMeta.urlParams),
    // WeakMap identity reliance downstream (route-utils, used by 6 adapters)
    routeUtilsMemoisedByRootIdentity:
      getRouteUtils(apiA.getTree() as never) === getRouteUtils(apiA.getTree() as never),
    // the shared leaf sentinel: A's leaf and B's leaf hold the SAME Map
    leafChildrenSharedAcrossRouters:
      treeA.children.get("home")!.children === treeB.children.get("home")!.children,
  };

  // 2. controls — before any write
  out.controls = {
    A_hasRoute_injected: getRoutesApi(A).has("__inj__"),
    A_definitions: ctxA.routeGetStore().definitions.map((d: { name: string }) => d.name),
    B_hasRoute_homeChild: getRoutesApi(B).has("home.__x__"),
    fresh_hasRoute_homeChild: getRoutesApi(createRouter(ROUTES, {} as never)).has("home.__x__"),
  };

  // 3. write through the frozen Map — the ROOT level: a new top-level node
  const rootWrite = tryRun(() => {
    treeA.children.set("__inj__", fakeLeaf(treeA, "__inj__", "/inj"));
  });
  const afterRootWrite: Record<string, unknown> = {
    write: rootWrite,
    visibleOnSecondCall: (apiA.getTree() as unknown as Node).children.has("__inj__"),
    landsIn_storeDefinitions: ctxA.routeGetStore().definitions.map((d: { name: string }) => d.name),
    hasRoute_beforeRebuild: getRoutesApi(A).has("__inj__"),
  };
  // the next CRUD rebuilds from `store.definitions` (= routeTreeToDefinitions(store.tree))
  afterRootWrite.add_z = tryRun(() => getRoutesApi(A).add({ name: "z", path: "/z" } as never));
  afterRootWrite.hasRoute_afterRebuild = getRoutesApi(A).has("__inj__");
  afterRootWrite.buildPath_injected = tryRun(() => A.buildPath("__inj__"));
  afterRootWrite.buildPath_value = getRoutesApi(A).has("__inj__") ? A.buildPath("__inj__") : undefined;
  afterRootWrite.matchPath_injected = getPluginApi(A).matchPath("/inj")?.name;
  out.rootLevelWrite = afterRootWrite;

  // 4. write through a LEAF's children — the shared sentinel: cross-router
  const leafA = treeA.children.get("u")!.children.get("c")!; // a leaf of A (post-rebuild tree differs; re-read)
  const treeA2 = apiA.getTree() as unknown as Node;
  const leafA2 = treeA2.children.get("home")!;
  const leafWrite = tryRun(() => {
    leafA2.children.set("__x__", fakeLeaf(leafA2, "__x__", "/x"));
  });
  const C = createRouter(ROUTES, { defaultRoute: "home" } as never); // created AFTER the write
  out.leafLevelWrite_sharedSentinel = {
    write: leafWrite,
    A_leafHasIt: leafA2.children.has("__x__"),
    B_leafHasIt: treeB.children.get("home")!.children.has("__x__"),
    B_definitions_home: (getInternals(B).routeGetStore().definitions as { name: string; children?: unknown[] }[]).find((d) => d.name === "home"),
    B_hasRoute_beforeRebuild: getRoutesApi(B).has("home.__x__"),
    B_add_then_hasRoute: (() => {
      const r = tryRun(() => getRoutesApi(B).add({ name: "z", path: "/z" } as never));
      return { add: r, hasRoute: getRoutesApi(B).has("home.__x__"), buildPath: getRoutesApi(B).has("home.__x__") ? B.buildPath("home.__x__") : undefined };
    })(),
    // a router constructed AFTER the write: registration walks the sentinel
    C_hasRoute_atConstruction: getRoutesApi(C).has("home.__x__"),
    C_matchPath: getPluginApi(C).matchPath("/home/x")?.name,
    leafA_unused: typeof leafA,
  };
  // clean the process-wide sentinel so nothing below is polluted
  leafA2.children.delete("__x__");
  out.cleanup = {
    B_leafHasItAfterDelete: treeB.children.get("home")!.children.has("__x__"),
  };

  // 5. getMetaForState·return — frozen at both levels (non-door)
  // `queryParamsMode: "default"` so the mode gate RUNS (the repo default is
  // `loose`, where `queryNames` is never consulted by the gate).
  const D = createRouter(ROUTES, {
    defaultRoute: "home",
    queryParamsMode: "default",
  } as never);
  const ctxD = getInternals(D);
  const m1 = ctxD.getMetaForState("u.c")!;
  const treeD = getPluginApi(D).getTree() as unknown as Node;
  out.getMetaForState = {
    sameAcrossCalls: m1 === ctxD.getMetaForState("u.c"),
    outerFrozen: Object.isFrozen(m1),
    innerFrozen: Object.values(m1).map((v) => Object.isFrozen(v)),
    innerIsTheTreeNodesParamTypeMap:
      m1["u.c"] === (treeD.children.get("u")!.children.get("c")!.paramTypeMap as unknown),
    innerWrite: tryRun(() => {
      (m1["u.c"] as Record<string, string>).__probe__ = "url";
    }),
    outerWrite: tryRun(() => {
      (m1 as Record<string, unknown>).__probe__ = {};
    }),
    innerKeysAfter: Object.keys(m1["u.c"]),
    missingRoute: ctxD.getMetaForState("nope"),
  };

  // 6. RouterInternals.port·return — the read-model object itself
  const port = ctxD.port();
  await D.start("/home");
  const ctrl = await D.navigate("u", { id: "1" } as never, { tab: "x" } as never);
  const original = port.queryNames;
  const portWrite = tryRun(() => {
    (port as { queryNames: unknown }).queryNames = () => [];
  });
  await D.navigate("home");
  const steered = await D.navigate("u", { id: "1" } as never, { tab: "x" } as never);
  (port as { queryNames: unknown }).queryNames = original;
  out.portObject = {
    sameAcrossCalls: port === ctxD.port(),
    isFrozen: Object.isFrozen(port),
    proto: Object.getPrototypeOf(port) === Object.prototype ? "Object.prototype" : "other",
    ownKeys: Object.keys(port),
    memberReassign: portWrite,
    control_state: { path: ctrl.path, search: ctrl.search },
    steered_state: { path: steered.path, search: steered.search },
    internalsRecordFrozen: Object.isFrozen(ctxD),
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
