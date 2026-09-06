// Триаж-батч: matcher.getMetaByName/match/getSegmentsByName · port() и его члены ·
// getCloneState (+ .options/.dependencies/.pluginFactories).
// Каждая ячейка: control (тот же код без записи) + доказательство, что вход дошёл.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};
const t = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
    return "no-throw";
  } catch (e) {
    return `throw:${(e as { constructor: { name: string } }).constructor.name}`;
  }
};

const dp = { id: "d-default" };
function build(opts: AnyRec = {}) {
  const router = createRouter(
    [
      { name: "u", path: "/u/:id?tab", children: [{ name: "c", path: "/c/:cid?q" }] },
      { name: "home", path: "/home" },
      { name: "d", path: "/d/:id?page", defaultParams: dp },
    ] as never,
    { defaultRoute: "home", ...opts } as never,
    { svc: { n: 1 } } as never,
  );
  const ctx = getInternals(router);
  return {
    router,
    ctx,
    plugin: getPluginApi(router),
    routes: getRoutesApi(router),
    store: ctx.routeGetStore() as unknown as {
      matcher: {
        getMetaByName: (n: string) => AnyRec | undefined;
        match: (p: string) => AnyRec | undefined;
        getSegmentsByName: (n: string) => readonly AnyRec[] | undefined;
      };
      tree: { children: Map<string, AnyRec> };
    },
  };
}

