// Линза-пробел: `DependenciesApi.getAll·return` (`api/getDependenciesApi.ts · getAll`,
// `dropUnsafeKey({ ...source })`) и её семейство на той же поверхности:
//   - хэндаут `getAll()`: свежесть, прототип, заморозка, листья по ссылке, symbol-ключ,
//     удержание `"__proto__"`, отсутствие round-trip записи через хэндаут;
//   - ПРОФИЛЬ ЧТЕНИЙ стора во время `getAll()` — наблюдение СНАРУЖИ: слот
//     `store.dependencies` заменяем Proxy-счётчиком над null-prototype целью через
//     опубликованный `getInternals` (никакой инструментации src);
//   - ноль кода приложения во время `getAll()` (define-vs-set, форма #1852):
//     ambient-аксессор на `Object.prototype` под именем зависимости;
//   - повторный вход хэндаута в ядро ТОЛЬКО как мешок вызывающего через горло
//     `ingestDependencies` (`setAll`, `cloneRouter`);
//   - `RouterInternals.getCloneState·return.dependencies` — тот же механизм на другой точке входа;
//   - `getDependenciesApi·router` — гейт идентичности (WeakMap) до единственного чтения;
//   - `DependenciesApi.get·return` и замыкание `getDependency` (wireNamespaces ·
//     createCompileFactory) — ЛИСТ по ссылке из живого слота, не контейнер.
// Позитивные контроли: (а) счётчик слота регистрирует чтения `has`/`get`; (б) ambient-
// аксессор ЖИВ — запись циклом `target.svc = v` диспатчит в сеттер.
import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;
type Counts = Record<string, number>;

function trapCounter<T extends object>(
  target: T,
): { proxy: T; counts: () => Counts; reset: () => void } {
  let counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const proxy = new Proxy(target, {
    ownKeys(t) {
      bump("ownKeys");
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      bump(`gopd:${String(k)}`);
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get(t, k, r) {
      bump(`get:${String(k)}`);
      return Reflect.get(t, k, r);
    },
    has(t, k) {
      bump(`has:${String(k)}`);
      return Reflect.has(t, k);
    },
    getPrototypeOf(t) {
      bump("getPrototypeOf");
      return Reflect.getPrototypeOf(t);
    },
    set(t, k, v, r) {
      bump(`set:${String(k)}`);
      return Reflect.set(t, k, v, r);
    },
    defineProperty(t, k, d) {
      bump(`defineProperty:${String(k)}`);
      return Reflect.defineProperty(t, k, d);
    },
    deleteProperty(t, k) {
      bump(`deleteProperty:${String(k)}`);
      return Reflect.deleteProperty(t, k);
    },
  });
  return {
    proxy,
    counts: () => ({ ...counts }),
    reset: () => {
      counts = {};
    },
  };
}

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

const out: Record<string, unknown> = {};

const svc: Bag = { name: "db" };
const fn = (): number => 1;
const SYM = Symbol("svc");
const PROTO_VALUE = { pwned: "YES" };
const routes = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id" },
];
const router = createRouter(routes as never, {} as never, {
  svc,
  fn,
  n: 1,
} as never);
const ctx = getInternals(router);
const deps = getDependenciesApi(router);
const liveStore = ctx.dependenciesGetStore();

// --- A. инструмент: подмена слота Proxy-счётчиком (снаружи, через getInternals) ---
const seeded = Object.create(null) as Bag;
seeded.svc = svc;
seeded.fn = fn;
seeded.n = 1;
(seeded as Record<symbol, unknown>)[SYM] = "sym";
// own "__proto__" как ОБЫЧНЫЙ ключ null-prototype стора (форма set("__proto__", v))
Object.defineProperty(seeded, "__proto__", {
  value: PROTO_VALUE,
  enumerable: true,
  writable: true,
  configurable: true,
});
const inst = trapCounter(seeded);
const originalSlot = liveStore.dependencies;
(liveStore as { dependencies: unknown }).dependencies = inst.proxy;

// позитивный контроль инструмента: has/get регистрируются
deps.has("svc" as never);
out.instrumentControl_has = inst.counts();
inst.reset();
const gotSvc = deps.get("svc" as never);
out.instrumentControl_get = { counts: inst.counts(), leafIdentity: gotSvc === svc };
inst.reset();

