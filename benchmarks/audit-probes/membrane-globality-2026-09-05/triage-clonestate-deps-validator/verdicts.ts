// Триаж батча: getCloneState-снапшот (loggerConfig/limits/limitKeys),
// getAll·return, getOptions·return, dependenciesGetStore().limits и четыре
// колбэка RouterValidator по зависимостям + validateNoDuplicatePlugins.
//
// Вопрос по каждому: ядро ОТДАЁТ объект — читает ли оно его ОБРАТНО после
// того, как приложение (или код плагина) могло его изменить?
//
// Инструмент: фальшивый RouterValidator в getInternals(router).validator
// (Proxy → no-op на всё, кроме перехваченных методов). В каждом блоке печатается
// позитивный контроль инструмента: счётчик вызова перехваченного колбэка > 0 и
// легальный результат того же кода (иначе «ничего не сломалось» = проба не дошла).
import { createRouter } from "@real-router/core";
import { getDependenciesApi, cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const out: Record<string, unknown> = {};

const noop = (): void => {};
type Hooks = Record<string, Record<string, (...a: unknown[]) => unknown>>;
const makeValidator = (overrides: Hooks): unknown =>
  new Proxy(
    {},
    {
      get: (_t, group: string | symbol) =>
        new Proxy(
          {},
          {
            get: (_t2, m: string | symbol) =>
              (overrides[group as string] ?? {})[m as string] ?? noop,
          },
        ),
    },
  );

const ROUTES = [{ name: "h", path: "/h" }];
const mk = (
  opts: Record<string, unknown> = {},
  deps: Record<string, unknown> = {},
): unknown => createRouter(ROUTES as never, opts as never, deps as never);

// ---------------------------------------------------------------- A. loggerConfig
{
  const cb = (): void => {};
  const r = mk({ logger: { level: "warn-error", callback: cb } });
  const ctx = getInternals(r as never) as unknown as {
    getCloneState: () => Record<string, unknown>;
  };
  const lc1 = ctx.getCloneState().loggerConfig as Record<string, unknown>;
  const lc2 = ctx.getCloneState().loggerConfig as Record<string, unknown>;
  out["A.loggerConfig.freshPerCall"] = lc1 !== lc2;
  out["A.loggerConfig.frozen"] = Object.isFrozen(lc1);
  out["A.loggerConfig.callbackByReference"] = lc1.callback === cb;
  lc1["injected"] = 1;
  lc1["level"] = "none";
  const lc3 = ctx.getCloneState().loggerConfig as Record<string, unknown>;
  out["A.loggerConfig.appWriteReachesNextCall"] =
    "injected" in lc3 || lc3.level === "none";
  out["A.control.legalLevelRead"] = lc3.level;
}

// ------------------------------------------------------------- B. limits/limitKeys
{
  const callerLimits: Record<string, unknown> = { maxDependencies: 7 };
  const r = mk({ limits: callerLimits });
  const ctx = getInternals(r as never) as unknown as {
    getCloneState: () => Record<string, unknown>;
    dependenciesGetStore: () => Record<string, unknown>;
  };
  const cs = ctx.getCloneState();
  const lim = cs.limits as Record<string, unknown>;
  const keys = cs.limitKeys as string[];
  out["B.limits.frozen"] = Object.isFrozen(lim);
  out["B.limits.sameRefTwice"] = lim === (ctx.getCloneState().limits as unknown);
  out["B.limits.isCallerBag"] = (lim as unknown) === (callerLimits as unknown);
  out["B.limitKeys.frozen"] = Object.isFrozen(keys);
  out["B.limitKeys.sameRefTwice"] =
    (keys as unknown) === (ctx.getCloneState().limitKeys as unknown);
  out["B.control.limitsResolvedValue"] = lim.maxDependencies;
  out["B.control.limitKeysContent"] = [...keys];
  let threw = "";
  try {
    (lim as Record<string, unknown>)["maxDependencies"] = 999;
  } catch (e) {
    threw = (e as Error).constructor.name;
  }
  out["B.limits.appWriteRefused"] = threw || String(lim.maxDependencies);
  let threwKeys = "";
  try {
    (keys as unknown as unknown[]).push("smuggled");
  } catch (e) {
    threwKeys = (e as Error).constructor.name;
  }
  out["B.limitKeys.appPushRefused"] = threwKeys || keys.join(",");
  // Слот .limits на сторе зависимостей: заменяем и смотрим, читает ли ядро обратно
  const store = ctx.dependenciesGetStore();
  out["B.store.limitsSameObject"] =
    (store.limits as unknown) === (lim as unknown);
  store.limits = { maxDependencies: 1 };
  out["B.store.slotSwapAccepted"] =
    (ctx.dependenciesGetStore().limits as Record<string, unknown>)
      .maxDependencies === 1;
  out["B.store.coreStillSeesOwnLimits"] =
    (ctx.getCloneState().limits as Record<string, unknown>).maxDependencies ===
    7;
}

// -------------------------------------------------------------- C. getOptions·return
{
  const callerQP: Record<string, unknown> = { arrayFormat: "none" };
  const r = mk({ queryParams: callerQP });
  const ctx = getInternals(r as never) as unknown as {
    getOptions: () => Record<string, unknown>;
  };
  const o1 = ctx.getOptions();
  out["C.getOptions.sameRefTwice"] = o1 === ctx.getOptions();
  out["C.getOptions.frozen"] = Object.isFrozen(o1);
  out["C.getOptions.nestedIsCallerBag"] =
    (o1.queryParams as unknown) === callerQP;
  out["C.getOptions.nestedFrozen"] = Object.isFrozen(o1.queryParams);
  let threw = "";
  try {
    (o1 as Record<string, unknown>)["injected"] = 1;
  } catch (e) {
    threw = (e as Error).constructor.name;
  }
  out["C.getOptions.appWriteRefused"] =
    threw || ("injected" in o1 ? "LANDED" : "silent");
  out["C.control.legalFieldRead"] = o1.queryParamsMode;
}

// ------------------------------------------------------------- D. getAll·return
{
  const svc = { id: "svc" };
  const r = mk({}, { a: svc });
  const api = getDependenciesApi(r as never);
  const g1 = api.getAll() as Record<string, unknown>;
  out["D.getAll.freshPerCall"] = g1 !== (api.getAll() as unknown);
  out["D.getAll.leafByReference"] = g1.a === svc;
  out["D.getAll.frozen"] = Object.isFrozen(g1);
  g1["injected"] = 1;
  delete g1.a;
  out["D.getAll.appWriteReachesStore"] =
    "injected" in (api.getAll() as object) ||
    (api.get("a" as never) as unknown) !== svc;
  out["D.control.storeIntact"] = (api.get("a" as never) as unknown) === svc;
}

// -------------------- E. validateDependencyCount·store (ручка на живой стор)
{
  const r = mk({});
  const ctx = getInternals(r as never) as unknown as {
    validator: unknown;
    dependenciesGetStore: () => Record<string, unknown>;
  };
  let calls = 0;
  let sawLiveStore = false;
  ctx.validator = makeValidator({
    dependencies: {
      validateDependencyCount: (store: unknown) => {
        calls += 1;
        sawLiveStore =
          (store as object) === (ctx.dependenciesGetStore() as object);
        // код плагина подменяет слот ЖИВОГО стора ядра
        (store as Record<string, unknown>).dependencies = Object.create(
          null,
        ) as object;
        return undefined;
      },
    },
  });
  const api = getDependenciesApi(r as never);
  api.set("a" as never, 1 as never);
  out["E.control.validatorCalled"] = calls;
  out["E.storeHandedOutIsLive"] = sawLiveStore;
  out["E.writeDivertedBySlotSwap"] = api.has("a" as never) === false;
  out["E.coreReadsSwappedSlotBack"] =
    Object.keys(api.getAll() as object).length === 0;
}
{
  // Контроль E: тот же код БЕЗ подмены слота — запись доходит.
  const r = mk({});
  const ctx = getInternals(r as never) as unknown as { validator: unknown };
  let calls = 0;
  ctx.validator = makeValidator({
    dependencies: {
      validateDependencyCount: () => {
        calls += 1;
        return undefined;
      },
    },
  });
  const api = getDependenciesApi(r as never);
  api.set("a" as never, 1 as never);
  out["E.control.noSwap.validatorCalled"] = calls;
  out["E.control.noSwap.writeLanded"] = api.has("a" as never);
}

// ------------------- F. validateDependencyExists·store (та же ручка на get)
{
  const r = mk({}, { a: 1 });
  const ctx = getInternals(r as never) as unknown as { validator: unknown };
  let calls = 0;
  ctx.validator = makeValidator({
    dependencies: {
      validateDependencyExists: (_n: unknown, store: unknown) => {
        calls += 1;
        (store as Record<string, Record<string, unknown>>).dependencies["b"] = 2;
        return undefined;
      },
    },
  });
  const api = getDependenciesApi(r as never);
  const first = api.get("a" as never);
  out["F.control.validatorCalled"] = calls;
  out["F.control.valueReadBeforeValidator"] = first === 1;
  out["F.pluginWriteVisibleToCoreLater"] =
    (api.get("b" as never) as unknown) === 2;
}

// --------- G. validateDependenciesObject·deps / validateCloneArgs·dependencies
{
  const r = mk({});
  const ctx = getInternals(r as never) as unknown as { validator: unknown };
  const bag: Record<string, unknown> = { x: 1 };
  let calls = 0;
  let identity = false;
  ctx.validator = makeValidator({
    dependencies: {
      validateDependenciesObject: (deps: unknown) => {
        calls += 1;
        identity = (deps as object) === bag;
        // код плагина дописывает ключ в мешок ВЫЗЫВАЮЩЕГО между своим проходом
        // и единственным судящим проходом ingestDependencies
        (deps as Record<string, unknown>)["smuggled"] = 42;
        return undefined;
      },
    },
  });
  const api = getDependenciesApi(r as never);
  api.setAll(bag as never);
  out["G.control.validatorCalled"] = calls;
  out["G.deps.isCallerOriginal"] = identity;
  out["G.coreReadsBagAfterValidator"] =
    (api.get("smuggled" as never) as unknown) === 42;
  out["G.control.legalKeyIngested"] = (api.get("x" as never) as unknown) === 1;
}
{
  const base = mk({});
  const ctx = getInternals(base as never) as unknown as { validator: unknown };
  const bag: Record<string, unknown> = { y: 1 };
  let calls = 0;
  let identity = false;
  ctx.validator = makeValidator({
    dependencies: {
      validateCloneArgs: (deps: unknown) => {
        calls += 1;
        identity = (deps as object) === bag;
        (deps as Record<string, unknown>)["smuggled"] = 7;
        return undefined;
      },
    },
  });
  const clone = cloneRouter(base as never, bag as never);
  const capi = getDependenciesApi(clone as never);
  out["G2.control.validatorCalled"] = calls;
  out["G2.deps.isCallerOriginal"] = identity;
  out["G2.coreReadsBagAfterValidator"] =
    (capi.get("smuggled" as never) as unknown) === 7;
  out["G2.control.legalKeyIngested"] = (capi.get("y" as never) as unknown) === 1;
}

// ------------------------------- H. validateNoDuplicatePlugins·factories
{
  const r = mk({});
  const ctx = getInternals(r as never) as unknown as {
    validator: unknown;
    getCloneState: () => Record<string, unknown>;
  };
  const p1 = (): Record<string, unknown> => ({});
  const p2 = (): Record<string, unknown> => ({});
  let calls = 0;
  let seenLen = -1;
  let frozen: unknown = null;
  ctx.validator = makeValidator({
    plugins: {
      validateNoDuplicatePlugins: (_f: unknown, factories: unknown) => {
        calls += 1;
        frozen = Object.isFrozen(factories);
        seenLen = (factories as unknown[]).length;
        (factories as unknown[]).push(p2 as unknown);
        return undefined;
      },
    },
  });
  (r as { usePlugin: (p: unknown) => unknown }).usePlugin(p1);
  out["H.control.validatorCalled"] = calls;
  out["H.factories.frozen"] = frozen;
  out["H.factories.lengthAtCall"] = seenLen;
  const after = ctx.getCloneState().pluginFactories as unknown[];
  out["H.appPushReachesCore"] = after.includes(p2 as unknown);
  out["H.control.realFactoryRegistered"] = after.includes(p1 as unknown);
}

console.log(JSON.stringify(out, null, 2));
