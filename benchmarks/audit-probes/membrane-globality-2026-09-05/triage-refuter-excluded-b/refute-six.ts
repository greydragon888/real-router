// ОПРОВЕРГАТЕЛЬ ТРИАЖА (партия B): 6 строк, исключённых как handout / not-a-door.
// Приём: (1) вход подаётся ЧУЖИМ (построенным приложением) объектом со счётными
// геттерами; (2) после отдачи/emit гоняются ядровые пути, которые могли бы
// прочитать объект ОБРАТНО — ненулевая дельта = round-trip = дверь.
import { createRouter, getNavigator } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};

/** Счётчики чтений на СОБСТВЕННЫЕ ключи объекта (define, не Proxy). */
function countReads<T extends object>(obj: T): { n: number; keys: string[] } {
  const box = { n: 0, keys: [] as string[] };

  for (const k of Object.keys(obj)) {
    const v = (obj as AnyRec)[k];

    Object.defineProperty(obj, k, {
      configurable: true,
      enumerable: true,
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

async function main(): Promise<void> {
  // ── A. getNavigator·router: чужой объект вместо роутера ────────────────────
  {
    const real = createRouter([{ name: "home", path: "/home" }] as never);

    await real.start("/home");
    const navReal = getNavigator(real); // позитивный контроль

    const fnNavigate = (): void => {};
    const alien = {
      navigate: fnNavigate,
      getState: () => ({ name: "alien", params: {}, path: "/alien" }),
      isActiveRoute: () => true,
      canNavigateTo: () => true,
      subscribe: () => () => {},
      subscribeLeave: () => () => {},
      isLeaveApproved: () => true,
    };
    const c = countReads(alien);
    const nav1 = getNavigator(alien as never);
    const readsAfterFirst = c.n;
    const nav2 = getNavigator(alien as never);
    const readsAfterSecond = c.n;

    // после отдачи меняем слот у СВОЕГО объекта — видит ли ядро?
    (alien as AnyRec).navigate = (): void => {
      throw new Error("swapped");
    };
    const nav3 = getNavigator(alien as never);

    out.A_getNavigator = {
      positiveControl_realRouterState: navReal.getState()?.name,
      alienAccepted: typeof nav1.getState === "function",
      alienStateName: (nav1.getState() as { name?: string } | undefined)?.name,
      readsAfterFirst,
      readsAfterSecond,
      secondCallReadNothingMore: readsAfterFirst === readsAfterSecond,
      heldByIdentity_sameNavigator: nav1 === nav2 && nav2 === nav3,
      navigatorFrozen: Object.isFrozen(nav1),
      leafIsCallerFn: nav1.navigate === (fnNavigate as never),
      slotSwapAfterHandoffSeenByCore: nav3.navigate !== (fnNavigate as never),
    };
  }

  // ── B/C. emitTransitionError · error (PluginApi и RouterInternals) ─────────
  {
    const router = createRouter([{ name: "home", path: "/home" }] as never);
    const api = getPluginApi(router);
    const internals = getInternals(router);

    await router.start("/home");

    const err = Object.assign(new Error("boom"), { extraField: 1 });
    const seen: unknown[] = [];

    api.addEventListener("$$error" as never, ((
      _t: unknown,
      _f: unknown,
      e: unknown,
    ) => {
      seen.push(e);
    }) as never);

    const c = countReads(err as unknown as AnyRec);
    const before = c.n;

    api.emitTransitionError(err);
    const afterPluginEmit = c.n;

    internals.emitTransitionError(err);
    const afterInternalsEmit = c.n;
    const seenAtEmits = [...seen];

    // все пути ядра, которые могли бы прочитать объект обратно
    await router.navigate("home", { q: "1" }).catch(() => undefined);
    router.getState();
    await router.navigate("nope").catch(() => undefined);
    const afterCoreWork = c.n;
    const n0 = c.n;

    void (err as unknown as AnyRec).extraField;

    out.BC_emitTransitionError = {
      listenersGotSameRefAtEmits:
        seenAtEmits.length === 2 && seenAtEmits.every((s) => s === err),
      seenAtEmitsCount: seenAtEmits.length,
      readsBeforeEmit: before,
      afterPluginEmit,
      afterInternalsEmit,
      readsByCoreAfterHandoff: afterCoreWork - afterInternalsEmit,
      positiveControl_countersWork: c.n === n0 + 1,
      seenCount: seen.length,
    };
  }

  // ── D. RouterInternals.treeChanged.emit · event ────────────────────────────
  {
    const router = createRouter([{ name: "home", path: "/home" }] as never);
    const internals = getInternals(router);
    const routes = getRoutesApi(router);
    const seen: unknown[] = [];

    routes.subscribeChanges((e) => {
      seen.push(e);
    });

    const fake = { op: "add", added: [{ name: "x", path: "/x" }] };
    const c = countReads(fake as unknown as AnyRec);
    const before = c.n;

    internals.treeChanged.emit(fake as never);
    const afterEmit = c.n;

    routes.add([{ name: "later", path: "/later" }] as never);
    await router.start("/home");
    await router.navigate("later").catch(() => undefined);
    const afterCoreWork = c.n;

    out.D_treeChangedEmit = {
      handlerGotSameRef: seen[0] === fake,
      handlerCount: seen.length,
      readsBeforeEmit: before,
      readsDuringEmit: afterEmit - before,
      readsByCoreAfterHandoff: afterCoreWork - afterEmit,
      realEventIsCoreOwned:
        seen.length > 1 && Object.isFrozen((seen[1] as AnyRec).added),
    };
  }

  // ── E. RoutesApi.get · return ──────────────────────────────────────────────
  {
    const callerDefaults = { locale: "en" };
    const router = createRouter([
      { name: "shop", path: "/shop?locale", defaultSearch: callerDefaults },
    ] as never);
    const routes = getRoutesApi(router);

    await router.start("/shop");

    const r1 = routes.get("shop") as unknown as AnyRec;
    const pathBefore = router.buildPath("shop", {});

    let shellWriteThrew = false;

    try {
      r1.path = "/hacked";
      r1.injected = 1;
    } catch {
      shellWriteThrew = true;
    }

    const r2 = routes.get("shop") as unknown as AnyRec;
    const pathAfterShellWrite = router.buildPath("shop", {});

    (r1.defaultSearch as AnyRec).locale = "de";
    const pathAfterInteriorWrite = router.buildPath("shop", {});

    out.E_routesGetReturn = {
      freshShellPerCall: r1 !== r2,
      shellFrozen: Object.isFrozen(r1),
      shellWriteThrew,
      shellWriteVisibleNextCall: r2.path !== "/shop?locale" || "injected" in r2,
      pathBefore,
      pathAfterShellWrite,
      shellRoundTrip: pathBefore !== pathAfterShellWrite,
      interiorIsCallerBag: r1.defaultSearch === callerDefaults,
      pathAfterInteriorWrite,
      interiorRoundTrip: pathAfterInteriorWrite !== pathBefore,
    };
  }

  // ── F. RoutesApi.subscribeChanges · event ──────────────────────────────────
  {
    const router = createRouter([{ name: "home", path: "/home" }] as never);
    const routes = getRoutesApi(router);
    const evts: AnyRec[] = [];

    routes.subscribeChanges((e) => {
      evts.push(e as unknown as AnyRec);
    });

    const callerBag = { locale: "en" };

    routes.add([
      { name: "shop", path: "/shop?locale", defaultSearch: callerBag },
    ] as never);

    await router.start("/home");
    const ev = evts[0];
    const added = (ev.added as AnyRec[])[0];
    const pathBefore = router.buildPath("shop", {});

    let shellWriteThrew = false;

    try {
      added.path = "/hacked";
    } catch {
      shellWriteThrew = true;
    }

    let envelopeWriteThrew = false;

    try {
      ev.op = "remove";
    } catch {
      envelopeWriteThrew = true;
    }

    const pathAfterShellWrite = router.buildPath("shop", {});

    (added.defaultSearch as AnyRec).locale = "de";
    const pathAfterInteriorWrite = router.buildPath("shop", {});

    out.F_subscribeChangesEvent = {
      shellFrozen: Object.isFrozen(added),
      arrayFrozen: Object.isFrozen(ev.added),
      shellWriteThrew,
      envelopeWriteThrew,
      pathBefore,
      pathAfterShellWrite,
      shellRoundTrip: pathBefore !== pathAfterShellWrite,
      interiorIsCallerBag: added.defaultSearch === callerBag,
      pathAfterInteriorWrite,
      interiorRoundTrip: pathAfterInteriorWrite !== pathBefore,
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
