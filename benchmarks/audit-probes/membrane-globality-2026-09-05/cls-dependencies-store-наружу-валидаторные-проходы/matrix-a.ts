// Классификация семейства «dependencies·store-наружу + валидаторные-проходы».
// Матрица: строки — 6 дверей, столбцы — эксперимент (а), P1, P2, P3, P4.
// Общая шапка: позитивные контроли + доказательство достижения ветки.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";
import {
  validateDependencyCount as realCount,
  validateDependencyExists as realExists,
} from "../../../../packages/validation-plugin/src/validators/dependencies";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
] as never;

const SVC = { mark: "SVC" };
const out: Record<string, unknown> = {};
const dump = (k: string, v: unknown): void => {
  out[k] = v;
};

type Store = { dependencies: Record<string, unknown>; limits: unknown };
const ints = (r: unknown) =>
  getInternals(r as never) as unknown as {
    dependenciesGetStore: () => Store;
    getCloneState: () => { limits: unknown };
    validator: unknown;
  };
const api = (r: unknown) =>
  getDependenciesApi(r as never) as unknown as {
    get: (n: string) => unknown;
    getAll: () => Record<string, unknown>;
    set: (n: string, v: unknown) => void;
    setAll: (d: unknown) => void;
    remove: (n: string) => void;
    reset: () => void;
    has: (n: string) => boolean;
  };
const bare = (deps?: unknown) =>
  createRouter(routes, {} as never, (deps ?? {}) as never);
