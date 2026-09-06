// Семейство «хэндаут закоммиченного State → прямая запись в .context».
// Для КАЖДОЙ поверхности, куда State доходит до кода приложения (по матрице
// pending-target-authority.test.ts + возвраты navigate/start/navigateToNotFound/
// navigateToState/systemCommit + revalidation после replace()), записываем:
//   • identity: тот ли это объект, что router.getState() ПОСЛЕ коммита
//     (pending-объект замораживается на месте в completeTransition, поэтому
//     pre-commit хэндаут === закоммиченный State);
//   • reach: прямая запись `handout.context[k] = appObject` видна через
//     router.getState().context[k] по идентичности (=== appObject);
//   • previous: после следующего коммита — через getPreviousState().context.
// Позитивный контроль: claim.write(getState(), v) — известная дверь, тот же
// путь чтения. Негативные контроли: makeState/matchPath/buildNavigationState
// (свежий State, не коммитится), canNavigateTo·toState, onTransitionCancel·toState,
// onTransitionError·toState — записи туда НЕ доходят до состояния ядра.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Ctx = Record<string, unknown>;
type St = {
  name: string;
  path: string;
  params: Ctx;
  search: Ctx;
  transition?: { segments?: unknown };
  context: Ctx;
};

const seen = new Map<string, St[]>();
const rec = (label: string, s: unknown): void => {
  if (s === undefined || s === null) {
    return;
  }
  const arr = seen.get(label) ?? [];
  arr.push(s as St);
  seen.set(label, arr);
};
const last = (label: string): St | undefined => {
  const arr = seen.get(label);
  return arr?.[arr.length - 1];
};
const tryWrite = (fn: () => void): string => {
  try {
    fn();
    return "no-throw";
  } catch (e) {
    return `throw:${(e as Error).constructor.name}`;
  }
};

const MARK = {
  leaveNext: { app: "leaveNext" },
  startInterceptor: { app: "startInterceptor" },
  hookStart: { app: "hookStart" },
  guardTo: { app: "guardTo" },
  getState: { app: "getState" },
  navRet: { app: "navRet" },
  prev: { app: "prev" },
  neg: { app: "neg" },
};

let releaseSlow: () => void = () => undefined;
const parked = new Promise<void>((r) => {
  releaseSlow = r;
});

