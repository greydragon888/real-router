// Дверь-пробел: `RouterInternals.getCloneState·return` и её шесть полей
// (`Router.ts · registerInternals.getCloneState`, достижима через опубликованный
// `@real-router/core/validation`).
//
// Для контейнера и каждого поля: свежесть на вызов, заморозка, прототип,
// идентичность с записью ядра / с мешком вызывающего (листья), доходит ли мутация
// через хэндаут до состояния ядра, и — главное для P1/P2 — число чтений мешков
// ВЫЗЫВАЮЩЕГО во время самого вызова `getCloneState()` (позитивный контроль: те
// же счётчики регистрируют чтения в конструкторе).
import { createRouter } from "@real-router/core";
import { getDependenciesApi, getPluginApi } from "@real-router/core/api";
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
      : p === Array.prototype
        ? "Array.prototype"
        : "other";
};
const snap = (r: Readonly<Record<string, number>>): Record<string, number> => ({
  ...r,
});
const delta = (
  before: Record<string, number>,
  after: Record<string, number>,
): Record<string, number> => {
  const d: Record<string, number> = {};

  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    d[k] = (after[k] ?? 0) - (before[k] ?? 0);
  }

  return d;
};

// --- мешки вызывающего, инструментированные ---
const queryParamsBag = countingBag({ arrayFormat: "brackets" });
const limitsBag = countingBag({ maxListeners: 50 });
const defaultParamsObj: Bag = { page: "1" };
const defaultSearchObj: Bag = { q: "x" };
const loggerCallback = (): void => {};
const optionsBag = countingBag({
  defaultRoute: "home",
  defaultParams: defaultParamsObj,
  defaultSearch: defaultSearchObj,
  queryParams: queryParamsBag.bag,
  limits: limitsBag.bag,
  logger: { level: "none", callback: loggerCallback },
  kept: 1, // неизвестный ключ — контроль, что неизвестные ключи едут вместе
});
const dbLeaf: Bag = { n: 1 };
// Proxy, не accessorBag: `ingestDependencies` ОТКАЗЫВАЕТ мешку с геттерами.
const depsProxy = countingProxy({ db: dbLeaf, kept: 1 });

const routes = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:page?q" },
];
const router = createRouter(
  routes as never,
  optionsBag.bag as never,
  depsProxy.bag as never,
);
const ctx = getInternals(router);
const plugin = getPluginApi(router);
const depsApi = getDependenciesApi(router);

const factoryA = (): object => ({});
const factoryB = (): object => ({});

router.usePlugin(factoryA as never, factoryB as never);
depsApi.set("__proto__" as never, { pwned: "YES" } as never);

const readsAfterConstruction = {
  options: snap(optionsBag.reads),
  queryParams: snap(queryParamsBag.reads),
  limits: snap(limitsBag.reads),
  deps: snap(depsProxy.reads),
};

// --- позитивный контроль двери + свежесть внешнего контейнера ---
const cs1 = ctx.getCloneState();
const cs2 = ctx.getCloneState();

ctx.getCloneState();

const readsAfterThreeCalls = {
  options: snap(optionsBag.reads),
  queryParams: snap(queryParamsBag.reads),
  limits: snap(limitsBag.reads),
  deps: snap(depsProxy.reads),
};

out.control = {
  keys: Object.keys(cs1).toSorted((a, b) => a.localeCompare(b)),
  outerFreshPerCall: cs1 !== cs2,
  outerFrozen: Object.isFrozen(cs1),
  outerProto: protoName(cs1),
  instrumentRegisters:
    readsAfterConstruction.options.defaultRoute >= 1 &&
    readsAfterConstruction.deps.db >= 1 &&
    readsAfterConstruction.queryParams.arrayFormat >= 1 &&
    readsAfterConstruction.limits.maxListeners >= 1,
};
out.callerReadsDuringGetCloneState = {
  readsAfterConstruction,
  deltaOverThreeCalls: {
    options: delta(readsAfterConstruction.options, readsAfterThreeCalls.options),
    queryParams: delta(
      readsAfterConstruction.queryParams,
      readsAfterThreeCalls.queryParams,
    ),
    limits: delta(readsAfterConstruction.limits, readsAfterThreeCalls.limits),
    deps: delta(readsAfterConstruction.deps, readsAfterThreeCalls.deps),
  },
};

// --- options ---
const frozenOptions = plugin.getOptions() as unknown as Bag;
const o1 = cs1.options as unknown as Bag;
const sameKeySet = (a: object, b: object): boolean =>
  JSON.stringify(Object.keys(a).toSorted((x, y) => x.localeCompare(y))) ===
  JSON.stringify(Object.keys(b).toSorted((x, y) => x.localeCompare(y)));

o1.defaultRoute = "__probe__";
(o1.defaultParams as Bag).__probe__ = 1;

out.options = {
  freshPerCall: cs1.options !== cs2.options,
  frozen: Object.isFrozen(o1),
  proto: protoName(o1),
  isTheFrozenRecord: (cs1.options as unknown) === frozenOptions,
  ownKeysEqualToGetOptions: sameKeySet(o1, frozenOptions),
  unknownKeyRidesAlong: o1.kept === 1,
  loggerPresent: Object.hasOwn(o1, "logger"),
  leafByReference: {
    queryParams: o1.queryParams === queryParamsBag.bag,
    limits: o1.limits === limitsBag.bag,
    defaultParams: o1.defaultParams === defaultParamsObj,
    defaultSearch: o1.defaultSearch === defaultSearchObj,
  },
  nestedFrozen: {
    queryParams: Object.isFrozen(o1.queryParams),
    limits: Object.isFrozen(o1.limits),
    defaultParams: Object.isFrozen(o1.defaultParams),
  },
  containerWriteReachesGetOptions: frozenOptions.defaultRoute === "__probe__",
  containerWriteReachesNextCall:
    (ctx.getCloneState().options as unknown as Bag).defaultRoute ===
    "__probe__",
  leafWriteReachesCallerAndGetOptions:
    defaultParamsObj.__probe__ === 1 &&
    (frozenOptions.defaultParams as Bag).__probe__ === 1,
};
delete defaultParamsObj.__probe__;