const withPlugin = (deps?: unknown) => {
  const r = bare(deps);
  (r as unknown as { usePlugin: (p: unknown) => void }).usePlugin(
    validationPlugin() as never,
  );
  return r;
};
const err = (fn: () => unknown): string => {
  try {
    fn();
    return "NO-THROW";
  } catch (e) {
    return `${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
};

// ============================================================ ШАПКА: контроли
{
  const r = withPlugin({ svc: SVC });
  const a = api(r);
  a.set("legal", 1);
  a.setAll({ bulk: 2 });
  const legalGot = a.get("legal");
  const bulkGot = a.get("bulk");
  a.remove("legal");
  dump("H0_positiveControls", {
    pluginInstalled:
      ints(r).validator !== null && ints(r).validator !== undefined,
    legalGet: a.get("svc") === SVC,
    legalSetThenGet: legalGot === 1,
    legalSetAllThenGet: bulkGot === 2,
    legalRemove: a.has("legal") === false,
    bareRouterWorks: api(bare({ svc: SVC })).get("svc") === SVC,
  });
}

// =================================================== A: идентичность / round-trip
{
  const r = withPlugin({ svc: SVC });
  const ds = ints(r).dependenciesGetStore();
  const ds2 = ints(r).dependenciesGetStore();
  ds.dependencies["viaHandout"] = 42;
  const readBack = api(r).getAll()["viaHandout"];
  api(r).set("legalAfter", 7);
  const controlVisible = ds.dependencies["legalAfter"] === 7;

  dump("A_storeIdentityRoundTrip", {
    depsStoreSameRef: ds === ds2,
    depsStoreFrozen: Object.isFrozen(ds),
    depsLeafProto:
      Object.getPrototypeOf(ds.dependencies) === null ? "null" : "Object",
    writeThroughHandout_readBackByCore: readBack === 42,
    control_legalSetVisibleThroughSameHandle: controlVisible,
  });
}

// D2: limits — вложенное поле того же контейнера
{
  const r = bare();
  const ds = ints(r).dependenciesGetStore();
  const cloneLimits = ints(r).getCloneState().limits;
  const before = ds.limits;
  const replaceAttempt = err(() => {
    (ds as unknown as Record<string, unknown>)["limits"] = {
      maxDependencies: 1,
    };
  });
  dump("A_limitsSlot", {
    limitsSameAsCloneState: before === cloneLimits,
    limitsFrozen: Object.isFrozen(before),
    storeContainerFrozen: Object.isFrozen(ds),
    replaceAttempt,
    slotNowReplacement: ds.limits !== before,
    cloneStateStillOriginal: ints(r).getCloneState().limits === cloneLimits,
  });
}

// ============ B: эксперимент (а) на D1 — копия контейнера на выдаче хэндаута
// Эмуляция: подменяем ctx.dependenciesGetStore на возврат МЕЛКОЙ КОПИИ
// { dependencies: <тот же лист>, limits: <тот же> }. Листья — по ссылке.
{
  const control = bare({ svc: SVC });
  const ca = api(control);
  ca.set("k", 1);
  ca.reset();
  const controlAfterReset = Object.keys(ca.getAll());

  const r = bare({ svc: SVC });
  const real = ints(r).dependenciesGetStore();
  const holder = ints(r) as unknown as Record<string, unknown>;
  const overrideInstalled = err(() => {
    holder["dependenciesGetStore"] = (): Store => ({
      dependencies: real.dependencies,
      limits: real.limits,
    });
  });
  const a = api(r);
  a.set("k", 1);
  const setStillWorks = a.get("k") === 1;
  a.reset();
  const afterResetKeys = Object.keys(a.getAll());
  const realLeafKeys = Object.keys(real.dependencies);

  dump("B_copyAtHandoutBoundary_D1", {
    overrideInstalled,
    handoutIsCopy: ints(r).dependenciesGetStore() !== real,
    control_resetEmptiesStore: controlAfterReset,
    withCopy_setStillWorks: setStillWorks,
    withCopy_afterReset_getAllKeys: afterResetKeys,
    withCopy_realStoreLeafKeys: realLeafKeys,
    BREAK_resetLost: afterResetKeys.length > 0,
  });
}

// ==== C: эксперимент (а) на D3/D4 — валидатору вручается КОПИЯ вместо живого стора
{
  const mkLogger = () => ({
    warn: () => undefined,
    error: () => undefined,
    info: () => undefined,
    debug: () => undefined,
  });
  const run = (mode: "live" | "copy", swap: boolean) => {
    const r = bare();
    const seen: string[] = [];
    const v = {
      dependencies: {
        validateDependencyName: () => undefined,
        validateSetDependencyArgs: () => undefined,
        validateDependenciesObject: () => undefined,
        validateCloneArgs: () => undefined,
        warnOverwrite: () => undefined,
        warnBatchOverwrite: () => undefined,
        warnRemoveNonExistent: () => undefined,
        validateDependencyCount: (store: unknown, m: string) => {
          seen.push(`count:${m}`);
          const handed =
            mode === "live"
              ? (store as Store)
              : {
                  dependencies: (store as Store).dependencies,
                  limits: (store as Store).limits,
                };
          if (swap) {
            (handed as Store).dependencies = Object.create(null) as Record<
              string,
              unknown
            >;
          }
          realCount(handed, m, mkLogger() as never);
        },
        validateDependencyExists: (name: string, store: unknown) => {
          seen.push(`exists:${name}`);
          const handed =
            mode === "live"
              ? (store as Store)
              : {
                  dependencies: (store as Store).dependencies,
                  limits: (store as Store).limits,
                };
          realExists((handed as Store).dependencies[name], name);
        },
      },
    };
    (ints(r) as unknown as Record<string, unknown>)["validator"] = v;
    const a = api(r);
    const setResult = err(() => {
      a.set("a", 1);
    });
    const aVisible = a.has("a");
    const setAllResult = err(() => {
      a.setAll({ b: 2, c: 3 });
    });
    const bVisible = a.has("b");
    const missing = err(() => a.get("nope"));
    const present = err(() => a.get("a"));
    return {
      seen,
      setResult,
      aVisible,
      setAllResult,
      bVisible,
      getMissingThrows: missing,
      getPresent: present,
    };
  };
  dump("C_validatorBoundaryCopy_D3_D4", {
    live_noSwap: run("live", false),
    copy_noSwap: run("copy", false),
    live_withSwap: run("live", true),
    copy_withSwap: run("copy", true),
  });
}

// ===== D: эксперимент (а) на D5/D6 — мешок ВЫЗЫВАЮЩЕГО против его копии
{
  class Svc {
    public x = 1;
  }
  const getterBag = (): Record<string, unknown> => {
    let ran = 0;
    const bag = {} as Record<string, unknown>;
    Object.defineProperty(bag, "lazy", {
      enumerable: true,
      configurable: true,
      get: () => {
        ran += 1;
        return { ran };
      },
    });
    return bag;
  };

  const r1 = withPlugin();
  const r2 = withPlugin();
  const r3 = withPlugin();
  const r4 = withPlugin();
  const base = withPlugin();

  const g1 = getterBag();
  const g2 = getterBag();
  const g3 = getterBag();

  dump("D_callerBagVsCopy_D5_D6", {
    control_legalSetAll: err(() => {
      api(r1).setAll({ ok: 1 });
    }),
    control_legalSetAll_landed: api(r1).get("ok") === 1,
    D5_original_getterBag: err(() => {
      api(r2).setAll(g1);
    }),
    D5_preCopiedContainer: err(() => {
      api(r3).setAll({ ...g2 });
    }),
    D5_preCopied_landed: api(r3).has("lazy"),
    D5_original_classInstance: err(() => {
      api(r4).setAll(new Svc());
    }),
    D5_preCopied_classInstance: err(() => {
      api(r4).setAll({ ...new Svc() });
    }),
    D5_preCopiedClass_landed: api(r4).get("x") === 1,
    control_clone_legal: err(() => cloneRouter(base as never, { ok: 1 } as never)),
    D6_original_getterBag: err(() =>
      cloneRouter(base as never, g3 as never),
    ),
    D6_preCopiedContainer: err(() =>
      cloneRouter(base as never, { ...getterBag() } as never),
    ),
  });
}

console.log(JSON.stringify(out, null, 1));