// --- B. профиль чтений стора: getAll ---
const all1 = deps.getAll() as Bag;
out.getAll_readProfile = inst.counts();
inst.reset();
// getCloneState().dependencies — тот же spread + dropUnsafeKey (Router.ts · registerInternals.getCloneState)
const cs1 = ctx.getCloneState().dependencies;
out.getCloneStateDeps_readProfile = inst.counts();
inst.reset();
out.readProfile_handoutsMadeFromProxy = {
  getAllKeys: Reflect.ownKeys(all1).map(String),
  cloneStateKeys: Reflect.ownKeys(cs1).map(String),
};

// вернуть слот на реальную (null-prototype) цель без Proxy для остальных секций
(liveStore as { dependencies: unknown }).dependencies = seeded;
out.slotRestored =
  liveStore.dependencies === seeded && (originalSlot as unknown) !== seeded;

// --- C. форма хэндаута getAll ---
const a = deps.getAll() as Bag;
const b = deps.getAll() as Bag;
a.injected = 1;
const svcBefore = a.svc;
delete a.svc;
svc.mutatedThroughLeaf = true;
out.getAll_shape = {
  freshPerCall: a !== b,
  notLiveStore: (a as unknown) !== liveStore.dependencies,
  proto: protoName(a),
  frozen: Object.isFrozen(a),
  leafIdentity: svcBefore === svc && b.fn === fn,
  symbolKeyCarried: (b as Record<symbol, unknown>)[SYM] === "sym",
  protoKeyWithheld: !Object.hasOwn(b, "__proto__"),
  storeHoldsProtoKey: deps.has("__proto__" as never),
  getAnswersProtoKey: deps.get("__proto__" as never) === PROTO_VALUE,
  stringKeys: Object.keys(b),
  containerWriteNoRoundTrip: !deps.has("injected" as never),
  containerDeleteNoRoundTrip: deps.has("svc" as never),
  leafWriteSharedWithStore:
    (deps.get("svc" as never) as Bag).mutatedThroughLeaf === true,
  mergeTargetProtoIntact: protoName(Object.assign({}, b)) === "Object.prototype",
};
delete svc.mutatedThroughLeaf;

// --- D. ноль кода приложения во время getAll: ambient-аксессор под именем зависимости ---
let ambientGet = 0;
let ambientSet = 0;
Object.defineProperty(Object.prototype, "svc", {
  configurable: true,
  get() {
    ambientGet += 1;
    return "AMBIENT";
  },
  set() {
    ambientSet += 1;
  },
});
let handoutUnderAmbient: Bag | undefined;
const ambientAttempt = attempt(() => {
  handoutUnderAmbient = deps.getAll() as Bag;
});
const getAllGetCalls = ambientGet;
const getAllSetCalls = ambientSet;
// контроль: аксессор ЖИВ — цикл записи `target.svc = v` диспатчит в сеттер (форма #1852)
const loopTarget: Bag = {};
loopTarget.svc = svc;
const controlSetCalls = ambientSet - getAllSetCalls;
delete (Object.prototype as unknown as Bag).svc;
out.getAll_zeroAppCode_ambientAccessor = {
  attempt: ambientAttempt,
  handoutSvcIsLeaf: handoutUnderAmbient?.svc === svc,
  handoutOwnsSvc: handoutUnderAmbient
    ? Object.hasOwn(handoutUnderAmbient, "svc")
    : undefined,
  ambientGetterCallsDuringGetAll: getAllGetCalls,
  ambientSetterCallsDuringGetAll: getAllSetCalls,
  control_writeLoopDispatchesIntoSetter: controlSetCalls,
  control_loopTargetOwnsSvcAfterWrite: Object.hasOwn(loopTarget, "svc"),
};

