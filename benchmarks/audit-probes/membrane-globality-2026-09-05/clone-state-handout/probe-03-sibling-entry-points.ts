// Те же объекты на ДРУГИХ точках входа (смежное семейство пробела):
//   - `DependenciesApi.getAll·return`   — тот же механизм, что `getCloneState().dependencies`
//   - `DependenciesApi.get·return`      — лист по ссылке (не контейнер)
//   - `RouterInternals.getOptions·return` — та же функция и та же замороженная запись, что `PluginApi.getOptions·return`
//   - `RouterInternals.dependenciesGetStore·return.limits` — тот же `#limits`, что `getCloneState().limits`; СЛОТ заменяем
//   - `RouterValidator.plugins.validateNoDuplicatePlugins·factories` — тот же `getAll()`-массив, что `pluginFactories`, отдан коду плагина
//   - `createRequestScope·deps` (ssr-utils) — spread ДО `cloneRouter`: тот же мешок, другая политика на геттер
//   - `RouterInternals.logger` — по ТИПУ интерфейс `{log,warn,error}` (не дверь); на рантайме экземпляр с `configure`/`getConfig`
import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getPluginApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";
import { createRequestScope } from "../../../../packages/ssr-utils/src/createRequestScope";

type Bag = Record<string, unknown>;

