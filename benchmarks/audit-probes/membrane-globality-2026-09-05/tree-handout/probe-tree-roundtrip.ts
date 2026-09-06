// Door: PluginApi.getTree·return / RouterInternals.getTree·return.
//
// Question: does a write through the handed-out LIVE tree reach core state?
// The tree is frozen node-by-node (computeCaches), but `children` is a Map and
// `Object.freeze` leaves `Map.prototype.set` alive. `RoutesStore.definitions`
// is DERIVED from `store.tree` on every access (`routeTreeToDefinitions`), and
// every rebuild that starts from `store.definitions` — `setRootPath`, `add`,
// `remove`, `cloneRouter` — re-registers whatever the Map holds. Leaf nodes
// share ONE process-wide `EMPTY_CHILDREN_MAP`, so a `.set` on a leaf reaches
// every router in the process, including routers created AFTERWARDS.
//
// Positive control: a LEGAL `add()` observed by the same three probes
// (`has` / `buildPath` / `matchPath`) that judge the injected node.
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Node = {
  name: string;
  path: string;
  absolute: boolean;
  children: Map<string, Node>;
  parent: Node | null;
  nonAbsoluteChildren: Node[];
  fullName: string;
  paramMeta: unknown;
  paramTypeMap: Record<string, string>;
};

