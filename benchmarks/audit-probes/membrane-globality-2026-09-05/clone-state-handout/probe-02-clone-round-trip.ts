// Round-trip хэндаута: `getCloneState()` → `cloneRouter` →
// `new Router(routes, { ...options, logger, limits, urlParamsEncoding }, mergedDeps)`.
//
// Доказать, через КАКИЕ двери объекты пробела входят в клон (двери конструктора
// `createRouter·options` / `createRouter·options.limits` / `createRouter·options.logger`
// / `createRouter·dependencies`), что база и клон не алиасят контейнеры ядра, что
// листья (сервисы, вложенные мешки вызывающего) — по ссылке, и сколько раз мешки
// ВЫЗЫВАЮЩЕГО читаются во время `cloneRouter` (счётчики как позитивный контроль).
import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getPluginApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  countingProxy,
} from "../../../../packages/core/tests/helpers/hostileBags";

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
      : "other";
};
const snap = (r: Readonly<Record<string, number>>): Record<string, number> => ({
  ...r,
});

const routes = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:page?q" },
];
const queryParamsBag = countingBag({ arrayFormat: "brackets" });
const limitsBag = countingBag({ maxListeners: 50 });
const defaultParamsObj: Bag = { page: "1" };
const loggerCallback = (): void => {};
const optionsBag = countingBag({
  defaultRoute: "home",
  defaultParams: defaultParamsObj,
  queryParams: queryParamsBag.bag,
  limits: limitsBag.bag,
  logger: { level: "none", callback: loggerCallback },
  urlParamsEncoding: "uriComponent",
  kept: 1,
});
const dbLeaf: Bag = { n: 1 };
const base = createRouter(routes as never, optionsBag.bag as never, {
  db: dbLeaf,
  kept: 1,
} as never);
const factoryA = (): object => ({});

base.usePlugin(factoryA as never);

const baseCtx = getInternals(base);
const baseCS = baseCtx.getCloneState();
const readsBeforeClone = {
  options: snap(optionsBag.reads),
  queryParams: snap(queryParamsBag.reads),
  limits: snap(limitsBag.reads),
};

// Позитивный контроль гварда двери `cloneRouter·dependencies`: мешок с геттером
// ОТКАЗАН (`ingestDependencies`), Proxy — допущен и прочитан по разу на ключ.
const getterBag = countingBag({ x: 1 });
const refused = attempt(() => cloneRouter(base, getterBag.bag as never));
const overrideProxy = countingProxy({ traceId: "t1", db: { n: 2 } });
const clone = cloneRouter(base, overrideProxy.bag as never, {
  logger: { level: "all" },
});
const readsAfterClone = {
  options: snap(optionsBag.reads),
  queryParams: snap(queryParamsBag.reads),
  limits: snap(limitsBag.reads),
};
const cloneCtx = getInternals(clone);
const cloneCS = cloneCtx.getCloneState();
const baseOpts = getPluginApi(base).getOptions() as unknown as Bag;
const cloneOpts = getPluginApi(clone).getOptions() as unknown as Bag;

out.control = {
  refusedGetterBagAtCloneRouterDependencies: refused,
  getterBagReadsBeforeRefusal: snap(getterBag.reads),
  overrideProxyReadsPerKey: snap(overrideProxy.reads),
  cloneIsRouter: typeof clone.navigate === "function",
  cloneNotBase: (clone as unknown) !== base,
};
out.callerReadsDuringCloneRouter = {
  before: readsBeforeClone,
  after: readsAfterClone,
};
out.optionsDoor = {
  cloneRecordFresh: cloneOpts !== baseOpts,
  cloneRecordFrozen: Object.isFrozen(cloneOpts),
  cloneRecordProto: protoName(cloneOpts),
  queryParamsSharedByRef:
    cloneOpts.queryParams === baseOpts.queryParams &&
    cloneOpts.queryParams === queryParamsBag.bag,
  defaultParamsSharedByRef:
    cloneOpts.defaultParams === defaultParamsObj &&
    baseOpts.defaultParams === defaultParamsObj,
  cloneLimitsIsCallerBag: cloneOpts.limits === limitsBag.bag,
  cloneLimitsKeys: Object.keys(cloneOpts.limits as object),
  cloneLimitsValues: cloneOpts.limits,
  cloneLimitsFrozen: Object.isFrozen(cloneOpts.limits),
  cloneLimitsProto: protoName(cloneOpts.limits),
  loggerPresentOnCloneRecord: Object.hasOwn(cloneOpts, "logger"),
  urlParamsEncodingOnClone: cloneOpts.urlParamsEncoding,
  unknownKeyCarried: cloneOpts.kept,
};
out.cloneStateOfClone = {
  limitsObjectDistinct: cloneCS.limits !== baseCS.limits,
  limitsValuesEqual:
    JSON.stringify(cloneCS.limits) === JSON.stringify(baseCS.limits),
  limitsFrozen: Object.isFrozen(cloneCS.limits),
  limitKeysDistinctArray: cloneCS.limitKeys !== baseCS.limitKeys,
  limitKeysEqual:
    JSON.stringify(cloneCS.limitKeys) === JSON.stringify(baseCS.limitKeys),
  limitKeysFrozen: Object.isFrozen(cloneCS.limitKeys),
  loggerLevel: cloneCS.loggerConfig.level,
  loggerCallbackByReference: cloneCS.loggerConfig.callback === loggerCallback,
  pluginFactoriesReplayedByIdentity:
    cloneCS.pluginFactories.length === 1 &&
    (cloneCS.pluginFactories[0] as unknown) === factoryA,
};

const baseDeps = getDependenciesApi(base);
const cloneDeps = getDependenciesApi(clone);

baseDeps.set("later" as never, 1 as never);

const c2 = cloneRouter(base);

dbLeaf.n = 7;

const leafWriteSharedWithLaterClone =
  (getDependenciesApi(c2).get("db" as never) as Bag).n === 7;

c2.dispose();
baseDeps.set("__proto__" as never, { pwned: "YES" } as never);

const c3 = cloneRouter(base);
const protoKey = {
  baseHas: baseDeps.has("__proto__" as never),
  cloneHas: getDependenciesApi(c3).has("__proto__" as never),
  cloneGetAllHasOwn: Object.hasOwn(getDependenciesApi(c3).getAll(), "__proto__"),
};

c3.dispose();
out.dependenciesDoor = {
  cloneStoreDistinct:
    cloneCtx.dependenciesGetStore().dependencies !==
    baseCtx.dependenciesGetStore().dependencies,
  cloneStoreProto: protoName(cloneCtx.dependenciesGetStore().dependencies),
  inheritedLeafValue: cloneDeps.get("kept" as never),
  dbOverriddenOnClone: (cloneDeps.get("db" as never) as Bag).n,
  baseDbUntouched: (baseDeps.get("db" as never) as unknown) === dbLeaf,
  containerWriteOnBaseReachesEarlierClone: cloneDeps.has("later" as never),
  leafWriteSharedWithLaterClone,
  protoKeyDoesNotReachClone: protoKey,
};

// Гейт идентичности на `cloneRouter·router`: объект, собранный вызывающим,
// отказан до единственного чтения (WeakMap-реестр `getInternals`).
const fake = countingBag({ navigate: (): void => {}, dispose: (): void => {} });

out.routerParamGate = {
  result: attempt(() => cloneRouter(fake.bag as never)),
  readsOnFake: snap(fake.reads),
};

clone.dispose();
base.dispose();

console.log(JSON.stringify(out, null, 2));