async function main(): Promise<void> {
  // --- A. matcher.getMetaByName·return
  {
    const { ctx, store } = build();
    const m1 = store.matcher.getMetaByName("u.c");
    out["A.getMetaByName"] = {
      control_reached_keys: m1 === undefined ? undefined : Object.keys(m1),
      control_missingRoute: store.matcher.getMetaByName("nope"),
      sameAcrossCalls: m1 === store.matcher.getMetaByName("u.c"),
      sameAsGetMetaForState: m1 === (ctx.getMetaForState("u.c") as unknown),
      outerFrozen: Object.isFrozen(m1),
      innerFrozen: Object.values(m1!).map((v) => Object.isFrozen(v)),
      outerWrite: await t(() => {
        (m1 as AnyRec).__probe__ = {};
      }),
      innerWrite: await t(() => {
        (Object.values(m1!)[0] as AnyRec).__probe__ = "url";
      }),
      keysAfter: Object.keys(store.matcher.getMetaByName("u.c")!),
    };
  }

  // --- B. matcher.match·return: static (cachedResult) vs param route
  {
    const { store } = build();
    const st1 = store.matcher.match("/home");
    const st2 = store.matcher.match("/home");
    const pr1 = store.matcher.match("/u/1?tab=x");
    const pr2 = store.matcher.match("/u/1?tab=x");
    out["B.match"] = {
      control_static_reached: st1 === undefined ? undefined : Object.keys(st1),
      control_param_reached: pr1 === undefined ? undefined : Object.keys(pr1),
      control_unmatched: store.matcher.match("/nope/deep/er"),
      staticSameAcrossCalls: st1 === st2,
      staticShellFrozen: Object.isFrozen(st1),
      staticParamsFrozen: Object.isFrozen((st1 as AnyRec).params),
      staticWriteVerdict: await t(() => {
        (st1 as AnyRec).name = "hacked";
      }),
      paramShellFreshPerCall: pr1 !== pr2,
      paramShellFrozen: Object.isFrozen(pr1),
      paramParamsFrozen: Object.isFrozen((pr1 as AnyRec).params),
      paramSearchFrozen: Object.isFrozen((pr1 as AnyRec).search),
      segmentsSameObject:
        (st1 as AnyRec).segments ===
        (store.matcher.getSegmentsByName("home") as unknown),
      metaSameObject:
        (pr1 as AnyRec).meta === (store.matcher.getMetaByName("u") as unknown),
    };
  }

  // --- C. getSegmentsByName·return: те же узлы, что в дереве? запись доходит?
  {
    const { router, routes, plugin, store } = build();
    const segs = store.matcher.getSegmentsByName("u.c");
    const tree = plugin.getTree() as unknown as { children: Map<string, AnyRec> };
    const uNode = tree.children.get("u") as unknown as {
      children: Map<string, AnyRec>;
    };
    out["C.getSegmentsByName"] = {
      control_reached_len: segs?.length,
      control_missingRoute: store.matcher.getSegmentsByName("nope"),
      sameArrayAcrossCalls: segs === store.matcher.getSegmentsByName("u.c"),
      arrayFrozen: Object.isFrozen(segs),
      pushVerdict: await t(() => {
        (segs as AnyRec[]).push({} as AnyRec);
      }),
      elementIsTreeNode: segs?.[0] === (uNode as unknown),
      elementFrozen: segs?.map((s) => Object.isFrozen(s)),
      // мутируем children-Map через элемент, отданный ЭТОЙ дверью
      // segs[0] — узел "u", у него СОБСТВЕННАЯ children-Map (не общий сентинел)
      childrenMapSetVerdict: await t(() => {
        const first = segs![0] as unknown as {
          children: Map<string, AnyRec>;
        };
        const donor = tree.children.get("home")!;
        first.children.set("__probe__", {
          ...donor,
          name: "__probe__",
          fullName: "u.__probe__",
          path: "/__probe__",
          children: new Map(),
          nonAbsoluteChildren: [],
        });
      }),
      hasBeforeRebuild: routes.has("u.__probe__"),
      rebuild: await t(() => routes.add([{ name: "z", path: "/z" }] as never)),
      hasAfterRebuild: routes.has("u.__probe__"),
      buildPathAfterRebuild: await t(() =>
        router.buildPath("u.__probe__", {} as never),
      ),
    };
  }

  // --- D. port·return: тот же объект? читает ли ядро члены обратно?
  {
    const a = build();
    await a.router.start("/home");
    const controlParams = (await a.router.navigate("d", { id: "1" } as never))
      .params;

    const b = build();
    await b.router.start("/home");
    const p1 = b.ctx.port();
    const p2 = b.ctx.port();
    const wrote = await t(() => {
      (p1 as unknown as AnyRec).defaultParams = () => ({ id: "HACKED" });
    });
    const after = await b.router.navigate("d", {} as never);
    out["D.port"] = {
      control_navigateParams: controlParams,
      sameObjectAcrossCalls: p1 === p2,
      frozen: Object.isFrozen(p1),
      proto:
        Object.getPrototypeOf(p1) === Object.prototype
          ? "Object.prototype"
          : "other",
      memberOverwriteVerdict: wrote,
      navigateParamsAfterOverwrite: after.params,
      coreReadsBack: (after.params as AnyRec).id === "HACKED",
    };
  }

  // --- E. port().defaultParams·return — мешок приложения, читается на каждой навигации
  {
    const { router, ctx } = build();
    await router.start("/home");
    const port = ctx.port();
    const handout = port.defaultParams("d");
    const before = (await router.navigate("d", {} as never)).params;
    (handout as AnyRec).id = "MUTATED";
    const after = (await router.navigate("d", {} as never)).params;
    out["E.port.defaultParams"] = {
      isCallersOwnBag: handout === (dp as unknown),
      frozen: Object.isFrozen(handout),
      control_before: before,
      afterCallerMutation: after,
      coreReadsBack: (after as AnyRec).id === "MUTATED",
    };
    (dp as AnyRec).id = "d-default";
  }

  // --- F. getCloneState·return и три поля
  {
    const { ctx, router } = build();
    const c1 = ctx.getCloneState();
    const c2 = ctx.getCloneState();
    const liveDeps = (
      ctx.dependenciesGetStore() as unknown as { dependencies: AnyRec }
    ).dependencies;
    // мутируем каждое поле хэндаута и спрашиваем, изменилось ли что-то в базе
    (c1.options as AnyRec).defaultRoute = "HACKED";
    (c1.dependencies as AnyRec).svc = "HACKED";
    (c1.pluginFactories as unknown[]).push(() => ({}));
    out["F.getCloneState"] = {
      control_shellKeys: Object.keys(c1),
      shellFreshPerCall: c1 !== c2,
      shellFrozen: Object.isFrozen(c1),
      optionsFreshPerCall: c1.options !== c2.options,
      dependenciesFreshPerCall: c1.dependencies !== c2.dependencies,
      pluginFactoriesFreshPerCall: c1.pluginFactories !== c2.pluginFactories,
      // читается ли обратно ядром базы?
      baseOptionsUnaffected: (
        getPluginApi(router).getOptions() as unknown as AnyRec
      ).defaultRoute,
      baseDepsUnaffected: liveDeps.svc,
      nextSnapshotOptions: (ctx.getCloneState().options as AnyRec).defaultRoute,
      nextSnapshotDeps: (ctx.getCloneState().dependencies as AnyRec).svc,
      nextSnapshotFactoriesLen: ctx.getCloneState().pluginFactories.length,
    };
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
