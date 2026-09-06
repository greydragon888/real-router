// Lens "port-registry-handouts", verdict BY EXECUTION: does a write through
// each handed-out object change what core decides afterwards? Every cell has a
// control (same code, no write) and shows the input reached the branch.
// The order-of-access axis (cache warm vs cold, before/after a rebuild) is
// swept explicitly — the registry caches are per-name and cleared on rebuild.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

type AnyRec = Record<string, unknown>;

function build(extra: AnyRec = {}) {
  const ds = { page: "1" };
  const router = createRouter(
    [
      {
        name: "u",
        path: "/u/:id?tab",
        children: [{ name: "c", path: "/c/:cid?q" }],
      },
      { name: "home", path: "/home" },
      { name: "d", path: "/d/:id?page", defaultSearch: ds },
    ] as never,
    { defaultRoute: "home", ...extra } as never,
  );

  return {
    router,
    ds,
    ctx: getInternals(router),
    plugin: getPluginApi(router),
    routes: getRoutesApi(router),
    port: getInternals(router).port(),
  };
}

const describeThrow = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
    return "no-throw";
  } catch (error) {
    const e = error as { constructor: { name: string }; code?: string };
    return `throw:${e.constructor.name}${e.code ? `/${e.code}` : ""}`;
  }
};

