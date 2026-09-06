// Триаж-батч: extendRouter·extensions, usePlugin·PluginFactory·return,
// claim.write·state|value, GuardFn·return, LeaveFn·return,
// InterceptorFn<"start">·return, emitTransitionError·error, treeChanged.emit·event.
// В каждой секции — позитивный контроль (инструмент сработал) и доказательство,
// что вход дошёл до проверяемой ветки.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};

// ---------------------------------------------------------------- A. extendRouter
{
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const reads: Record<string, number> = { foo: 0 };
  const leaf = { svc: 1 };
  const bag: Record<string, unknown> = {};
  Object.defineProperty(bag, "foo", {
    enumerable: true,
    configurable: true,
    get() {
      reads.foo++;
      return leaf;
    },
  });
  const api = getPluginApi(router);
  const off = api.extendRouter(bag);
  out.A_readsAtRegistration = reads.foo; // ожидаем 1 (#1933)
  out.A_leafByReference =
    (router as never as Record<string, unknown>).foo === leaf;
  // контейнер не удерживается: добавляем ключ в мешок ПОСЛЕ регистрации
  bag.bar = 42;
  out.A_containerNotHeld =
    (router as never as Record<string, unknown>).bar === undefined;
  off();
  out.A_afterUnsubscribe_readsUnchanged = reads.foo;
  out.A_control_bagStillReadableByApp = bag.foo === leaf; // позитивный контроль геттера
  out.A_control_readsAfterAppRead = reads.foo; // должен вырасти → инструмент жив
}

// ------------------------------------------------- B. usePlugin·PluginFactory·return
{
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const hookReads: Record<string, number> = { onStart: 0, teardown: 0 };
  const hook = (): void => {};
  const pluginObj: Record<string, unknown> = {};
  Object.defineProperty(pluginObj, "onStart", {
    enumerable: true,
    configurable: true,
    get() {
      hookReads.onStart++;
      return hook;
    },
  });
  Object.defineProperty(pluginObj, "teardown", {
    enumerable: true,
    configurable: true,
    get() {
      hookReads.teardown++;
      return () => {};
    },
  });
  const off = router.usePlugin(() => pluginObj as never);
  out.B_readsPerHookAtRegistration = hookReads.onStart; // 2 = «спросить, потом взять»
  out.B_teardownReadsAtRegistration = hookReads.teardown;
  out.B_callersObjectFrozenInPlace = Object.isFrozen(pluginObj);
  off();
  out.B_teardownReadsAfterUnsubscribe = hookReads.teardown; // ручка держалась в cleanup
  // унаследованный хук принимается через `in` (P2)
  const router2 = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  let inheritedCalls = 0;
  const proto = {
    onStart: () => {
      inheritedCalls++;
    },
  };
  const child = Object.create(proto) as Record<string, unknown>;
  router2.usePlugin(() => child as never);
  void router2.start("/u/1").then(() => {
    out.B_inheritedHookInvoked = inheritedCalls;
    finish();
  });
}

// -------------------------------------------------------- C..H — остальные секции
function finish(): void {
  // C. claim.write·state / ·value + round-trip чтения контейнера context
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const api = getPluginApi(router);
  const claim = api.claimContextNamespace("probe");
  const leafValue = { mutable: 1 };
  router.usePlugin(
    () =>
      ({
        onTransitionSuccess: (toState: never) => {
          claim.write(toState, leafValue);
        },
      }) as never,
  );
  void router.start("/u/1").then(() => {
    const committed = router.getState() as unknown as {
      context: Record<string, unknown>;
    };
    out.C_valueLeafByReference = committed.context.probe === leafValue;
    // приложение вправе изменить контейнер: он НЕ заморожен
    out.C_contextFrozen = Object.isFrozen(committed.context);
    committed.context.appWritten = "yes";
    out.C_appWriteVisible = committed.context.appWritten === "yes";
    // round-trip: читает ли ядро контейнер обратно на следующей навигации?
    void router.navigate("u", { id: "2" } as never).then(
      (s: unknown) => {
        const st = s as { context: Record<string, unknown> };
        out.C_nextNavContextCarriesAppWrite = st.context.appWritten === "yes";
        out.C_nextNavContextSameContainer = st.context === committed.context;
        sectionC2();
      },
      () => {
        sectionC2();
      },
    );
  });
}

