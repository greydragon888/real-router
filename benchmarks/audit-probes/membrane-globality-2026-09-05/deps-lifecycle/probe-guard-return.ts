// Линза L4-deps-lifecycle — ось lifecycle.
// Что измеряется:
//  (1) как ядро ФАКТИЧЕСКИ потребляет возврат GuardFn (`boolean | Promise<boolean>`
//      по типу) на async-пути (`navigate`) и на sync-пути (`canNavigateTo`):
//      truthy-объект, thenable не-Promise, Promise<объект>, Promise<false>,
//      подкласс Promise со счётчиком `then`;
//  (2) сколько раз вызывается фабрика guard'а при регистрации через
//      addActivateGuard, через конфиг маршрута (createRouter), через
//      routes.update и при cloneRouter; идентичность хэндаута
//      `getRoutesApi().get(n).canActivate`;
//  (3) `getDependency`, переданный фабрике, отдаёт лист по ссылке;
//  (4) чтения `opts` и `opts.logger` в cloneRouter и доказательство, что
//      override ДОШЁЛ до логгера клона (callback вызван), а копия — копия
//      (подмена callback в мешке после клонирования не видна клону).
// Контроли: `true`/`false`/`Promise<false>` — заведомо легальные входы тем же кодом.
import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

async function navigateOutcome(
  returnValue: () => unknown,
): Promise<Record<string, unknown>> {
  const router = createRouter(routes as never, {} as never);
  getLifecycleApi(router).addActivateGuard(
    "b",
    () => () => returnValue() as never,
  );
  await router.start("/a");
  try {
    const s = await router.navigate("b");
    return { ok: true, name: s.name };
  } catch (error) {
    return { ok: false, code: (error as { code?: string }).code };
  } finally {
    router.dispose();
  }
}