const tryWrite = (fn: () => void): string => {
  try {
    fn();
    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 80)}`;
  }
};

// A node of the full RouteTree shape — `routeTreeToDefinitions` reads only
// name/path/absolute/children, but construction-time registration
// (`registerNode`) reads fullName/paramMeta/children/absolute off the node
// itself, so the sentinel cell needs the full shape.
const fakeNode = (name: string, path: string, parent: Node | null): Node => ({
  name,
  path,
  absolute: false,
  children: new Map(),
  parent,
  nonAbsoluteChildren: [],
  fullName: name,
  paramMeta: Object.freeze({
    urlParams: Object.freeze([]),
    queryParams: Object.freeze([]),
    paramTypeMap: Object.freeze({}),
    pathPattern: "",
  }),
  paramTypeMap: Object.freeze({}) as Record<string, string>,
});

const ROUTES = [
  {
    name: "u",
    path: "/u/:id?tab",
    children: [{ name: "c", path: "/c/:cid?q" }],
  },
  { name: "home", path: "/home" },
  { name: "spare", path: "/spare" },
] as never;

const fresh = () => {
  const router = createRouter(ROUTES, { defaultRoute: "home" } as never);
  return {
    router,
    api: getPluginApi(router),
    routes: getRoutesApi(router),
    ctx: getInternals(router),
    tree: getPluginApi(router).getTree() as unknown as Node,
  };
};

// What the three judges say about a route name — the SAME code judges the
// control and every injected node.
const judge = (router: ReturnType<typeof createRouter>, name: string, path: string) => {
  const routes = getRoutesApi(router);
  const api = getPluginApi(router);
  let built: string;
  try {
    built = router.buildPath(name, {} as never);
  } catch (error) {
    built = `throw:${(error as Error).constructor.name}`;
  }
  return {
    has: routes.has(name),
    buildPath: built,
    matchPath: api.matchPath(path)?.name,
    treeHas: (api.getTree() as unknown as Node).children.has(name),
  };
};

const out: Record<string, unknown> = {};

// --- 0. positive control: a LEGAL add, judged by the same three probes
{
  const { router, routes } = fresh();
  const before = judge(router, "legal", "/legal");
  routes.add([{ name: "legal", path: "/legal" }] as never);
  out.control_legalAdd = { before, after: judge(router, "legal", "/legal") };
  router.dispose();
}

// --- 1. identity across the three doors + freeze census at the levels core owns
{
  const { router, api, ctx, tree } = fresh();
  const u = tree.children.get("u")!;
  const c = u.children.get("c")!;
  out.identityAndFreeze = {
    pluginApi_eq_internals: api.getTree() === ctx.getTree(),
    internals_eq_storeTree: ctx.getTree() === (ctx.routeGetStore() as unknown as { tree: Node }).tree,
    stableAcrossCalls: api.getTree() === api.getTree(),
    rootFrozen: Object.isFrozen(tree),
    childrenMapFrozen: Object.isFrozen(tree.children),
    nonAbsoluteChildrenFrozen: Object.isFrozen(tree.nonAbsoluteChildren),
    paramMetaFrozen: Object.isFrozen(u.paramMeta),
    paramTypeMapFrozen: Object.isFrozen(u.paramTypeMap),
    // writes at each level — which freeze actually bites?
    write_nodeField: tryWrite(() => {
      (u as { name: string }).name = "zz";
    }),
    write_nonAbsoluteChildrenPush: tryWrite(() => {
      u.nonAbsoluteChildren.push(fakeNode("z", "/z", u));
    }),
    write_paramTypeMap: tryWrite(() => {
      u.paramTypeMap.__probe__ = "url";
    }),
    write_childrenMapSet: tryWrite(() => {
      c.children.set("__x__", fakeNode("__x__", "/x", c));
    }),
    write_childrenMapDelete: tryWrite(() => {
      u.children.delete("c");
    }),
    afterDelete_treeStillHasC: u.children.has("c"),
    afterDelete_matcherStillHasUC: getRoutesApi(router).has("u.c"),
    afterDelete_definitionsDerivedFromTree_listUC: JSON.stringify(
      (ctx.routeGetStore() as unknown as { definitions: unknown }).definitions,
    ).includes('"c"'),
  };
  // (leaf `c` shares the process sentinel — undo the `.set` so later cells are clean)
  c.children.delete("__x__");
  router.dispose();
}

// --- 2. split-brain window BEFORE any rebuild: tree says yes, matcher says no
{
  const { router, tree, ctx } = fresh();
  tree.children.set("__probe__", fakeNode("__probe__", "/__probe__", tree));
  out.beforeRebuild = {
    ...judge(router, "__probe__", "/__probe__"),
    derivedDefinitionsCarryIt: (
      (ctx.routeGetStore() as unknown as { definitions: { name: string }[] }).definitions
    ).some((d) => d.name === "__probe__"),
    routesApiGet: getRoutesApi(router).get("__probe__"),
  };
  router.dispose();
}

// --- 3. which mutators ROUND-TRIP the poisoned Map into the matcher?
const mutators: Record<string, (r: ReturnType<typeof fresh>) => ReturnType<typeof createRouter>> = {
  "PluginApi.setRootPath": ({ router, api }) => {
    api.setRootPath("/app");
    return router;
  },
  "RoutesApi.add(other)": ({ router, routes }) => {
    routes.add([{ name: "other", path: "/other" }] as never);
    return router;
  },
  "RoutesApi.remove(spare)": ({ router, routes }) => {
    routes.remove("spare");
    return router;
  },
  "cloneRouter(router)": ({ router }) => cloneRouter(router),
  "RoutesApi.update(home,{defaultParams})": ({ router, routes }) => {
    routes.update("home", { defaultParams: {} } as never);
    return router;
  },
  "RoutesApi.replace(ROUTES)": ({ router, routes }) => {
    routes.replace(ROUTES);
    return router;
  },
  "RoutesApi.clear()": ({ router, routes }) => {
    routes.clear();
    return router;
  },
};

for (const [label, mutate] of Object.entries(mutators)) {
  const bundle = fresh();
  bundle.tree.children.set("__probe__", fakeNode("__probe__", "/__probe__", bundle.tree));
  let target: ReturnType<typeof createRouter> | undefined;
  let threw: string | undefined;
  try {
    target = mutate(bundle);
  } catch (error) {
    threw = `${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 100)}`;
  }
  out[`roundTrip · ${label}`] = threw
    ? { threw }
    : {
        ...judge(target!, "__probe__", `${label.startsWith("PluginApi.setRootPath") ? "/app" : ""}/__probe__`),
        treeIdentityChanged: getPluginApi(target!).getTree() !== bundle.tree,
      };
  bundle.router.dispose();
  if (target && target !== bundle.router) target.dispose();
}

// --- 4. always-on registration guards the handout bypasses (reserved "@@", dotted)
{
  const { router, api, tree } = fresh();
  tree.children.set("@@evil", fakeNode("@@evil", "/evil", tree));
  tree.children.set("x.y", fakeNode("x.y", "/xy", tree));
  const control_add_reserved = tryWrite(() => {
    getRoutesApi(router).add([{ name: "@@later", path: "/later" }] as never);
  });
  const control_add_dotted = tryWrite(() => {
    getRoutesApi(router).add([{ name: "p.q", path: "/pq" }] as never);
  });
  api.setRootPath("/r");
  out.guardBypass = {
    control_addReservedThroughTheDoor: control_add_reserved,
    control_addDottedThroughTheDoor: control_add_dotted,
    reservedViaHandout: judge(router, "@@evil", "/r/evil"),
    dottedViaHandout: judge(router, "x.y", "/r/xy"),
  };
  router.dispose();
}

// --- 5. leaf sentinel: one `.set` on a LEAF's children reaches every router,
//        including one created afterwards (registration walks node.children)
{
  const a = createRouter([{ name: "home", path: "/home" }] as never, {} as never);
  const b = createRouter([{ name: "about", path: "/about" }] as never, {} as never);
  const aHome = (getPluginApi(a).getTree() as unknown as Node).children.get("home")!;
  const bAbout = (getPluginApi(b).getTree() as unknown as Node).children.get("about")!;
  const sharedSentinel = aHome.children === bAbout.children;
  aHome.children.set("__leak__", fakeNode("__leak__", "/leak", aHome));
  const bSeesItInTree = bAbout.children.has("__leak__");
  const bBeforeRebuild = getRoutesApi(b).has("__leak__");
  getPluginApi(b).setRootPath("/b");
  const bAfterRebuild = judge(b, "about.__leak__", "/b/about/leak");
  let cConstruct: string = "ok";
  let cHas: unknown;
  let cMatch: unknown;
  try {
    const c = createRouter([{ name: "c", path: "/c" }] as never, {} as never);
    cHas = getRoutesApi(c).has("__leak__");
    cMatch = getPluginApi(c).matchPath("/c/leak")?.name;
    c.dispose();
  } catch (error) {
    cConstruct = `throw:${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 100)}`;
  }
  // restore the process
  aHome.children.delete("__leak__");
  const dAfterCleanup = (() => {
    const d = createRouter([{ name: "d", path: "/d" }] as never, {} as never);
    const r = getRoutesApi(d).has("__leak__");
    d.dispose();
    return r;
  })();
  out.leafSentinel = {
    sharedSentinelAcrossRouters: sharedSentinel,
    bSeesLeakInTreeWithoutTouchingB: bSeesItInTree,
    bMatcherBeforeRebuild: bBeforeRebuild,
    bAfterSetRootPath: bAfterRebuild,
    routerCreatedAfterPoison_construct: cConstruct,
    routerCreatedAfterPoison_hasLeak: cHas,
    routerCreatedAfterPoison_matchesLeakPath: cMatch,
    afterCleanup_newRouterHasLeak: dAfterCleanup,
  };
  a.dispose();
  b.dispose();
}

console.log(JSON.stringify(out, null, 2));
