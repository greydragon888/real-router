// Семейство пробела на поверхности ВАЛИДАТОРА (`RouterValidator.dependencies.*`,
// `types/RouterValidator.ts`): те же объекты — живой `DependenciesStore` и мешок
// вызывающего — на других точках входа, в руках кода плагина.
//   - `validateDependencyCount·store` / `validateDependencyExists·store`: ЖИВОЙ стор ядра
//     по ссылке (не копия): идентичность с `dependenciesGetStore()`, запись плагина через
//     ручку доходит до `has`/`get`; подмена слота `store.dependencies` внутри валидатора во
//     время `set`/`setAll` — куда падает запись (защита #1859: target захвачен ДО валидатора);
//   - `validateDependenciesObject·deps` / `validateCloneArgs·dependencies`: мешок
//     ВЫЗЫВАЮЩЕГО по ссылке в код плагина ДО копии ядра — счёт проходов по мешку
//     bare vs с реальным validation-plugin (P1: ровно один проход?);
//   - `validateSetDependencyArgs·value`: лист по ссылке;
//   - `warnBatchOverwrite·keys`: свежий массив ядра (payload), без round-trip.
// Позитивный контроль: тот же Proxy-счётчик регистрирует один проход на bare-двери;
// стаб-валидатор ВЫЗЫВАЕТСЯ (счётчик вызовов > 0), иначе идентичность ничего не доказывает.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

type Bag = Record<string, unknown>;
type Counts = Record<string, number>;

function trapCounter<T extends object>(target: T): { proxy: T; counts: Counts } {
  const counts: Counts = {};
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
  });
  return { proxy, counts };
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

const routes = [{ name: "home", path: "/home" }];
const svc: Bag = { name: "db" };
const out: Record<string, unknown> = {};

interface Hooks {
  onCount?: (store: unknown, method: string) => void;
  onExists?: (name: string, store: unknown) => void;
  onObject?: (deps: unknown, caller: string) => void;
  onClone?: (deps: unknown) => void;
  onSetArgs?: (name: unknown, value: unknown) => void;
  onBatch?: (keys: string[]) => void;
}
const calls: Counts = {};
const tick = (k: string): void => {
  calls[k] = (calls[k] ?? 0) + 1;
};
const stubValidator = (hooks: Hooks): unknown => ({
  dependencies: {
    validateDependencyName: (): void => {
      tick("validateDependencyName");
    },
    validateSetDependencyArgs: (name: unknown, value: unknown): void => {
      tick("validateSetDependencyArgs");
      hooks.onSetArgs?.(name, value);
    },
    validateDependenciesObject: (deps: unknown, caller: string): void => {
      tick("validateDependenciesObject");
      hooks.onObject?.(deps, caller);
    },
    validateDependencyExists: (name: string, store: unknown): void => {
      tick("validateDependencyExists");
      hooks.onExists?.(name, store);
    },
    validateDependencyCount: (store: unknown, method: string): void => {
      tick("validateDependencyCount");
      hooks.onCount?.(store, method);
    },
    validateCloneArgs: (deps: unknown): void => {
      tick("validateCloneArgs");
      hooks.onClone?.(deps);
    },
    warnOverwrite: (): void => {
      tick("warnOverwrite");
    },
    warnBatchOverwrite: (keys: string[]): void => {
      tick("warnBatchOverwrite");
      hooks.onBatch?.(keys);
    },
    warnRemoveNonExistent: (): void => {
      tick("warnRemoveNonExistent");
    },
  },
});