function syncOutcome(returnValue: () => unknown): boolean {
  const router = createRouter(routes as never, {} as never);
  getLifecycleApi(router).addActivateGuard(
    "b",
    () => () => returnValue() as never,
  );
  const verdict = router.canNavigateTo("b");
  router.dispose();
  return verdict;
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // (1) потребление возврата guard'а
  let thenCalls = 0;
  const thenable = {
    then(resolve: (v: boolean) => void) {
      thenCalls++;
      resolve(false);
    },
  };
  let subclassThenReads = 0;
  class CountedPromise<T> extends Promise<T> {
    override then<A = T, B = never>(
      onF?: ((v: T) => A | PromiseLike<A>) | null,
      onR?: ((e: unknown) => B | PromiseLike<B>) | null,
    ): Promise<A | B> {
      subclassThenReads++;
      return super.then(onF, onR);
    }
  }
  out.asyncPath = {
    "control true": await navigateOutcome(() => true),
    "control false": await navigateOutcome(() => false),
    "truthy object {}": await navigateOutcome(() => ({})),
    "thenable (not a Promise) resolving false": await navigateOutcome(
      () => thenable,
    ),
    thenableThenCalls: thenCalls,
    "Promise.resolve({})": await navigateOutcome(() => Promise.resolve({})),
    "Promise.resolve('') (falsy non-boolean)": await navigateOutcome(() =>
      Promise.resolve(""),
    ),
    "control Promise.resolve(false)": await navigateOutcome(() =>
      Promise.resolve(false),
    ),
    "Promise subclass resolving true": await navigateOutcome(
      () => new CountedPromise<boolean>((r) => r(true)),
    ),
    subclassThenCalls: subclassThenReads,
  };
  out.syncPath = {
    "control true": syncOutcome(() => true),
    "control false": syncOutcome(() => false),
    "truthy object {}": syncOutcome(() => ({})),
    "Promise.resolve(true)": syncOutcome(() => Promise.resolve(true)),
  };

  // (2)+(3) фабрики: число вызовов, идентичность хэндаута, getDependency-лист
  const svc = { name: "db" };
  let externalCalls = 0;
  const seenDeps: boolean[] = [];
  const seenRouters: string[] = [];
  const base = createRouter(
    routes as never,
    {} as never,
    { svc } as never,
  );
  let clone: ReturnType<typeof cloneRouter> | undefined;
  const externalFactory = (
    r: unknown,
    getDependency: (k: never) => unknown,
  ): (() => boolean) => {
    externalCalls++;
    seenDeps.push(getDependency("svc" as never) === svc);
    seenRouters.push(r === base ? "base" : r === clone ? "clone" : "other");
    return () => true;
  };
  getLifecycleApi(base).addActivateGuard("b", externalFactory as never);
  const externalAfterAdd = externalCalls;

  let configCalls = 0;
  const configFactory = (): (() => boolean) => {
    configCalls++;
    return () => true;
  };
  const withConfig = createRouter(
    [
      { name: "a", path: "/a" },
      { name: "b", path: "/b", canActivate: configFactory },
    ] as never,
    {} as never,
  );
  const configAfterCreate = configCalls;
  const handout = getRoutesApi(withConfig).get("b");
  let updateCalls = 0;
  const updateFactory = (): (() => boolean) => {
    updateCalls++;
    return () => true;
  };
  getRoutesApi(withConfig).update("b", { canActivate: updateFactory } as never);
  const updateAfterUpdate = updateCalls;
  const handoutAfterUpdate = getRoutesApi(withConfig).get("b");

  clone = cloneRouter(base);
  const externalAfterClone = externalCalls;
  const cloneOfConfig = cloneRouter(withConfig);
  out.factories = {
    externalFactoryCallsAfterAdd: externalAfterAdd,
    externalFactoryCallsAfterClone: externalAfterClone,
    getDependencyLeafIdentityPerCall: seenDeps,
    routerReceivedPerCall: seenRouters,
    configFactoryCallsAfterCreateRouter: configAfterCreate,
    handoutIsSameFunction: handout?.canActivate === configFactory,
    updateFactoryCallsAfterUpdate: updateAfterUpdate,
    handoutAfterUpdateIsUpdateFactory:
      handoutAfterUpdate?.canActivate === updateFactory,
    configFactoryCallsAfterCloneOfConfig: configCalls,
    updateFactoryCallsAfterCloneOfConfig: updateCalls,
    cloneHasExternalGuard:
      getRoutesApi(clone).get("b")?.canActivate === externalFactory,
  };
  clone.dispose();
  cloneOfConfig.dispose();
  withConfig.dispose();

  // (4) cloneRouter · opts / opts.logger
  const seen: string[] = [];
  const otherSeen: string[] = [];
  const loggerSource = {
    level: "all",
    callback: (level: string, ctx: string) => {
      seen.push(`${level}:${ctx}`);
    },
  };
  const loggerBag = countingBag(loggerSource);
  const optsBag = countingBag({ logger: loggerBag.bag });
  const clone2 = cloneRouter(base, undefined, optsBag.bag as never);
  const readsAfterClone = {
    opts: { ...optsBag.reads },
    optsLogger: { ...loggerBag.reads },
  };
  // подмена в мешке ПОСЛЕ клонирования — если бы ручка держалась, клон увидел бы её
  loggerSource.callback = (level: string, ctx: string) => {
    otherSeen.push(`${level}:${ctx}`);
  };
  getLifecycleApi(clone2).addActivateGuard("a", () => () => {
    throw new Error("boom");
  });
  const verdict = clone2.canNavigateTo("a");
  out.cloneOpts = {
    reads: readsAfterClone,
    readsAfterWarn: { opts: optsBag.reads, optsLogger: loggerBag.reads },
    throwingGuardVerdict: verdict,
    originalCallbackSaw: seen,
    swappedCallbackSaw: otherSeen,
  };
  clone2.dispose();
  base.dispose();

  // (5) параметр-хэндаут GuardFn `toState`: заморожен ли шелл в момент guard'а
  //     на обоих входах (navigate / navigateToState), и доходит ли запись из
  //     guard'а до зафиксированного состояния (round-trip).
  const observed: Record<string, unknown> = {};
  const r5 = createRouter(routes as never, {} as never);
  getLifecycleApi(r5).addActivateGuard("b", () => (toState) => {
    let writeThrew = false;
    try {
      (toState as unknown as Record<string, unknown>).extra = 1;
    } catch {
      writeThrew = true;
    }
    observed.shellFrozenInGuard = Object.isFrozen(toState);
    observed.paramsFrozenInGuard = Object.isFrozen(toState.params);
    observed.writeThrew = writeThrew;
    return true;
  });
  await r5.start("/a");
  const committed = await r5.navigate("b");
  observed.committedCarriesExtra = Object.hasOwn(committed, "extra");
  observed.committedIsFrozen = Object.isFrozen(committed);
  out.guardParamToState_navigate = observed;

  const observed2: Record<string, unknown> = {};
  const r6 = createRouter(routes as never, {} as never);
  const api6 = getPluginApi(r6);
  let guardSawThePassedObject: boolean | undefined;
  const passed = api6.makeState("b", {}, {});
  getLifecycleApi(r6).addActivateGuard("b", () => (toState) => {
    guardSawThePassedObject = toState === passed;
    observed2.shellFrozenInGuard = Object.isFrozen(toState);
    return true;
  });
  await r6.start("/a");
  const committed6 = await api6.navigateToState(passed);
  observed2.guardSawThePassedObject = guardSawThePassedObject;
  observed2.passedIsFrozen = Object.isFrozen(passed);
  observed2.committedIsPassed = committed6 === passed;
  out.guardParamToState_navigateToState = observed2;
  r5.dispose();
  r6.dispose();

  console.log(JSON.stringify(out, null, 1));
}

void main();