async function main(): Promise<void> {
  const out: AnyRec = {};

  // ---------------------------------------------------------------------------
  // 1. CONTROL — the channel guard on an untouched registry
  {
    const { router } = build();
    await router.start("/home");
    out["1.control_navigate_tabInParams"] = await describeThrow(() =>
      router.navigate("u", { id: "1", tab: "x" } as never),
    );
  }

  // ---------------------------------------------------------------------------
  // 2. pathNames read FIRST (query cache cold), "tab" pushed as a path slot →
  //    queryParamsFor subtracts it → the guard no longer sees a query name.
  {
    const { router, port } = build();
    await router.start("/home");
    const pn = port.pathNames("u") as string[];
    pn.push("tab");
    const qn = [...port.queryNames("u")];
    const verdict = await describeThrow(() =>
      router.navigate("u", { id: "1", tab: "x" } as never),
    );
    const s = router.getState()!;
    out["2.pathNamesPushed_before_queryNames"] = {
      pathNamesAfterPush: [...port.pathNames("u")!],
      queryNamesDerived: qn,
      navigateVerdict: verdict,
      committed: { name: s.name, params: s.params, search: s.search, path: s.path },
      stateContradictsItsOwnUrl:
        (s.params as AnyRec).tab === "x" && !s.path.includes("tab"),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. ORDER SWEEP — queryNames read FIRST (cache warm), then the same push:
  //    the cached query registry is unaffected until the next rebuild, which
  //    recomputes from the (frozen) engine source and drops the mutated array.
  {
    const { router, port, routes } = build();
    await router.start("/home");
    const qnWarm = port.queryNames("u");
    const pn = port.pathNames("u") as string[];
    pn.push("tab");
    const verdictWarm = await describeThrow(() =>
      router.navigate("u", { id: "1", tab: "x" } as never),
    );
    routes.add([{ name: "z", path: "/z" }] as never);
    const verdictAfterRebuild = await describeThrow(() =>
      router.navigate("u", { id: "1", tab: "x" } as never),
    );
    out["3.orderSweep_queryNamesWarm_thenPush_thenRebuild"] = {
      queryNamesStillWarm: qnWarm === port.queryNames("u") ? "same-array" : "replaced",
      verdictWhileWarm: verdictWarm,
      pathNamesAfterRebuild: [...port.pathNames("u")!],
      mutatedHandleDroppedByRebuild: port.pathNames("u") !== pn,
      verdictAfterRebuild,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. DIAGNOSTIC — validation-plugin's undeclared-key reporter reads pathNames
  {
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(String(args[0]));
    };
    try {
      const a = build();
      a.router.usePlugin(validationPlugin() as never);
      a.plugin.buildNavigationState("u", { id: "1", zzz: "1" } as never);
      const controlWarnCount = warns.length;
      const controlMentionsZzz = warns.some((w) => w.includes('"zzz"'));
      warns.length = 0;

      const b = build();
      b.router.usePlugin(validationPlugin() as never);
      const sinkPresent = typeof b.port.reportUndeclaredParamKey;
      (b.port.pathNames("u") as string[]).push("zzz");
      b.plugin.buildNavigationState("u", { id: "1", zzz: "1" } as never);
      out["4.validationPlugin_undeclaredKeyDiagnostic"] = {
        control_warnCount: controlWarnCount,
        control_mentionsZzz: controlMentionsZzz,
        mutated_sinkPresent: sinkPresent,
        mutated_warnCount: warns.length,
      };
    } finally {
      console.warn = orig;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. areStatesEqual — StateNamespaceDependencies.getUrlParams is the SAME array
  {
    const { router, plugin, port } = build();
    const s1 = plugin.makeState("u", { id: "1", extra: "a" } as never);
    const s2 = plugin.makeState("u", { id: "1", extra: "b" } as never);
    const control = router.areStatesEqual(s1, s2);
    (port.pathNames("u") as string[]).push("extra");
    out["5.areStatesEqual_viaGetUrlParams"] = {
      control_equalIgnoringNonSlot: control,
      afterPushExtraAsSlot: router.areStatesEqual(s1, s2),
    };
  }

  // ---------------------------------------------------------------------------
  // 6. navigateToState — NavigationDependencies.getQueryParams is the SAME array
  {
    const a = build();
    await a.router.start("/home");
    const sa = a.plugin.makeState("u", { id: "1" } as never);
    const control = await describeThrow(() => a.plugin.navigateToState(sa));

    const b = build();
    await b.router.start("/home");
    const sb = b.plugin.makeState("u", { id: "1" } as never);
    (b.port.queryNames("u") as string[]).push("id");
    out["6.navigateToState_viaGetQueryParams"] = {
      control: control,
      afterPushIdIntoQueryNames: await describeThrow(() =>
        b.plugin.navigateToState(sb),
      ),
      makeStateNowRefuses: await describeThrow(() =>
        b.plugin.makeState("u", { id: "1" } as never),
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // 7. ENGINE registry through the store door — the PRINT registry is live.
  //    `queryParamsMode: "strict"` so an undeclared key is DROPPED in the
  //    control (the repo default is `loose`, which would print it either way).
  {
    const a = build({ queryParamsMode: "strict" });
    const controlHref = a.router.buildPath("u", { id: "1" } as never, {
      extra: "v",
    } as never);
    const controlQn = [...a.port.queryNames("u")];
    const controlGuard = await describeThrow(() =>
      a.plugin.buildNavigationState("u", { id: "1", extra: "v" } as never),
    );

    const b = build({ queryParamsMode: "strict" });
    const store = b.ctx.routeGetStore() as unknown as {
      matcher: { getDeclaredQueryParams: (n: string) => readonly string[] };
    };
    (store.matcher.getDeclaredQueryParams("u") as string[]).push("extra");
    out["7.engineDeclaredQueryParams_viaRouteGetStore_strictMode"] = {
      control_href: controlHref,
      control_queryNames: controlQn,
      control_guardOnExtraInParams: controlGuard,
      mutated_href: b.router.buildPath("u", { id: "1" } as never, {
        extra: "v",
      } as never),
      mutated_queryNames: [...b.port.queryNames("u")],
      mutated_guardOnExtraInParams: await describeThrow(() =>
        b.plugin.buildNavigationState("u", { id: "1", extra: "v" } as never),
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // 8. port.defaultSearch — the caller's own bag, read live at every merge
  {
    const { router, ds, port } = build();
    await router.start("/home");
    const before = (await router.navigate("d", { id: "1" } as never)).search;
    ds.page = "9";
    const after = (await router.navigate("d", { id: "2" } as never)).search;
    out["8.defaultSearch_callersBagLive"] = {
      handoutIsCallersBag: port.defaultSearch("d") === ds,
      control_before: before,
      afterCallerMutation: after,
    };
  }

  // ---------------------------------------------------------------------------
  // 9. getTree — frozen node, but `children` is a Map: Map.prototype.set works,
  //    and the next rebuild derives definitions from that Map.
  {
    const { router, plugin, routes } = build();
    const tree = plugin.getTree() as unknown as {
      children: Map<string, AnyRec>;
    };
    const home = tree.children.get("home")!;
    const fake = { ...home, name: "__probe__", fullName: "__probe__", path: "/__probe__" };
    const setVerdict = await describeThrow(() => {
      tree.children.set("__probe__", fake);
    });
    const hasBeforeRebuild = routes.has("__probe__");
    const rebuild = await describeThrow(() =>
      routes.add([{ name: "z", path: "/z" }] as never),
    );
    out["9.getTree_childrenMapSet_thenRebuild"] = {
      mapSetVerdict: setVerdict,
      hasProbeBeforeRebuild: hasBeforeRebuild,
      rebuildVerdict: rebuild,
      hasProbeAfterRebuild: routes.has("__probe__"),
      buildPathProbeAfterRebuild: await describeThrow(() =>
        router.buildPath("__probe__", {} as never),
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // 10. getCloneState.limitKeys — frozen at the source (needs a limits bag)
  {
    const { ctx } = build({ limits: { maxDependencies: 5 } });
    const c = ctx.getCloneState();
    out["10.getCloneState_limitKeys"] = {
      value: c.limitKeys,
      frozen: c.limitKeys === undefined ? undefined : Object.isFrozen(c.limitKeys),
      pushVerdict: await describeThrow(() => {
        (c.limitKeys as string[]).push("x");
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // 11. getMetaForState — frozen at both levels: a write cannot land
  {
    const { ctx } = build();
    const m = ctx.getMetaForState("u.c")!;
    const inner = m["u.c"] as Record<string, string>;
    out["11.getMetaForState_writeCannotLand"] = {
      control_innerKeys: Object.keys(inner),
      outerWrite: await describeThrow(() => {
        (m as Record<string, unknown>).__probe__ = {};
      }),
      innerWrite: await describeThrow(() => {
        inner.__probe__ = "url";
      }),
      innerKeysAfter: Object.keys(ctx.getMetaForState("u.c")!["u.c"]!),
    };
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