function sectionC2(): void {
  // C2. ROUND-TRIP: читает ли ядро контейнер `state.context` ОБРАТНО после того,
  // как приложение (плагин через claim.write ИЛИ прямой записью) его изменило?
  // Сайт чтения: getRoutesApi · replace → survivor-арм (`context: currentState.context`)
  // → commitRevalidated → EventBusNamespace · systemCommit (`context: {…toState.context}`).
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const api = getPluginApi(router);
  const claim = api.claimContextNamespace("probe");
  const leafValue = { mutable: 1 };
  router.usePlugin(
    () =>
      ({
        onTransitionSuccess: (toState: never) => {
          claim.write(toState, leafValue);
        },
      }) as never,
  );
  void router.start("/u/1").then(() => {
    const before = router.getState() as unknown as {
      context: Record<string, unknown>;
    };
    // приложение меняет контейнер ПОСЛЕ коммита — ядро отдало его наружу
    before.context.writtenByApp = "mutation";
    out.C2_beforeReplace_hasAppKey = before.context.writtenByApp === "mutation";
    // replace той же формы → survivor-арм revalidation
    getRoutesApi(router).replace([{ name: "u", path: "/u/:id" }] as never);
    const after = router.getState() as unknown as {
      context: Record<string, unknown>;
    };
    out.C2_afterReplace_readBackAppMutation =
      after.context.writtenByApp === "mutation";
    out.C2_afterReplace_readBackClaimLeaf = after.context.probe === leafValue;
    out.C2_containerIdentityKept = after.context === before.context;
    // позитивный контроль: revalidation действительно произошла (state пересобран)
    out.C2_control_stateObjectRebuilt = (after as unknown) !== (before as unknown);
    sectionD();
  });
}

function sectionD(): void {
  // D. GuardFn·return — thenable не-Promise на пути navigate
  const router = createRouter(
    [
      { name: "u", path: "/u/:id" },
      {
        name: "g",
        path: "/g",
        canActivate: () => () =>
          ({
            then(res: (v: boolean) => void) {
              res(false);
            },
          }) as never,
      },
    ] as never,
    {} as never,
  );
  void router.start("/u/1").then(() => {
    void router.navigate("g").then(
      () => {
        out.D_thenableGuardTreatedAsTruthy_navigateSucceeded = true;
        sectionE();
      },
      (e: unknown) => {
        out.D_navigateRejected = (e as Error).message;
        sectionE();
      },
    );
  });
}

function sectionE(): void {
  // E. LeaveFn·return — duck `then`, ядро ждёт
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  let thenCalls = 0;
  void router.start("/u/1").then(() => {
    router.subscribeLeave(
      () =>
        ({
          then(res: () => void) {
            thenCalls++;
            res();
          },
        }) as never,
    );
    void router.navigate("u", { id: "2" } as never).then(
      () => {
        out.E_thenCalledOnCustomThenable = thenCalls; // 1 → duck-typing, ручка потреблена
        sectionF();
      },
      () => {
        out.E_navRejected = true;
        sectionF();
      },
    );
  });
}

function sectionF(): void {
  // F. InterceptorFn<"start">·return — чем резолвится, ядро не читает
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const api = getPluginApi(router);
  const sentinel = { iAmNotAState: true };
  // InterceptorFn<"start"> = (next, path) => Promise<State> — НЕ каррированная
  api.addInterceptor(
    "start",
    ((next: (p?: string) => Promise<unknown>, path?: string) =>
      next(path).then(() => sentinel)) as never,
  );
  void router.start("/u/1").then(
    (returned: unknown) => {
      out.F_startReturnedInterceptorObjectByIdentity = returned === sentinel;
      out.F_committedName = (
        router.getState() as unknown as { name: string }
      ).name;
      sectionG();
    },
    (e: unknown) => {
      out.F_rejected = (e as Error).message;
      sectionG();
    },
  );
}

function sectionG(): void {
  // G. emitTransitionError·error — транзит по идентичности, ядро не хранит
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const api = getPluginApi(router);
  const err = Object.assign(new Error("probe"), { tag: "mine" });
  let received: unknown;
  let calls = 0;
  api.addEventListener("$$error" as never, ((
    _to: unknown,
    _from: unknown,
    e: unknown,
  ) => {
    calls++;
    received = e;
  }) as never);
  void router.start("/u/1").then(() => {
    api.emitTransitionError(err as never);
    out.G_listenerCalls = calls; // позитивный контроль: вход дошёл до слушателя
    out.G_listenerGotSameReference = received === err;
    out.G_coreHoldsNoCopy_stateUnaffected = !Object.values(
      router.getState() as unknown as Record<string, unknown>,
    ).includes(err as never);
    sectionH();
  });
}

function sectionH(): void {
  // H. treeChanged.emit·event — транзит объекта вызывающего слушателям
  const router = createRouter(
    [{ name: "u", path: "/u/:id" }] as never,
    {} as never,
  );
  const internals = getInternals(router) as unknown as {
    treeChanged: { emit: (e: unknown) => void };
  };
  let seen: unknown;
  getRoutesApi(router).subscribeChanges(((e: unknown) => {
    seen = e;
  }) as never);
  const foreignEvent = { op: "add", routes: [] };
  internals.treeChanged.emit(foreignEvent);
  out.H_listenerGotSameReference_foreignEvent = seen === foreignEvent;
  // позитивный контроль: штатный путь (getRoutesApi.add) тоже доходит до слушателя
  getRoutesApi(router).add([{ name: "z", path: "/z" }] as never);
  const shipped = seen as { op?: string; routes?: unknown[] };
  out.H_control_shippedAddReachedListener = shipped.op === "add";
  out.H_control_shippedEventFrozen = Object.isFrozen(seen);
  console.log(JSON.stringify(out, null, 1));
}
