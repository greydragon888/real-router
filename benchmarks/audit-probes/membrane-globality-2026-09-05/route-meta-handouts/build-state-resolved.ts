// The rest of the family — the other containers that carry the meta record or its
// siblings out of core by route name: RouterInternals.buildStateResolved·return
// (a `RouteTreeState` shell: `name`, `params`, `search`, `meta`), Matcher.match·return
// (a `MatchResult`: `segments`, `params`, `search`, `meta` — incl. the per-route
// `cachedResult` sentinel for a static URL) and Matcher.getSegmentsByName·return (the
// frozen `matchSegments` array of tree nodes), both reached via
// routeGetStore().matcher. Cells: fresh-vs-held shell, which fields are core's own
// and which are the caller's bag by reference, Object.isFrozen per level, and
// identity with the doors probed in meta-handout.ts / tree-handout.ts.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

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
      { name: "home", path: "/home?x" },
    ] as never,
    {} as never,
  );
  const ctx = getInternals(router);
  const matcher = ctx.routeGetStore().matcher;
  const tree = getPluginApi(router).getTree();
  const out: Record<string, unknown> = {};

  // --- 1. buildStateResolved·return
  const bag = { id: "1", cid: "2" };
  const r1 = ctx.buildStateResolved("u.c", bag as never)!;
  const r2 = ctx.buildStateResolved("u.c", bag as never)!;

  out.buildStateResolved = {
    freshShellPerCall: r1 !== r2,
    shellFrozen: Object.isFrozen(r1),
    shellKeys: Object.keys(r1),
    params_isCallersBagByReference: r1.params === bag,
    params_frozen: Object.isFrozen(r1.params),
    search_isFresh: (r1 as unknown as { search: object }).search !==
      (r2 as unknown as { search: object }).search,
    search_frozen: Object.isFrozen((r1 as unknown as { search: object }).search),
    meta_isTheHandoutRecord: r1.meta === ctx.getMetaForState("u.c"),
    meta_frozen: Object.isFrozen(r1.meta),
    unknownName: ctx.buildStateResolved("nope", {} as never),
    shellWrite: tryWrite(() => {
      (r1 as unknown as Record<string, unknown>).zzz = 1;
    }),
    callersBagUntouchedKeys: Object.keys(bag),
  };

  // --- 2. Matcher.match·return — static URL (cachedResult sentinel) and param URL
  const s1 = matcher.match("/home")!;
  const s2 = matcher.match("/home")!;
  const sq1 = matcher.match("/home?x=1")!;
  const sq2 = matcher.match("/home?x=1")!;
  const p1 = matcher.match("/u/1/c/2")!;
  const p2 = matcher.match("/u/1/c/2")!;

  out.matcherMatch = {
    static_sameObjectAcrossCalls: s1 === s2,
    static_frozen: Object.isFrozen(s1),
    static_paramsFrozen: Object.isFrozen(s1.params),
    static_paramsSharedWithOtherStaticRoute:
      s1.params === matcher.match("/u/1/c/2")!.params,
    static_searchFrozen: Object.isFrozen(s1.search),
    static_segmentsIsCompiledMatchSegments:
      s1.segments === matcher.getSegmentsByName("home"),
    static_metaIsHandout: s1.meta === ctx.getMetaForState("home"),
    staticWithQuery_freshPerCall: sq1 !== sq2,
    staticWithQuery_shellFrozen: Object.isFrozen(sq1),
    staticWithQuery_paramsFrozen: Object.isFrozen(sq1.params),
    staticWithQuery_paramsFresh: sq1.params !== sq2.params,
    staticWithQuery_searchFrozen: Object.isFrozen(sq1.search),
    staticWithQuery_search: sq1.search,
    param_freshPerCall: p1 !== p2,
    param_shellFrozen: Object.isFrozen(p1),
    param_paramsFrozen: Object.isFrozen(p1.params),
    param_paramsFresh: p1.params !== p2.params,
    param_params: p1.params,
    param_searchFrozen: Object.isFrozen(p1.search),
    param_segmentsSameAcrossCalls: p1.segments === p2.segments,
    param_segmentsIsGetSegmentsByName:
      p1.segments === matcher.getSegmentsByName("u.c"),
    param_metaIsHandout: p1.meta === ctx.getMetaForState("u.c"),
    param_shellWrite: tryWrite(() => {
      (p1 as unknown as Record<string, unknown>).zzz = 1;
    }),
    param_paramsWrite: tryWrite(() => {
      (p1.params as Record<string, unknown>).zzz = 1;
    }),
  };

  // --- 3. Matcher.getSegmentsByName·return
  const g1 = matcher.getSegmentsByName("u.c")!;

  out.getSegmentsByName = {
    sameAcrossCalls: g1 === matcher.getSegmentsByName("u.c"),
    frozen: Object.isFrozen(g1),
    push: tryWrite(() => {
      (g1 as unknown[]).push({});
    }),
    length: g1.length,
    elementsAreTreeNodes:
      g1[0] === tree.children.get("u") &&
      g1[1] === tree.children.get("u")!.children.get("c"),
    unknownName: matcher.getSegmentsByName("nope"),
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