// --- E. повторный вход хэндаута — только через горло ingestDependencies ---
const snap = deps.getAll() as Bag;
const extraLeaf = { e: 1 };
snap.extra = extraLeaf;
const reentrySetAll = attempt(() => {
  deps.setAll(snap as never);
});
out.reentry_setAll = {
  attempt: reentrySetAll,
  extraLanded: deps.get("extra" as never) === extraLeaf,
  leafIdentityKept: deps.get("svc" as never) === svc,
  protoKeyStillHeldInStore: deps.has("__proto__" as never),
  handoutStillNotStore: (snap as unknown) !== liveStore.dependencies,
};
const clone = cloneRouter(router, deps.getAll() as never);
const cdeps = getDependenciesApi(clone);
out.reentry_cloneRouter = {
  svcLeafShared: cdeps.get("svc" as never) === svc,
  extraLanded: cdeps.get("extra" as never) === extraLeaf,
  protoKeyReachesClone: cdeps.has("__proto__" as never),
  cloneStoreProto: protoName(
    getInternals(clone).dependenciesGetStore().dependencies,
  ),
  cloneStoreDistinct:
    getInternals(clone).dependenciesGetStore().dependencies !==
    liveStore.dependencies,
};
clone.dispose();

// --- F. getCloneState().dependencies — форма ---
const c1 = ctx.getCloneState().dependencies as Bag;
const c2 = ctx.getCloneState().dependencies as Bag;
c1.injected2 = 1;
out.cloneStateDeps_shape = {
  freshPerCall: c1 !== c2,
  notLiveStore: (c1 as unknown) !== liveStore.dependencies,
  notTheGetAllObject: (c2 as unknown) !== deps.getAll(),
  proto: protoName(c1),
  frozen: Object.isFrozen(c1),
  leafIdentity: c2.svc === svc,
  symbolKeyCarried: (c2 as Record<symbol, unknown>)[SYM] === "sym",
  protoKeyWithheld: !Object.hasOwn(c2, "__proto__"),
  containerWriteNoRoundTrip: !deps.has("injected2" as never),
  sameStringKeysAsGetAll:
    JSON.stringify(Object.keys(c2).toSorted()) ===
    JSON.stringify(Object.keys(deps.getAll()).toSorted()),
};

// --- G. getDependenciesApi·router — гейт идентичности до чтения ---
const fake = countingBag({ navigate: (): void => {}, dispose: (): void => {} });
out.routerParamGate = {
  result: attempt(() => getDependenciesApi(fake.bag as never)),
  readsOnFake: { ...fake.reads },
};
out.apiObjectHandout = {
  freshPerCall: getDependenciesApi(router) !== getDependenciesApi(router),
  frozen: Object.isFrozen(getDependenciesApi(router)),
};

// --- H. замыкание getDependency (фабрики гвардов/плагинов) — лист из ЖИВОГО слота ---
let guardGetDependency: ((k: never) => unknown) | undefined;
getLifecycleApi(router).addActivateGuard("u", ((
  _r: unknown,
  getDependency: (k: never) => unknown,
) => {
  guardGetDependency = getDependency;
  return () => true;
}) as never);
let pluginGetDependency: ((k: never) => unknown) | undefined;
router.usePlugin(((_r: unknown, getDependency: (k: never) => unknown) => {
  pluginGetDependency = getDependency;
  return {};
}) as never);
const leafBefore = guardGetDependency?.("svc" as never);
const replacement = { other: true };
deps.set("svc" as never, replacement as never);
const leafAfterSet = guardGetDependency?.("svc" as never);
const protoViaClosure = guardGetDependency?.("__proto__" as never);
deps.reset();
const afterReset = guardGetDependency?.("svc" as never);
out.getDependencyClosure = {
  factoryReceivedFunction: typeof guardGetDependency,
  leafIdentity: leafBefore === svc,
  liveSlotNotSnapshot: leafAfterSet === replacement,
  protoNameAnswersStoredValue: protoViaClosure === PROTO_VALUE,
  afterResetUndefined: afterReset === undefined,
  sameClosureForGuardAndPluginFactory: pluginGetDependency === guardGetDependency,
};

router.dispose();
out.afterDispose = {
  getAllIsEmptyFreshObject:
    Object.keys(deps.getAll()).length === 0 && deps.getAll() !== deps.getAll(),
  earlierHandoutStillHoldsLeaves: b.fn === fn,
};

console.log(JSON.stringify(out, null, 2));
