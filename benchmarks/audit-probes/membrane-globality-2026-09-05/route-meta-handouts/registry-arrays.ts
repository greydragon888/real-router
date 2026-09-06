// NEIGHBOR DOORS on the same surface, same key, same store: the name-keyed registry
// ARRAYS. RouterInternals.getQueryParams·return (= the `queryParamsCache` entry,
// helpers.ts · queryParamsFor), RouterInternals.port().queryNames·return (the SAME
// array, wireNamespaces.ts · wireRoutes), RouterInternals.port().pathNames·return
// (= the `urlParamsCache` entry, helpers.ts · urlParamsFor — the array
// `StateNamespace.areStatesEqual` compares on), and Matcher.getDeclaredQueryParams·return
// (the matcher's OWN printer registry, registration/index.ts ·
// collectDeclaredQueryParams, reached via routeGetStore().matcher).
//
// Cells: identity across calls and doors · Object.isFrozen · and the discriminator —
// does a mutation THROUGH the handout change a verdict core computes from the
// registry? Every cell uses a FRESH router and records the verdict BEFORE the
// mutation with the same code (positive control), so a flipped cell is the
// handout's doing and a non-flipped cell is not a broken probe.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
] as never;

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES, {} as never);

const attempt = async (run: () => Promise<unknown> | unknown): Promise<string> => {
  try {
    await run();

    return "ok";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 90)}`;
  }
};

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // --- A. identity + frozen, all four doors, one router
  {
    const router = mk();
    const ctx = getInternals(router);
    const port = ctx.port();
    const matcher = ctx.routeGetStore().matcher;
    const q = ctx.getQueryParams("u");
    const pn = port.pathNames("u")!;
    const mq = matcher.getDeclaredQueryParams("u")!;
    const store = ctx.routeGetStore();

    out.A_identity = {
      getQueryParams_value: [...q],
      getQueryParams_sameAcrossCalls: q === ctx.getQueryParams("u"),
      getQueryParams_isPortQueryNames: q === port.queryNames("u"),
      getQueryParams_isCacheEntry: q === store.queryParamsCache.get("u"),
      getQueryParams_frozen: Object.isFrozen(q),
      pathNames_value: [...pn],
      pathNames_sameAcrossCalls: pn === port.pathNames("u"),
      pathNames_isCacheEntry: pn === store.urlParamsCache.get("u"),
      pathNames_frozen: Object.isFrozen(pn),
      matcherDeclared_value: [...mq],
      matcherDeclared_sameAcrossCalls: mq === matcher.getDeclaredQueryParams("u"),
      matcherDeclared_isDistinctFromClassifierCopy: mq !== q,
      matcherDeclared_frozen: Object.isFrozen(mq),
      staticRoute_matcherDeclared_frozenSentinel: Object.isFrozen(
        matcher.getDeclaredQueryParams("home")!,
      ),
      staticRoute_getQueryParams_frozen: Object.isFrozen(
        ctx.getQueryParams("home"),
      ),
      staticRoute_getQueryParams_value: [...ctx.getQueryParams("home")],
      unknownRoute_getQueryParams: [...ctx.getQueryParams("nope")],
      unknownRoute_pathNames: port.pathNames("nope"),
    };
  }

  // --- B. push a phantom name INTO the classifier through getQueryParams·return
  {
    const router = mk();
    const ctx = getInternals(router);

    await router.start("/home");

    const before = {
      canNavigateTo: router.canNavigateTo("u", { id: "1", zz: "1" } as never),
      navigate: await attempt(() =>
        router.navigate("u", { id: "1", zz: "1" } as never),
      ),
      navigateToState: await attempt(() =>
        getPluginApi(router).navigateToState(
          getPluginApi(router).makeState("u", { id: "2", zz: "1" } as never),
        ),
      ),
    };

    (ctx.getQueryParams("u") as string[]).push("zz");

    const after = {
      registryNow: [...ctx.getQueryParams("u")],
      canNavigateTo: router.canNavigateTo("u", { id: "1", zz: "1" } as never),
      navigate: await attempt(() =>
        router.navigate("u", { id: "1", zz: "1" } as never),
      ),
      navigateToState: await attempt(() =>
        getPluginApi(router).navigateToState(
          getPluginApi(router).makeState("u", { id: "3", zz: "1" } as never),
        ),
      ),
      // the printer is untouched — the matcher's own array is a different object
      buildPathStillIgnoresPhantom: router.buildPath("u", { id: "1" } as never, {
        zz: "9",
      } as never),
    };

    out.B_pushPhantomIntoClassifier = { before, after };
  }

  // --- C. EMPTY the classifier copy: printer and classifier now disagree
  {
    const router = mk();
    const ctx = getInternals(router);

    await router.start("/home");

    const sBefore = await router.navigate(
      "u",
      { id: "1" } as never,
      { tab: "x" } as never,
    );
    const before = {
      search_positional: { path: sBefore.path, search: sBefore.search },
      tabInParams: await attempt(() =>
        router.navigate("u", { id: "1", tab: "x" } as never),
      ),
    };

    (ctx.getQueryParams("u") as string[]).length = 0;

    const sAfter = await router.navigate(
      "u",
      { id: "2" } as never,
      { tab: "y" } as never,
    );
    let misChanneled: unknown;
    const tabInParamsAfter = await attempt(async () => {
      misChanneled = await router.navigate("u", { id: "3", tab: "z" } as never);
    });
    const ms = misChanneled as
      | { path: string; params: unknown; search: unknown }
      | undefined;

    out.C_emptyClassifier = {
      before,
      after: {
        registryNow: [...ctx.getQueryParams("u")],
        search_positional: { path: sAfter.path, search: sAfter.search },
        tabInParams: tabInParamsAfter,
        tabInParams_committed:
          ms === undefined
            ? undefined
            : { path: ms.path, params: ms.params, search: ms.search },
      },
    };
  }

  // --- D. EMPTY pathNames (urlParamsCache) — the slot set areStatesEqual compares on
  {
    const router = mk();
    const ctx = getInternals(router);
    const api = getPluginApi(router);

    await router.start("/u/1");

    const s1 = api.makeState("u", { id: "1" } as never);
    const s2 = api.makeState("u", { id: "2" } as never);
    const before = {
      areStatesEqual_id1_vs_id2: router.areStatesEqual(s1, s2),
      isActiveRoute_u_id2_whileOn_id1: router.isActiveRoute("u", {
        id: "2",
      } as never),
    };

    (ctx.port().pathNames("u") as string[]).length = 0;

    const after = {
      registryNow: [...ctx.port().pathNames("u")!],
      areStatesEqual_id1_vs_id2: router.areStatesEqual(s1, s2),
      isActiveRoute_u_id2_whileOn_id1: router.isActiveRoute("u", {
        id: "2",
      } as never),
      // a rebuild discards the mutated cache entry
      afterCrudRebuild_registry: (() => {
        getRoutesApi(router).add({ name: "x", path: "/x" } as never);

        return [...ctx.port().pathNames("u")!];
      })(),
      afterCrudRebuild_areStatesEqual: router.areStatesEqual(s1, s2),
    };

    out.D_emptyPathNames = { before, after };
  }

  // --- E. the matcher's OWN printer array (getDeclaredQueryParams) — push before the
  //        classifier cache is warm, so the derived copy inherits the phantom
  {
    const control = mk();

    await control.start("/home");

    const before = {
      navigate_zzInParams: await attempt(() =>
        control.navigate("u", { id: "1", zz: "1" } as never),
      ),
      buildPath_zzInSearch: control.buildPath("u", { id: "1" } as never, {
        zz: "9",
      } as never),
    };

    const router = mk();
    const ctx = getInternals(router);

    (ctx.routeGetStore().matcher.getDeclaredQueryParams("u") as string[]).push(
      "zz",
    );
    await router.start("/home");

    const after = {
      matcherArrayNow: [...ctx.routeGetStore().matcher.getDeclaredQueryParams("u")!],
      classifierDerivedNow: [...ctx.getQueryParams("u")],
      navigate_zzInParams: await attempt(() =>
        router.navigate("u", { id: "1", zz: "1" } as never),
      ),
      buildPath_zzInSearch: router.buildPath("u", { id: "1" } as never, {
        zz: "9",
      } as never),
      navigate_zzInSearch_committed: await (async () => {
        const s = await router.navigate(
          "u",
          { id: "1" } as never,
          { zz: "9" } as never,
        );

        return { path: s.path, search: s.search };
      })(),
    };

    out.E_matcherPrinterArray = { before, after };
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
