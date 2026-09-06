// SAME OBJECT, OTHER ENTRY: PluginApi.getTree·return / RouterInternals.getTree·return —
// the route-tree node whose `paramTypeMap` IS the meta record's leaf (buildMeta
// writes `meta[segment.fullName] = segment.paramTypeMap`).
//
// Cells: identity across calls and across the two doors · Object.isFrozen at every
// level core minted (node, paramMeta, paramTypeMap, the two name arrays,
// nonAbsoluteChildren, the children Map SHELL) · writes through the handout · the
// MUST-(б) proof — two shipped consumers key on the ROOT's IDENTITY
// (`@real-router/route-utils` getRouteUtils: `WeakMap<RouteTreeNode, RouteUtils>`;
// `search-schema-plugin` #pathParams: `tree !== this.#cachedTree` invalidation), so
// a copy per call defeats both — shown by handing a spread copy to the REAL
// getRouteUtils · the Map shell-freeze carve-out incl. the shared EMPTY_CHILDREN_MAP
// sentinel (#1240 — documented and accepted by the owner; reproduced here as a
// known fact, not a new finding).
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { getRouteUtils } from "../../../../packages/route-utils/src/getRouteUtils";

const tryWrite = (fn: () => void): string => {
  try {
    fn();

    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}`;
  }
};

function main(): void {
  const router = createRouter(
    [
      {
        name: "u",
        path: "/u/:id?tab",
        children: [{ name: "c", path: "/c/:cid?q" }],
      },
      { name: "home", path: "/home" },
    ] as never,
    {} as never,
  );
  const plugin = getPluginApi(router);
  const ctx = getInternals(router);
  const out: Record<string, unknown> = {};

  const t = plugin.getTree();
  const nodeU = t.children.get("u")!;
  const leafHome = t.children.get("home")!;

  // --- 1. identity
  out.identity = {
    sameAcrossCalls: t === plugin.getTree(),
    sameAcrossDoors: t === ctx.getTree(),
    isTheStoreTree: t === ctx.routeGetStore().tree,
    node_u_paramTypeMap_isMetaLeaf:
      nodeU.paramTypeMap === ctx.getMetaForState("u")!.u,
    node_u_paramTypeMap_isParamMeta_paramTypeMap:
      nodeU.paramTypeMap === nodeU.paramMeta.paramTypeMap,
    node_u_isMatcherSegment:
      nodeU === ctx.routeGetStore().matcher.getSegmentsByName("u")![0],
  };

  // --- 2. frozen at every level core minted
  out.frozen = {
    root: Object.isFrozen(t),
    node_u: Object.isFrozen(nodeU),
    node_u_paramMeta: Object.isFrozen(nodeU.paramMeta),
    node_u_paramTypeMap: Object.isFrozen(nodeU.paramTypeMap),
    node_u_urlParams: Object.isFrozen(nodeU.paramMeta.urlParams),
    node_u_queryParams: Object.isFrozen(nodeU.paramMeta.queryParams),
    node_u_nonAbsoluteChildren: Object.isFrozen(nodeU.nonAbsoluteChildren),
    node_u_childrenMapShell: Object.isFrozen(nodeU.children),
    leaf_home_childrenMapShell: Object.isFrozen(leafHome.children),
    leaf_home_paramMeta: Object.isFrozen(leafHome.paramMeta),
  };

  // --- 3. writes through the handout
  out.writes = {
    paramTypeMap_assign: tryWrite(() => {
      (nodeU.paramTypeMap as Record<string, string>).zzz = "url";
    }),
    urlParams_push: tryWrite(() => {
      (nodeU.paramMeta.urlParams as string[]).push("zzz");
    }),
    nonAbsoluteChildren_push: tryWrite(() => {
      (nodeU.nonAbsoluteChildren as unknown[]).push({});
    }),
    node_assign: tryWrite(() => {
      (nodeU as unknown as Record<string, unknown>).zzz = 1;
    }),
    childrenMap_set: tryWrite(() => {
      (nodeU.children as Map<string, unknown>).set("ghost", leafHome);
    }),
    childrenMap_hasGhostAfterSet: nodeU.children.has("ghost"),
    childrenMap_ghostVisibleViaSecondCall: plugin
      .getTree()
      .children.get("u")!
      .children.has("ghost"),
  };
  (nodeU.children as Map<string, unknown>).delete("ghost");

  // --- 4. MUST-(б): consumers key on the root's IDENTITY
  const u1 = getRouteUtils(t);
  const u2 = getRouteUtils(plugin.getTree());
  const copies = [1, 2, 3].map(() => getRouteUtils({ ...t }));

  out.identityConsumers = {
    getRouteUtils_sameInstanceAcrossCalls: u1 === u2,
    getRouteUtils_spreadCopy_isCacheMiss: getRouteUtils({ ...t }) !== u1,
    getRouteUtils_threeCopies_distinctInstances: new Set(copies).size,
    // search-schema-plugin `#pathParams`: `tree !== this.#cachedTree` clears its
    // per-route cache — a fresh object per call would clear it on EVERY call.
    searchSchema_invalidationPredicate_onHandle: t !== plugin.getTree(),
    searchSchema_invalidationPredicate_onCopy: t !== { ...t },
  };

  // --- 5. the shared EMPTY_CHILDREN_MAP sentinel (#1240, accepted) — cross-router
  const other = createRouter([{ name: "o", path: "/o" }] as never, {} as never);
  const leafO = getPluginApi(other).getTree().children.get("o")!;

  out.sentinel_1240 = {
    leafChildrenMapSharedAcrossRouters: leafHome.children === leafO.children,
    contaminationVisibleInUnrelatedTree: (() => {
      (leafHome.children as Map<string, unknown>).set("ghost", leafHome);

      const seen = leafO.children.has("ghost");

      (leafHome.children as Map<string, unknown>).delete("ghost");

      return seen;
    })(),
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