// own `__proto__` (JSON.parse) на мешке ОПЦИЙ — сброшен у источника (OptionsNamespace)
const poisoned = createRouter(
  routes as never,
  JSON.parse(
    '{"defaultRoute":"home","__proto__":{"pwned":"YES"},"kept":1}',
  ) as never,
);
const pcs = getInternals(poisoned).getCloneState().options as unknown as Bag;
const mergeTarget: Bag = {};

Object.assign(mergeTarget, pcs);
out.optionsUnsafeKey = {
  handoutHasOwnProto: Object.hasOwn(pcs, "__proto__"),
  keptControl: pcs.kept === 1,
  mergeTargetSwapped: Object.getPrototypeOf(mergeTarget) !== Object.prototype,
};
poisoned.dispose();

// --- dependencies ---
const store = ctx.dependenciesGetStore();
const d1 = cs1.dependencies;

d1.kept = 2;
d1.__added__ = 1;
out.dependencies = {
  freshPerCall: cs1.dependencies !== cs2.dependencies,
  isLiveStore: (d1 as unknown) === store.dependencies,
  frozen: Object.isFrozen(d1),
  proto: protoName(d1),
  storeProto: protoName(store.dependencies),
  leafByReference:
    d1.db === dbLeaf && (depsApi.get("db" as never) as unknown) === dbLeaf,
  storeHoldsProtoKey: depsApi.has("__proto__" as never),
  handoutHasOwnProto: Object.hasOwn(d1, "__proto__"),
  getAllHasOwnProto: Object.hasOwn(depsApi.getAll(), "__proto__"),
  keptControl: cs2.dependencies.kept === 1,
  containerWriteReachesStore:
    (depsApi.get("kept" as never) as unknown) === 2 ||
    depsApi.has("__added__" as never),
  containerWriteReachesNextCall: ctx.getCloneState().dependencies.kept === 2,
};

// --- pluginFactories ---
const p1 = cs1.pluginFactories;

p1.push(((): object => ({})) as never);
out.pluginFactories = {
  freshPerCall: cs1.pluginFactories !== cs2.pluginFactories,
  isArray: Array.isArray(p1),
  frozen: Object.isFrozen(p1),
  proto: protoName(p1),
  elementsByIdentity:
    (cs2.pluginFactories[0] as unknown) === factoryA &&
    (cs2.pluginFactories[1] as unknown) === factoryB,
  lengthBeforePush: cs2.pluginFactories.length,
  lengthAfterPushOnHandout: p1.length,
  nextCallLength: ctx.getCloneState().pluginFactories.length,
};

// --- loggerConfig ---
const l1 = cs1.loggerConfig as unknown as Bag;

l1.level = "all";
out.loggerConfig = {
  freshPerCall: cs1.loggerConfig !== cs2.loggerConfig,
  frozen: Object.isFrozen(l1),
  proto: protoName(l1),
  keys: Object.keys(l1),
  levelOnSecondCall: cs2.loggerConfig.level,
  callbackByReference: cs2.loggerConfig.callback === loggerCallback,
  containerWriteReachesNextCall: ctx.getCloneState().loggerConfig.level === "all",
  unsafeKeyAtIntakeDoor: attempt(() =>
    createRouter([] as never, {
      logger: JSON.parse('{"level":"none","__proto__":{"pwned":"YES"}}'),
    } as never),
  ),
};

// --- limits ---
const lim1 = cs1.limits as unknown as Bag;
const limitsWrite = attempt(() => {
  lim1.maxListeners = 2;
});

out.limits = {
  sameAcrossCalls: cs1.limits === cs2.limits,
  frozen: Object.isFrozen(lim1),
  proto: protoName(lim1),
  sameObjectAsDependenciesStoreLimits: cs1.limits === store.limits,
  isTheCallerBag: (cs1.limits as unknown) === limitsBag.bag,
  isGetOptionsLimits: (cs1.limits as unknown) === frozenOptions.limits,
  keys: Object.keys(lim1),
  valuesAreNumbers: Object.values(lim1).every((v) => typeof v === "number"),
  writeAttempt: limitsWrite,
  valueAfterWrite: lim1.maxListeners,
};

// --- limitKeys ---
const lk1 = cs1.limitKeys as unknown as string[] | undefined;
const bare = createRouter([] as never);
const keysWrite = attempt(() => {
  (lk1 as string[]).push("maxPlugins");
});

out.limitKeys = {
  sameAcrossCalls: cs1.limitKeys === cs2.limitKeys,
  frozen: Object.isFrozen(lk1),
  proto: protoName(lk1),
  value: lk1,
  equalsCallerKeysAtConstruction:
    JSON.stringify(lk1) === JSON.stringify(Object.keys(limitsBag.bag)),
  writeAttempt: keysWrite,
  afterWrite: [...(lk1 ?? [])],
  undefinedWhenNoBag: getInternals(bare).getCloneState().limitKeys,
  readsOnCallerLimitsBagAtTheEnd: snap(limitsBag.reads),
};
bare.dispose();
router.dispose();

console.log(JSON.stringify(out, null, 2));