// --- 1. validateDependencyCount·store / validateDependencyExists·store — живой стор ---
{
  const router = createRouter(routes as never, {} as never, { svc } as never);
  const ctx = getInternals(router);
  const deps = getDependenciesApi(router);
  const liveStore = ctx.dependenciesGetStore();
  let seenCountStore: unknown;
  let seenExistsStore: unknown;
  let mode: "observe" | "inject" | "swap" = "observe";
  const discarded: unknown[] = [];
  ctx.validator = stubValidator({
    onCount: (store) => {
      seenCountStore = store;
      const s = store as { dependencies: Bag };
      if (mode === "inject") {
        s.dependencies.injectedByPlugin = svc;
      } else if (mode === "swap") {
        discarded.push(s.dependencies);
        s.dependencies = Object.create(null) as Bag;
      }
    },
    onExists: (_n, store) => {
      seenExistsStore = store;
    },
  }) as never;

  deps.set("a" as never, 1 as never);
  deps.get("a" as never);
  out.validatorStoreHandout_identity = {
    countCalled: calls.validateDependencyCount,
    existsCalled: calls.validateDependencyExists,
    countStoreIsLiveStore: seenCountStore === liveStore,
    existsStoreIsLiveStore: seenExistsStore === liveStore,
    storeFrozen: Object.isFrozen(liveStore),
    storeProto: protoName(liveStore),
    storeDependenciesProto: protoName(liveStore.dependencies),
    storeLimitsIsCloneStateLimits:
      liveStore.limits === ctx.getCloneState().limits,
    storeLimitsFrozen: Object.isFrozen(liveStore.limits),
  };

  mode = "inject";
  deps.set("b" as never, 2 as never);
  out.validatorStoreHandout_pluginWriteThroughHandle = {
    injectedReachesHas: deps.has("injectedByPlugin" as never),
    injectedLeafIdentity: deps.get("injectedByPlugin" as never) === svc,
    bLanded: deps.get("b" as never) === 2,
  };

  mode = "swap";
  const setAttempt = attempt(() => {
    deps.set("x" as never, 1 as never);
  });
  const hasXAfterSwap = deps.has("x" as never);
  const hasAAfterSwap = deps.has("a" as never);
  const xLandedInDiscarded = discarded.some((d) =>
    Object.hasOwn(d as object, "x"),
  );
  const setAllAttempt = attempt(() => {
    deps.setAll({ y: 1, z: 2 } as never);
  });
  out.validatorStoreHandout_slotSwapInsideValidator = {
    set_attempt: setAttempt,
    set_xVisibleAfter: hasXAfterSwap,
    set_aVisibleAfter: hasAAfterSwap,
    set_xLandedInDiscardedObject: xLandedInDiscarded,
    setAll_attempt: setAllAttempt,
    setAll_yVisibleAfter: deps.has("y" as never),
    setAll_zVisibleAfter: deps.has("z" as never),
    setAll_landedInDiscarded: discarded.some(
      (d) =>
        Object.hasOwn(d as object, "y") && Object.hasOwn(d as object, "z"),
    ),
    slotSwapsPerformed: discarded.length,
  };
  ctx.validator = null;
  router.dispose();
}

// --- 2. validateDependenciesObject·deps / validateCloneArgs·dependencies — мешок вызывающего по ссылке; счёт проходов ---
{
  const measure = (withPlugin: boolean): Record<string, unknown> => {
    const router = createRouter(routes as never, {} as never, {
      boot: 1,
    } as never);
    if (withPlugin) {
      router.usePlugin(validationPlugin());
    }
    const deps = getDependenciesApi(router);
    const bagSetAll = trapCounter({ p: svc, q: 2 });
    deps.setAll(bagSetAll.proxy as never);
    const landedSetAll =
      deps.get("p" as never) === svc && deps.get("q" as never) === 2;
    const bagClone = trapCounter({ r: svc, s: 3 });
    const clone = cloneRouter(router, bagClone.proxy as never);
    const landedClone =
      getDependenciesApi(clone).get("r" as never) === svc &&
      getDependenciesApi(clone).get("s" as never) === 3;
    clone.dispose();
    router.dispose();
    return {
      setAll: { landed: landedSetAll, counts: bagSetAll.counts },
      cloneRouter: { landed: landedClone, counts: bagClone.counts },
    };
  };
  out.callerBagWalks = {
    bare: measure(false),
    withValidationPlugin: measure(true),
  };

  // идентичность: объект, попавший в валидатор, — САМ мешок вызывающего (до копии ядра)
  const router = createRouter(routes as never, {} as never);
  const ctx = getInternals(router);
  const deps = getDependenciesApi(router);
  const seenObjects: unknown[] = [];
  let seenClone: unknown;
  let seenSetValue: unknown;
  let seenBatchKeys: string[] | undefined;
  ctx.validator = stubValidator({
    onObject: (d) => {
      seenObjects.push(d);
    },
    onClone: (d) => {
      seenClone = d;
    },
    onSetArgs: (_n, v) => {
      seenSetValue = v;
    },
    onBatch: (keys) => {
      seenBatchKeys = keys;
      keys.push("__injected__");
    },
  }) as never;
  const callerBag = { k: svc };
  deps.setAll(callerBag as never);
  const cloneBag = { c: svc };
  const clone = cloneRouter(router, cloneBag as never);
  clone.dispose();
  const leaf = { v: 1 };
  deps.set("leaf" as never, leaf as never);
  const overwriteBag = { k: 2 };
  deps.setAll(overwriteBag as never); // перезапись k → warnBatchOverwrite(["k"])
  out.validatorParamIdentity = {
    validateDependenciesObject_calls: seenObjects.length,
    validateDependenciesObject_firstIsCallerBag: seenObjects[0] === callerBag,
    validateDependenciesObject_secondIsOverwriteBag:
      seenObjects[1] === overwriteBag,
    validateCloneArgs_isCallerBag: seenClone === cloneBag,
    validateSetDependencyArgs_valueIsLeaf: seenSetValue === leaf,
    warnBatchOverwrite_keys: seenBatchKeys,
    warnBatchOverwrite_keysFrozen: seenBatchKeys
      ? Object.isFrozen(seenBatchKeys)
      : undefined,
    warnBatchOverwrite_pushHasNoEffectOnStore: !deps.has("__injected__" as never),
    storeKeysAfter: Object.keys(deps.getAll()),
    calls: { ...calls },
  };
  ctx.validator = null;
  router.dispose();
}

console.log(JSON.stringify(out, null, 2));