const out: Record<string, unknown> = {};
const attempt = (fn: () => void): string => {
  try {
    fn();

    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}:${(error as Error).message}`;
  }
};
const protoName = (o: unknown): string => {
  if (o === null || o === undefined || typeof o !== "object") {
    return `not-object:${String(o)}`;
  }

  const p = Object.getPrototypeOf(o) as object | null;

  return p === null
    ? "null"
    : p === Object.prototype
      ? "Object.prototype"
      : p === Array.prototype
        ? "Array.prototype"
        : "other";
};
const snap = (r: Readonly<Record<string, number>>): Record<string, number> => ({
  ...r,
});

const routes = [{ name: "home", path: "/home" }];
const limitsBag = countingBag({ maxListeners: 50 });
const dbLeaf: Bag = { n: 1 };
const router = createRouter(
  routes as never,
  { defaultRoute: "home", limits: limitsBag.bag } as never,
  { db: dbLeaf, kept: 1 } as never,
);
const ctx = getInternals(router);
const plugin = getPluginApi(router);
const depsApi = getDependenciesApi(router);

// --- 1. DependenciesApi.getAll·return / get·return ---
depsApi.set("__proto__" as never, { pwned: "YES" } as never);

const all1 = depsApi.getAll() as Bag;
const all2 = depsApi.getAll() as Bag;
const store = ctx.dependenciesGetStore();

all1.kept = 2;
all1.__added__ = 1;
out.dependenciesApiGetAll = {
  freshPerCall: all1 !== all2,
  isLiveStore: (all1 as unknown) === store.dependencies,
  frozen: Object.isFrozen(all1),
  proto: protoName(all1),
  leafByReference: all2.db === dbLeaf,
  storeHoldsProtoKey: depsApi.has("__proto__" as never),
  handoutHasOwnProto: Object.hasOwn(all1, "__proto__"),
  sameShapeAsCloneState:
    JSON.stringify(Object.keys(all2).toSorted((a, b) => a.localeCompare(b))) ===
    JSON.stringify(
      Object.keys(ctx.getCloneState().dependencies).toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ),
  containerWriteReachesStore:
    (depsApi.get("kept" as never) as unknown) === 2 ||
    depsApi.has("__added__" as never),
};
out.dependenciesApiGet = {
  leafByReference: (depsApi.get("db" as never) as unknown) === dbLeaf,
  protoKeyValueReturned: JSON.stringify(depsApi.get("__proto__" as never)),
};

// --- 2. RouterInternals.getOptions·return ---
const internalsOptions = ctx.getOptions() as unknown as Bag;

out.routerInternalsGetOptions = {
  sameFunctionAsPluginApi: (ctx.getOptions as unknown) === plugin.getOptions,
  sameObjectAsPluginApi:
    (ctx.getOptions() as unknown) === (plugin.getOptions() as unknown),
  sameAcrossCalls: (ctx.getOptions() as unknown) === internalsOptions,
  frozen: Object.isFrozen(internalsOptions),
  proto: protoName(internalsOptions),
  limitsLeafIsCallerBag: internalsOptions.limits === limitsBag.bag,
  limitsLeafFrozen: Object.isFrozen(internalsOptions.limits),
  writeAttempt: attempt(() => {
    internalsOptions.defaultRoute = "__probe__";
  }),
  valueAfterWrite: internalsOptions.defaultRoute,
};

// --- 3. RouterInternals.dependenciesGetStore·return.limits ---
const readsBefore = snap(limitsBag.reads);
const storeLimits = store.limits;
const replacement = { ...storeLimits, maxDependencies: 1 };

out.dependenciesStoreLimits = {
  sameObjectAsCloneState: storeLimits === ctx.getCloneState().limits,
  frozen: Object.isFrozen(storeLimits),
  storeContainerFrozen: Object.isFrozen(store),
  storeSlotReplaceAttempt: attempt(() => {
    (store as { limits: unknown }).limits = replacement;
  }),
  storeSlotNowReplacement: (store.limits as unknown) === replacement,
  cloneStateStillOriginal: ctx.getCloneState().limits === storeLimits,
  nextCloneInheritsOriginalCap: (() => {
    const c = cloneRouter(router);
    const v = getInternals(c).getCloneState().limits.maxDependencies;

    c.dispose();

    return v;
  })(),
  callerLimitsBagReadsDuringAllOfThis: {
    before: readsBefore,
    after: snap(limitsBag.reads),
  },
};
(store as { limits: unknown }).limits = storeLimits;

// --- 4. RouterValidator.plugins.validateNoDuplicatePlugins·factories ---
const seen: unknown[][] = [];
const stubValidator = {
  plugins: {
    validatePluginLimit: (): void => {},
    validateNoDuplicatePlugins: (_f: unknown, factories: unknown[]): void => {
      seen.push(factories);
      factories.push("__injected__");
    },
    validatePluginKeys: (): void => {},
    validateCountThresholds: (): void => {},
    warnBatchDuplicates: (): void => {},
    warnPluginMethodType: (): void => {},
    warnPluginAfterStart: (): void => {},
  },
};

ctx.validator = stubValidator as never;

const factoryA = (): object => ({});
const factoryB = (): object => ({});

router.usePlugin(factoryA as never);
router.usePlugin(factoryB as never);
ctx.validator = null;
out.validateNoDuplicatePluginsFactories = {
  calls: seen.length,
  isArray: seen.every((a) => Array.isArray(a)),
  freshPerCall: seen[0] !== seen[1],
  frozen: seen.map((a) => Object.isFrozen(a)),
  firstCallLengthSeen: seen[0]?.length,
  secondCallCarriesInjected: seen[1]?.includes("__injected__"),
  secondCallElementsByIdentity: seen[1]?.[0] === factoryA,
  cloneStateCarriesInjected: ctx
    .getCloneState()
    .pluginFactories.includes("__injected__" as never),
  cloneStateLength: ctx.getCloneState().pluginFactories.length,
};

// --- 5. createRequestScope·deps (ssr-utils) — spread ДО cloneRouter ---
const request = { signal: new AbortController().signal };
const getterDeps = countingBag({ x: 1 });
const directRefusal = attempt(() => cloneRouter(router, getterDeps.bag as never));
const readsAfterDirect = snap(getterDeps.reads);
const scopeResult = attempt(() => {
  const scope = createRequestScope(request, router, getterDeps.bag as never);
  const scoped = getDependenciesApi(scope.router);

  out.createRequestScopeDepsGetterBag = {
    xLandedOnClone: scoped.get("x" as never),
    abortSignalInjected: scoped.has("abortSignal" as never),
    readsOnGetterBag: {
      afterDirectCloneRouterAttempt: readsAfterDirect,
      afterCreateRequestScope: snap(getterDeps.reads),
    },
  };
  void scope.dispose();
});
const protoDeps = JSON.parse('{"__proto__":{"pwned":"YES"},"k":1}') as Bag;
const scope2 = createRequestScope(request, router, protoDeps as never);
const scoped2 = getDependenciesApi(scope2.router);

out.createRequestScopeDeps = {
  directCloneRouterOnGetterBag: directRefusal,
  createRequestScopeOnSameGetterBag: scopeResult,
  ownProtoJsonBag: {
    kLanded: scoped2.get("k" as never),
    cloneStoreHoldsProtoKey: scoped2.has("__proto__" as never),
    getAllHasOwnProto: Object.hasOwn(scoped2.getAll(), "__proto__"),
    cloneStoreProto: protoName(getInternals(scope2.router).dependenciesGetStore().dependencies),
  },
};
void scope2.dispose();

// --- 6. RouterInternals.logger — рантайм-форма экземпляра ---
const loggerRuntime = ctx.logger as unknown as {
  configure?: (c: unknown) => void;
  getConfig?: () => Bag;
};
const levelBag = countingBag({ level: "none" });

out.routerInternalsLogger = {
  typedSurfaceKeys: ["log", "warn", "error"],
  runtimeHasConfigure: typeof loggerRuntime.configure === "function",
  runtimeHasGetConfig: typeof loggerRuntime.getConfig === "function",
  configureFromCallerBag: attempt(() => loggerRuntime.configure?.(levelBag.bag)),
  readsOnCallerBag: snap(levelBag.reads),
  getConfigFreshPerCall: loggerRuntime.getConfig?.() !== loggerRuntime.getConfig?.(),
  getConfigLevel: loggerRuntime.getConfig?.()?.level,
  cloneStateLoggerConfigLevel: ctx.getCloneState().loggerConfig.level,
  unknownKeyRefused: attempt(() =>
    loggerRuntime.configure?.(JSON.parse('{"level":"all","__proto__":{"pwned":"YES"}}')),
  ),
};

router.dispose();

console.log(JSON.stringify(out, null, 2));