const routes = [
  { name: "h", path: "/h" },
  {
    name: "a",
    path: "/a/:id?tab",
    canDeactivate: () => (to: St, from: St | undefined) => {
      rec("GuardFn(canDeactivate)·toState", to);
      rec("GuardFn(canDeactivate)·fromState", from);
      return true;
    },
  },
  {
    name: "g",
    path: "/g",
    canActivate: () => (to: St, from: St | undefined) => {
      rec("GuardFn(canActivate)·toState", to);
      rec("GuardFn(canActivate)·fromState", from);
      return true;
    },
  },
  {
    name: "p",
    path: "/p",
    canActivate: () => (to: St) => {
      rec("Router.canNavigateTo·GuardFn·toState", to);
      return true;
    },
  },
  {
    name: "slow",
    path: "/slow",
    canActivate: () => async () => {
      await parked;
      return true;
    },
  },
  {
    name: "refused",
    path: "/refused",
    canActivate: () => (to: St) => {
      rec("GuardFn(rejecting)·toState", to);
      return false;
    },
  },
];

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const router = createRouter(routes as never, {} as never);
  const api = getPluginApi(router);
  const internals = getInternals(router);

  router.usePlugin(() => ({
    onTransitionStart: (to: unknown, from: unknown) => {
      rec("Plugin.onTransitionStart·toState", to);
      rec("Plugin.onTransitionStart·fromState", from);
      (to as St).context.__viaOnTransitionStart__ = MARK.hookStart;
    },
    onTransitionLeaveApprove: (to: unknown, from: unknown) => {
      rec("Plugin.onTransitionLeaveApprove·toState", to);
      rec("Plugin.onTransitionLeaveApprove·fromState", from);
    },
    onTransitionCancel: (to: unknown, from: unknown) => {
      rec("Plugin.onTransitionCancel·toState", to);
      rec("Plugin.onTransitionCancel·fromState", from);
    },
    onTransitionError: (to: unknown, from: unknown) => {
      rec("Plugin.onTransitionError·toState", to);
      rec("Plugin.onTransitionError·fromState", from);
    },
    onTransitionSuccess: (to: unknown, from: unknown) => {
      rec("Plugin.onTransitionSuccess·toState", to);
      rec("Plugin.onTransitionSuccess·fromState", from);
    },
  }));
  api.addEventListener("$$start", ((to: unknown, from: unknown) => {
    rec("PluginApi.addEventListener($$start)·toState", to);
    rec("PluginApi.addEventListener($$start)·fromState", from);
  }) as never);
  api.addEventListener("$$leaveApprove", ((to: unknown, from: unknown) => {
    rec("PluginApi.addEventListener($$leaveApprove)·toState", to);
    rec("PluginApi.addEventListener($$leaveApprove)·fromState", from);
  }) as never);
  api.addEventListener("$$cancel", ((to: unknown, from: unknown) => {
    rec("PluginApi.addEventListener($$cancel)·toState", to);
    rec("PluginApi.addEventListener($$cancel)·fromState", from);
  }) as never);
  api.addEventListener("$$error", ((to: unknown, from: unknown) => {
    rec("PluginApi.addEventListener($$error)·toState", to);
    rec("PluginApi.addEventListener($$error)·fromState", from);
  }) as never);
  api.addEventListener("$$success", ((to: unknown, from: unknown) => {
    rec("PluginApi.addEventListener($$success)·toState", to);
    rec("PluginApi.addEventListener($$success)·fromState", from);
  }) as never);
  router.subscribeLeave((p: { route: unknown; nextRoute: unknown }) => {
    rec("Router.subscribeLeave·LeaveFn·leaveState.route", p.route);
    rec("Router.subscribeLeave·LeaveFn·leaveState.nextRoute", p.nextRoute);
    // pre-commit запись в pending-объект: доходит ли до закоммиченного?
    (p.nextRoute as St).context.__viaLeaveNextRoute__ = MARK.leaveNext;
  });
  router.subscribe((p: { route: unknown; previousRoute?: unknown }) => {
    rec("Router.subscribe·SubscribeFn·state.route", p.route);
    rec("Router.subscribe·SubscribeFn·state.previousRoute", p.previousRoute);
  });
  api.addInterceptor("start", (async (
    next: (p?: string) => Promise<unknown>,
    path?: string,
  ) => {
    const s = await next(path);
    rec("InterceptorFn<start>·next·return", s);
    (s as St).context.__viaStartInterceptor__ = MARK.startInterceptor;
    return s;
  }) as never);

  // ── Фаза A: start ────────────────────────────────────────────────────────
  const startRet = (await router.start("/h")) as unknown as St;
  const S1 = router.getState() as unknown as St;
  out.A_start = {
    "Router.start·return === getState()": startRet === S1,
    "InterceptorFn<start>·next·return === getState()":
      last("InterceptorFn<start>·next·return") === S1,
    "$$start·toState === getState()":
      last("PluginApi.addEventListener($$start)·toState") === S1,
    "Plugin.onTransitionStart·toState === getState()":
      last("Plugin.onTransitionStart·toState") === S1,
    "Plugin.onTransitionSuccess·toState === getState()":
      last("Plugin.onTransitionSuccess·toState") === S1,
    "$$success·toState === getState()":
      last("PluginApi.addEventListener($$success)·toState") === S1,
    "Router.subscribe·route === getState()":
      last("Router.subscribe·SubscribeFn·state.route") === S1,
    "startInterceptor write reaches committed by identity":
      S1.context.__viaStartInterceptor__ === MARK.startInterceptor,
    "onTransitionStart (pre-commit) write reaches committed by identity":
      S1.context.__viaOnTransitionStart__ === MARK.hookStart,
    frozen: {
      shell: Object.isFrozen(S1),
      params: Object.isFrozen(S1.params),
      search: Object.isFrozen(S1.search),
      transition: Object.isFrozen(S1.transition),
      "transition.segments": Object.isFrozen(S1.transition?.segments),
      context: Object.isFrozen(S1.context),
    },
    contextProto:
      Object.getPrototypeOf(S1.context) === Object.prototype
        ? "Object.prototype"
        : "other",
    shellWriteInStrictModule: tryWrite(() => {
      (S1 as unknown as Ctx).__shell__ = 1;
    }),
    paramsWrite: tryWrite(() => {
      S1.params.__p__ = 1;
    }),
  };

  // ── Позитивный контроль: claim.write (известная дверь), тот же путь чтения ─
  const claim = api.claimContextNamespace("probeNs");
  const claimValue = { nested: { deep: 1 } };
  claim.write(router.getState() as never, claimValue);
  out.control_claimWrite = {
    "getState().context.probeNs === value":
      (router.getState() as unknown as St).context.probeNs === claimValue,
    "leaf frozen by core?": Object.isFrozen(claimValue),
    "nested frozen by core?": Object.isFrozen(claimValue.nested),
    "own enumerable key":
      Object.getOwnPropertyDescriptor(S1.context, "probeNs")?.enumerable ===
      true,
  };

  // ── Дверь пробела: прямая запись через getState() ─────────────────────────
  const direct = tryWrite(() => {
    (router.getState() as unknown as St).context.__direct__ = MARK.getState;
  });
  out.gap_RouterGetState = {
    directWrite: direct,
    reachesCommittedByIdentity:
      (router.getState() as unknown as St).context.__direct__ ===
      MARK.getState,
    "getState() === getState() (stable handle)":
      router.getState() === router.getState(),
  };

  // ── Фаза B: navigate h → a ────────────────────────────────────────────────
  const navRet = (await router.navigate(
    "a",
    { id: "1" } as never,
    { tab: "t" } as never,
  )) as unknown as St;
  const S2 = router.getState() as unknown as St;
  out.B_navigate = {
    "Router.navigate·return === getState()": navRet === S2,
    "Plugin.onTransitionStart·toState === getState()":
      last("Plugin.onTransitionStart·toState") === S2,
    "Plugin.onTransitionStart·fromState === getPreviousState()":
      last("Plugin.onTransitionStart·fromState") === router.getPreviousState(),
    "Plugin.onTransitionLeaveApprove·toState === getState()":
      last("Plugin.onTransitionLeaveApprove·toState") === S2,
    "Plugin.onTransitionLeaveApprove·fromState === getPreviousState()":
      last("Plugin.onTransitionLeaveApprove·fromState") ===
      router.getPreviousState(),
    "$$leaveApprove·toState === getState()":
      last("PluginApi.addEventListener($$leaveApprove)·toState") === S2,
    "subscribeLeave·nextRoute === getState()":
      last("Router.subscribeLeave·LeaveFn·leaveState.nextRoute") === S2,
    "subscribeLeave·route === getPreviousState()":
      last("Router.subscribeLeave·LeaveFn·leaveState.route") ===
      router.getPreviousState(),
    "subscribeLeave·nextRoute (pre-commit) write reaches committed":
      S2.context.__viaLeaveNextRoute__ === MARK.leaveNext,
    "onTransitionStart (pre-commit) write reaches committed":
      S2.context.__viaOnTransitionStart__ === MARK.hookStart,
    "Plugin.onTransitionSuccess·fromState === getPreviousState()":
      last("Plugin.onTransitionSuccess·fromState") ===
      router.getPreviousState(),
    "Router.subscribe·previousRoute === getPreviousState()":
      last("Router.subscribe·SubscribeFn·state.previousRoute") ===
      router.getPreviousState(),
    "getPreviousState() === S1": router.getPreviousState() === (S1 as unknown),
    "previousState.context still carries the direct write":
      (router.getPreviousState() as unknown as St).context.__direct__ ===
      MARK.getState,
    "previousState.context still writable": tryWrite(() => {
      (router.getPreviousState() as unknown as St).context.__prev__ =
        MARK.prev;
    }),
    "write via getPreviousState() reaches ctx.previous":
      (router.getPreviousState() as unknown as St).context.__prev__ ===
      MARK.prev,
    "S2.context is a fresh object (not S1.context)": S2.context !== S1.context,
  };

  // ── Фаза C: navigate a → g (canDeactivate(a) + canActivate(g)) ────────────
  await router.navigate("g");
  const S3 = router.getState() as unknown as St;
  const gTo = last("GuardFn(canActivate)·toState");
  out.C_guards = {
    "GuardFn(canDeactivate)·toState === getState()":
      last("GuardFn(canDeactivate)·toState") === S3,
    "GuardFn(canDeactivate)·fromState === getPreviousState()":
      last("GuardFn(canDeactivate)·fromState") === router.getPreviousState(),
    "GuardFn(canActivate)·toState === getState()": gTo === S3,
    "GuardFn(canActivate)·fromState === getPreviousState()":
      last("GuardFn(canActivate)·fromState") === router.getPreviousState(),
  };
  // pre-commit write through a guard
  const routesApi = getRoutesApi(router);
  routesApi.add({
    name: "w",
    path: "/w",
    canActivate: () => (to: St) => {
      to.context.__viaGuard__ = MARK.guardTo;
      return true;
    },
  } as never);
  await router.navigate("w");
  out.C_guards_write = {
    "GuardFn·toState (pre-commit) write reaches committed":
      (router.getState() as unknown as St).context.__viaGuard__ ===
      MARK.guardTo,
  };

  // ── Фаза D: canNavigateTo — pending, никогда не коммитится ────────────────
  router.canNavigateTo("p");
  const cnTo = last("Router.canNavigateTo·GuardFn·toState");
  if (cnTo) {
    cnTo.context.__viaCanNavigateTo__ = MARK.neg;
  }
  out.D_canNavigateTo = {
    "toState captured": cnTo !== undefined,
    "toState === getState()": cnTo === router.getState(),
    "write reaches committed":
      (router.getState() as unknown as St).context.__viaCanNavigateTo__ ===
      MARK.neg,
  };

  // ── Фаза E: cancel (supersede) ────────────────────────────────────────────
  const superseded = router.navigate("slow").catch(() => undefined);
  await router.navigate("h").catch(() => undefined);
  releaseSlow();
  await superseded;
  const cancelTo = last("Plugin.onTransitionCancel·toState");
  if (cancelTo) {
    cancelTo.context.__viaCancel__ = MARK.neg;
  }
  out.E_cancel = {
    "onTransitionCancel·toState captured": cancelTo !== undefined,
    "onTransitionCancel·toState === getState()": cancelTo === router.getState(),
    "onTransitionCancel·toState.name": cancelTo?.name,
    "onTransitionCancel·fromState === getPreviousState()":
      last("Plugin.onTransitionCancel·fromState") === router.getPreviousState(),
    "$$cancel·fromState === getPreviousState()":
      last("PluginApi.addEventListener($$cancel)·fromState") ===
      router.getPreviousState(),
    "write into cancelled toState reaches committed":
      (router.getState() as unknown as St).context.__viaCancel__ === MARK.neg,
    "committed after supersede": router.getState()?.name,
  };

  // ── Фаза F: error (rejecting guard) + SAME_STATES error ───────────────────
  await router.navigate("refused").catch(() => undefined);
  const errTo = last("Plugin.onTransitionError·toState");
  if (errTo) {
    errTo.context.__viaError__ = MARK.neg;
  }
  const before = router.getState();
  await router.navigate("h").catch(() => undefined); // SAME_STATES
  out.F_error = {
    "onTransitionError·toState captured": errTo !== undefined,
    "onTransitionError·toState === getState()": errTo === router.getState(),
    "onTransitionError·fromState === getState() (no commit happened)":
      last("Plugin.onTransitionError·fromState") === before,
    "write into failed toState reaches committed":
      (router.getState() as unknown as St).context.__viaError__ === MARK.neg,
    "$$error·fromState === getState()":
      last("PluginApi.addEventListener($$error)·fromState") ===
      router.getState(),
    "same-states: state unchanged": router.getState() === before,
  };

  // ── Фаза G: navigateToNotFound ────────────────────────────────────────────
  const nf = router.navigateToNotFound("/zzz") as unknown as St;
  out.G_navigateToNotFound = {
    "Router.navigateToNotFound·return === getState()": nf === router.getState(),
    "Plugin.onTransitionSuccess·toState === return":
      last("Plugin.onTransitionSuccess·toState") === nf,
    "getPreviousState() === before": router.getPreviousState() === before,
    "context writable": tryWrite(() => {
      nf.context.__nf__ = MARK.navRet;
    }),
    "write reaches committed":
      (router.getState() as unknown as St).context.__nf__ === MARK.navRet,
  };

  // ── Фаза H: PluginApi.navigateToState (копия контейнера, лист по ссылке) ──
  const passed = api.matchPath("/a/2") as unknown as St;
  const leaf = { app: "leaf" };
  passed.context.__leaf__ = leaf;
  const nsRet = (await api.navigateToState(passed as never)) as unknown as St;
  out.H_navigateToState = {
    "PluginApi.navigateToState·return === getState()":
      nsRet === router.getState(),
    "passed state !== committed": passed !== nsRet,
    "passed.context !== committed.context (container copied)":
      passed.context !== nsRet.context,
    "leaf by reference": nsRet.context.__leaf__ === leaf,
    "later write into passed.context reaches committed?": (() => {
      passed.context.__late__ = MARK.neg;
      return nsRet.context.__late__ === MARK.neg;
    })(),
    "control: matchPath return not committed": passed !== router.getState(),
    "control: matchPath().context write lands in committed?": (() => {
      const fresh = api.matchPath("/h") as unknown as St;
      fresh.context.__fresh__ = MARK.neg;
      return (
        (router.getState() as unknown as St).context.__fresh__ === MARK.neg
      );
    })(),
    "control: makeState().context write lands in committed?": (() => {
      const fresh = api.makeState("h") as unknown as St;
      fresh.context.__fresh2__ = MARK.neg;
      return (
        (router.getState() as unknown as St).context.__fresh2__ === MARK.neg
      );
    })(),
    "control: buildNavigationState().context write lands in committed?":
      (() => {
        const fresh = api.buildNavigationState("h") as unknown as St;
        fresh.context.__fresh3__ = MARK.neg;
        return (
          (router.getState() as unknown as St).context.__fresh3__ === MARK.neg
        );
      })(),
  };

  // ── Фаза I: RouterInternals.systemCommit (foreign State) ──────────────────
  const foreign: St = {
    name: "a",
    params: { id: "9" },
    search: {},
    path: "/a/9",
    context: { __leaf__: leaf },
  };
  const scRet = internals.systemCommit(
    foreign as never,
    router.getState() as never,
    {} as never,
  ) as unknown as St;
  out.I_systemCommit = {
    "RouterInternals.systemCommit·return === getState()":
      scRet === router.getState(),
    "foreign !== committed": foreign !== scRet,
    "foreign.context !== committed.context": foreign.context !== scRet.context,
    "leaf by reference": scRet.context.__leaf__ === leaf,
    "committed.context proto":
      Object.getPrototypeOf(scRet.context) === Object.prototype
        ? "Object.prototype"
        : "other",
    "committed.context frozen": Object.isFrozen(scRet.context),
  };

  // ── Фаза J: replace() revalidation — контейнер копируется, ручка стареет ──
  const beforeReplace = router.getState() as unknown as St;
  const oldCtx = beforeReplace.context;
  claim.write(beforeReplace as never, claimValue);
  routesApi.replace([...routes, { name: "w", path: "/w" }] as never);
  const afterReplace = router.getState() as unknown as St;
  oldCtx.__stale__ = MARK.prev;
  out.J_replaceRevalidation = {
    "getState() !== before": afterReplace !== beforeReplace,
    "getState().context !== before.context (spread copy)":
      afterReplace.context !== oldCtx,
    "own key carried by reference (claim value)":
      afterReplace.context.probeNs === claimValue,
    "leaf by reference": afterReplace.context.__leaf__ === leaf,
    "getPreviousState() === before":
      router.getPreviousState() === (beforeReplace as unknown),
    "stale handle write lands in getPreviousState().context":
      (router.getPreviousState() as unknown as St).context.__stale__ ===
      MARK.prev,
    "stale handle write does NOT reach getState().context":
      afterReplace.context.__stale__ === undefined,
  };

  // ── Фаза K: stop() — сдвиг пары, previous остаётся мутабельным ────────────
  const lastState = router.getState() as unknown as St;
  router.stop();
  out.K_stop = {
    "getState() after stop": router.getState(),
    "getPreviousState() === last committed":
      router.getPreviousState() === (lastState as unknown),
    "write via getPreviousState().context after stop": tryWrite(() => {
      (router.getPreviousState() as unknown as St).context.__afterStop__ =
        MARK.prev;
    }),
    "visible through getPreviousState()":
      (router.getPreviousState() as unknown as St).context.__afterStop__ ===
      MARK.prev,
  };

  // ── Фаза L: dispose() — обе ячейки пусты; ручка приложения ведёт в никуда ─
  router.dispose();
  lastState.context.__afterDispose__ = MARK.neg;
  out.L_dispose = {
    "getState()": router.getState(),
    "getPreviousState()": router.getPreviousState(),
    "old handle still writable (landsIn: nothing)":
      lastState.context.__afterDispose__ === MARK.neg,
  };

  // ── Знаменатель: все захваченные поверхности ──────────────────────────────
  out.surfacesCaptured = [...seen.keys()].sort();

  console.log(JSON.stringify(out, null, 2));
}

void main();
