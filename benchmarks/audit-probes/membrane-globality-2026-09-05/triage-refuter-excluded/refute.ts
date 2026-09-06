// ОПРОВЕРГАТЕЛЬ ТРИАЖА: попытка ВЕРНУТЬ в знаменатель строки, исключённые как
// handout / not-a-door. Приём: на ОТДАННЫЙ объект вешаются счётные геттеры
// (Object.defineProperty), после чего гоняются все ядровые пути, которые могли
// бы прочитать его ОБРАТНО. Ненулевой счёт после отдачи = round-trip = дверь.
// На emit-двери вход подаётся счётным Proxy.
import { createRouter, getNavigator } from "@real-router/core";
import { getPluginApi, getRoutesApi, cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};

/** Вешает счётчики чтений на СОБСТВЕННЫЕ ключи отданного объекта. */
function countReads(obj: object): { readonly n: number; keys: string[] } {
  const box = { n: 0, keys: [] as string[] };
  for (const k of Object.keys(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, k);
    if (!d || !d.configurable || d.get) continue;
    const v = d.value;
    Object.defineProperty(obj, k, {
      configurable: true,
      enumerable: d.enumerable,
      get() {
        box.n++;
        box.keys.push(k);
        return v;
      },
      set(nv: unknown) {
        Object.defineProperty(obj, k, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: nv,
        });
      },
    });
  }
  return box;
}

function countingProxy(target: AnyRec): {
  p: AnyRec;
  box: { n: number; keys: string[] };
} {
  const box = { n: 0, keys: [] as string[] };
  const p = new Proxy(target, {
    get(t, k, r) {
      if (typeof k === "string") {
        box.n++;
        box.keys.push(k);
      }
      return Reflect.get(t, k, r);
    },
  });
  return { p, box };
}

function build() {
  const router = createRouter(
    [
      {
        name: "u",
        path: "/u/:id?tab",
        children: [{ name: "c", path: "/c/:cid" }],
      },
      { name: "home", path: "/home" },
      { name: "plain", path: "/plain/:id?q" },
      { name: "src", path: "/src", forwardTo: "home" },
    ] as never,
    { defaultRoute: "home" } as never,
    { svc: { n: 1 } } as never,
  );
  return { router, ctx: getInternals(router) as unknown as AnyRec };
}

async function main(): Promise<void> {
  // ===== R1. emitTransitionError·error (PluginApi + RouterInternals) ========
  {
    const { router, ctx } = build();
    const api = getPluginApi(router);
    const raw = Object.assign(new Error("probe"), { tag: "mine" });
    const { p: err, box } = countingProxy(raw as unknown as AnyRec);
    let received: unknown;
    let calls = 0;
    api.addEventListener("$$error" as never, ((
      _t: unknown,
      _f: unknown,
      e: unknown,
    ) => {
      calls++;
      received = e;
    }) as never);
    await router.start("/u/1");
    const beforeEmit = box.n;
    api.emitTransitionError(err as never);
    const afterPluginEmit = box.n;
    (ctx.emitTransitionError as (e: unknown) => void)(err);
    const afterInternalsEmit = box.n;
    await router.navigate("plain", { id: "3" } as never, { q: "x" } as never);
    await router.navigate("u.c", { id: "1", cid: "2" } as never);
    router.getState();
    await router.stop();
    out.R1 = {
      control_listenerCalls: calls,
      control_listenerGotSameReference: received === (err as unknown),
      readsBeforeEmit: beforeEmit,
      readsAddedByPluginEmit: afterPluginEmit - beforeEmit,
      readsAddedByInternalsEmit: afterInternalsEmit - afterPluginEmit,
      readsAddedAfterEmits_laterFrames: box.n - afterInternalsEmit,
      keysCoreEverRead: [...new Set(box.keys)],
    };
  }

  // ===== R2. treeChanged.emit·event ========================================
  {
    const { router, ctx } = build();
    const routes = getRoutesApi(router);
    let seen: unknown;
    routes.subscribeChanges(((e: unknown) => {
      seen = e;
    }) as never);
    const { p: ev, box } = countingProxy({ op: "add", routes: [] });
    const before = box.n;
    (ctx.treeChanged as AnyRec as { emit: (e: unknown) => void }).emit(ev);
    const afterEmit = box.n;
    const gotSame = seen === (ev as unknown);
    routes.add([{ name: "z", path: "/z" }] as never);
    routes.update("z", { path: "/zz" } as never);
    routes.remove("z");
    await router.start("/home");
    await router.navigate("u", { id: "9" } as never);
    out.R2 = {
      control_shippedAddReachedListener: (seen as AnyRec).op !== undefined,
      listenerGotSameReference_foreignEvent: gotSame,
      readsBeforeEmit: before,
      readsAddedByEmit_byCore: afterEmit - before,
      readsAddedAfterEmit_laterFrames: box.n - afterEmit,
      keysCoreEverRead: [...new Set(box.keys)],
    };
  }

  // ===== R3. RoutesApi.get·return ==========================================
  {
    const { router } = build();
    const routes = getRoutesApi(router);
    const r = routes.get("plain") as unknown as AnyRec;
    const control = { name: r.name, path: r.path };
    const box = countReads(r);
    await router.start("/home");
    await router.navigate("plain", { id: "5" } as never, { q: "z" } as never);
    router.buildPath("plain", { id: "6" } as never);
    router.isActiveRoute("plain", { id: "5" } as never);
    routes.update("plain", { path: "/plain2/:id?q" } as never);
    routes.get("plain");
    routes.add([{ name: "w", path: "/w" }] as never);
    routes.remove("w");
    out.R3 = {
      control_shellFromGet: control,
      readsByCoreAfterHandout: box.n,
      keysRead: [...new Set(box.keys)],
      freshShellPerCall:
        (routes.get("plain") as unknown) !== (routes.get("plain") as unknown),
      shellFrozen: Object.isFrozen(r),
    };
  }

  // ===== R4. RoutesApi.subscribeChanges·event ==============================
  {
    const { router } = build();
    const routes = getRoutesApi(router);
    let ev: AnyRec | undefined;
    routes.subscribeChanges(((e: AnyRec) => {
      ev = e;
    }) as never);
    routes.add([
      { name: "q", path: "/q", defaultParams: { a: 1 } },
    ] as never);
    let writeVerdict = "no-throw";
    try {
      (ev as AnyRec).op = "HACKED";
    } catch (e) {
      writeVerdict = `throw:${(e as Error).constructor.name}`;
    }
    let defineVerdict = "no-throw";
    try {
      Object.defineProperty(ev as object, "op", { get: () => "HACKED" });
    } catch (e) {
      defineVerdict = `throw:${(e as Error).constructor.name}`;
    }
    const added = (ev as AnyRec).routes as AnyRec[] | undefined;
    out.R4 = {
      control_eventDelivered: ev !== undefined && (ev as AnyRec).op,
      eventFrozen: Object.isFrozen(ev),
      addedArrayFrozen: added ? Object.isFrozen(added) : null,
      addedRouteFrozen: added ? Object.isFrozen(added[0]) : null,
      topWrite: writeVerdict,
      topDefine: defineVerdict,
      interiorDefaultParamsFrozen: added
        ? Object.isFrozen((added[0] as AnyRec).defaultParams)
        : null,
    };
  }

  // ===== R5. port().resolveForward·return + buildStateResolved·return =======
  {
    const { router, ctx } = build();
    await router.start("/home");
    const port = (ctx.port as () => unknown)() as {
      resolveForward: (n: string, p: AnyRec, s: AnyRec) => AnyRec;
    };
    const p = { id: "7" };
    const s = { q: "x" };
    const shell = port.resolveForward("plain", p, s);
    const controlShell = { name: shell.name };
    const boxA = countReads(shell);
    const bsr = (ctx.buildStateResolved as (n: string, p: AnyRec) => AnyRec)(
      "u.c",
      { id: "1", cid: "2" },
    );
    const controlBsr = { name: bsr.name };
    const boxB = countReads(bsr);
    const nav = await router.navigate("plain", p as never, s as never);
    await router.navigate("u.c", { id: "1", cid: "2" } as never);
    router.buildPath("plain", { id: "8" } as never);
    out.R5 = {
      control_resolveForwardShell: controlShell,
      control_buildStateResolvedShell: controlBsr,
      readsOfResolveForwardShellAfterHandout: boxA.n,
      readsOfBuildStateResolvedShellAfterHandout: boxB.n,
      navigateStillCorrect: { name: nav.name, path: nav.path },
    };
  }

  // ===== R6. getCloneState·return (+ 4 поля) ===============================
  {
    const { router, ctx } = build();
    const cs = (ctx.getCloneState as () => AnyRec)();
    const control = Object.keys(cs);
    const boxTop = countReads(cs);
    const boxOpts = countReads(cs.options as object);
    const boxDeps = countReads(cs.dependencies as object);
    const boxLog = countReads(cs.loggerConfig as object);
    const clone = cloneRouter(router as never, { extra: 1 } as never);
    const cs2 = (ctx.getCloneState as () => AnyRec)();
    await router.start("/home");
    await router.navigate("plain", { id: "1" } as never);
    let limitsWrite = "no-throw";
    try {
      (cs.limits as AnyRec).maxRoutes = 1;
    } catch (e) {
      limitsWrite = `throw:${(e as Error).constructor.name}`;
    }
    out.R6 = {
      control_cloneStateKeys: control,
      control_cloneBuilt: typeof (clone as unknown as AnyRec).navigate,
      readsOfHandedOutContainer: boxTop.n,
      readsOfHandedOutOptions: boxOpts.n,
      readsOfHandedOutDependencies: boxDeps.n,
      readsOfHandedOutLoggerConfig: boxLog.n,
      freshContainerPerCall: cs !== cs2,
      freshOptionsPerCall: cs.options !== cs2.options,
      freshDepsPerCall: cs.dependencies !== cs2.dependencies,
      freshFactoriesPerCall: cs.pluginFactories !== cs2.pluginFactories,
      freshLoggerConfigPerCall: cs.loggerConfig !== cs2.loggerConfig,
      limitsSameObjectAcrossCalls: cs.limits === cs2.limits,
      limitsFrozen: Object.isFrozen(cs.limits),
      limitKeysSameObjectAcrossCalls: cs.limitKeys === cs2.limitKeys,
      limitKeysFrozen: Object.isFrozen(cs.limitKeys),
      limitsWriteVerdict: limitsWrite,
    };
  }

  // ===== R7. getNavigator·router ===========================================
  {
    const { router } = build();
    const n1 = getNavigator(router as never);
    const n2 = getNavigator(router as never);
    let readCount = 0;
    const slots = [
      "navigate",
      "getState",
      "isActiveRoute",
      "canNavigateTo",
      "subscribe",
      "subscribeLeave",
      "isLeaveApproved",
    ];
    const fakeTarget: AnyRec = {};
    for (const s of slots) fakeTarget[s] = () => s;
    const fake = new Proxy(fakeTarget, {
      get(t, k, r) {
        if (typeof k === "string") readCount++;
        return Reflect.get(t, k, r);
      },
    });
    const f1 = getNavigator(fake as never) as unknown as AnyRec;
    const readsAfterFirst = readCount;
    const f2 = getNavigator(fake as never) as unknown as AnyRec;
    const readsAfterSecond = readCount;
    fakeTarget.navigate = () => "MUTATED";
    const f3 = getNavigator(fake as never) as unknown as AnyRec;
    out.R7 = {
      control_sameRouterSameNavigator: n1 === n2,
      control_coreNavigatorWorks: typeof (n1 as unknown as AnyRec).getState,
      foreignAccepted: f1 !== undefined,
      readsOnFirstCall: readsAfterFirst,
      readsOnSecondCall_delta: readsAfterSecond - readsAfterFirst,
      cachedByIdentity: f1 === f2 && f2 === f3,
      navigatorFrozen: Object.isFrozen(f1),
      coreReadsMutationBack: (f3.navigate as () => string)() === "MUTATED",
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
