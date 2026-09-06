// Семейство «dependencies·store-наружу + валидаторные-проходы».
// Колонки P1..P4 + следствие подмены слота limits через хэндаут (D2).
// Строки: D5/D6 — мешок ВЫЗЫВАЮЩЕГО (validateDependenciesObject·deps,
// validateCloneArgs·dependencies); D1/D2/D3/D4 — контейнер ЯДРА.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

const routes = [{ name: "a", path: "/a" }] as never;
const out: Record<string, unknown> = {};
const dump = (k: string, v: unknown): void => {
  out[k] = v;
};
const err = (fn: () => unknown): string => {
  try {
    fn();
    return "NO-THROW";
  } catch (e) {
    return `${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
};
type Store = { dependencies: Record<string, unknown>; limits: unknown };
const ints = (r: unknown) =>
  getInternals(r as never) as unknown as {
    dependenciesGetStore: () => Store;
    getCloneState: () => { limits: unknown; dependencies: unknown };
    validator: unknown;
  };
const api = (r: unknown) =>
  getDependenciesApi(r as never) as unknown as {
    get: (n: string) => unknown;
    getAll: () => Record<string, unknown>;
    set: (n: string, v: unknown) => void;
    setAll: (d: unknown) => void;
    has: (n: string) => boolean;
    reset: () => void;
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

/** Полный счётчик ловушек по чужому контейнеру — все трапы, не только get. */
function trapCounter<T extends object>(
  source: T,
  valueFor?: (key: string, nth: number) => unknown,
) {
  const c: Record<string, number> = {};
  const bump = (k: string): number => {
    c[k] = (c[k] ?? 0) + 1;
    return c[k];
  };
  const bag = new Proxy(source as Record<string, unknown>, {
    get(t, k, rec): unknown {
      if (typeof k !== "string") return Reflect.get(t, k, rec);
      const n = bump(`get:${k}`);
      return valueFor ? valueFor(k, n) : Reflect.get(t, k, rec);
    },
    ownKeys(t) {
      bump("ownKeys");
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      bump(`gopd:${String(k)}`);
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    getPrototypeOf(t) {
      bump("getPrototypeOf");
      return Reflect.getPrototypeOf(t);
    },
    has(t, k) {
      bump(`has:${String(k)}`);
      return Reflect.has(t, k);
    },
  });
  return { bag: bag as T, counts: c };
}

// ================================================= ШАПКА: позитивные контроли
{
  const rb = bare({ svc: 1 });
  const rp = withPlugin({ svc: 1 });
  dump("H_positiveControls", {
    bare_ctor_landed: api(rb).get("svc") === 1,
    plugin_installed: ints(rp).validator != null,
    plugin_ctor_landed: api(rp).get("svc") === 1,
    plugin_setAll_landed: (() => {
      api(rp).setAll({ q: 2 });
      return api(rp).get("q") === 2;
    })(),
    clone_landed: (() => {
      const c = cloneRouter(rp as never, { z: 3 } as never);
      return api(c).get("z") === 3;
    })(),
  });
}

// =========== E: D2 — подмена слота limits через хэндаут: следствие для читателей
{
  const r = withPlugin();
  const ds = ints(r).dependenciesGetStore();
  const coreLimitsBefore = ints(r).getCloneState().limits;
  const a = api(r);
  const beforeSwap = err(() => {
    a.set("k1", 1);
  });
  (ds as unknown as Record<string, unknown>)["limits"] = { maxDependencies: 1 };
  const afterSwap = err(() => {
    a.set("k2", 2);
  });
  dump("E_limitsSlotSwapConsequence", {
    control_setBeforeSwap: beforeSwap,
    control_k1Landed: a.has("k1"),
    afterSwap_setThrowsOnPluginCap: afterSwap,
    afterSwap_k2Landed: a.has("k2"),
    coreLimitsUnchanged: ints(r).getCloneState().limits === coreLimitsBefore,
    coreMaxDependencies: (coreLimitsBefore as { maxDependencies: number })
      .maxDependencies,
    storeContainerFrozen: Object.isFrozen(ds),
    limitsObjectFrozen: Object.isFrozen(coreLimitsBefore),
  });
}

// ============================================ P1: один проход/чтение на ключ
{
  const mk = () => ({ p: { svc: "P" }, q: { svc: "Q" } });
  const run = (
    mode: "bare" | "plugin",
    door: "setAll" | "clone",
    drift: boolean,
  ) => {
    const r = mode === "bare" ? bare() : withPlugin();
    const t = trapCounter(
      mk(),
      drift
        ? (k, n) => (n === 1 ? { svc: `${k}-FIRST` } : { svc: `${k}-DRIFTED` })
        : undefined,
    );
    let thrown = "NO-THROW";
    let landedP: unknown;
    if (door === "setAll") {
      thrown = err(() => {
        api(r).setAll(t.bag);
      });
      landedP = api(r).get("p");
    } else {
      let c: unknown;
      thrown = err(() => {
        c = cloneRouter(r as never, t.bag as never);
      });
      landedP = c ? api(c).get("p") : undefined;
    }
    return {
      counts: t.counts,
      thrown,
      landedP: (landedP as { svc?: string } | undefined)?.svc,
    };
  };
  dump("P1_readCounts", {
    bare_setAll: run("bare", "setAll", false),
    plugin_setAll: run("plugin", "setAll", false),
    bare_clone: run("bare", "clone", false),
    plugin_clone: run("plugin", "clone", false),
    bare_setAll_DRIFTING: run("bare", "setAll", true),
    plugin_setAll_DRIFTING: run("plugin", "setAll", true),
    bare_clone_DRIFTING: run("bare", "clone", true),
    plugin_clone_DRIFTING: run("plugin", "clone", true),
  });
}

// ======== P2: лгущий Proxy — ownKeys молчит о ключе, gopd называет его своим
{
  const lying = (): Record<string, unknown> => {
    const target = { visible: 1 } as Record<string, unknown>;
    return new Proxy(target, {
      ownKeys: () => ["visible"], // "hidden" НЕ назван
      getOwnPropertyDescriptor: (t, k) =>
        k === "hidden"
          ? { value: 99, enumerable: true, configurable: true, writable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
      get: (t, k, rec) => (k === "hidden" ? 99 : Reflect.get(t, k, rec)),
      has: (t, k) => k === "hidden" || Reflect.has(t, k),
    });
  };
  const check = (mode: "bare" | "plugin", door: "setAll" | "clone") => {
    const r = mode === "bare" ? bare() : withPlugin();
    if (door === "setAll") {
      const thrown = err(() => {
        api(r).setAll(lying());
      });
      return {
        thrown,
        visibleLanded: api(r).has("visible"),
        hiddenLanded: api(r).has("hidden"),
        getAllKeys: Object.keys(api(r).getAll()),
      };
    }
    let c: unknown;
    const thrown = err(() => {
      c = cloneRouter(r as never, lying() as never);
    });
    return {
      thrown,
      visibleLanded: c ? api(c).has("visible") : null,
      hiddenLanded: c ? api(c).has("hidden") : null,
      getAllKeys: c ? Object.keys(api(c).getAll()) : null,
    };
  };
  dump("P2_lyingProxy", {
    bare_setAll: check("bare", "setAll"),
    plugin_setAll: check("plugin", "setAll"),
    bare_clone: check("bare", "clone"),
    plugin_clone: check("plugin", "clone"),
  });
}

// ==== P3: унаследованный аксессор под именем ключа + собственный "__proto__"
{
  const NAME = "poisonKey";
  const inherited = (mode: "bare" | "plugin", door: "setAll" | "clone") => {
    let setterHits = 0;
    let getterHits = 0;
    Object.defineProperty(Object.prototype, NAME, {
      configurable: true,
      get() {
        getterHits += 1;
        return "FROM-PROTO";
      },
      set() {
        setterHits += 1;
      },
    });
    try {
      const r = mode === "bare" ? bare() : withPlugin();
      const bag = { [NAME]: "OWN" } as Record<string, unknown>;
      if (door === "setAll") {
        const thrown = err(() => {
          api(r).setAll(bag);
        });
        return {
          thrown,
          setterHits,
          getterHits,
          stored: api(r).get(NAME),
          hasOwnOnStore: api(r).has(NAME),
        };
      }
      let c: unknown;
      const thrown = err(() => {
        c = cloneRouter(r as never, bag as never);
      });
      return {
        thrown,
        setterHits,
        getterHits,
        stored: c ? api(c).get(NAME) : null,
        hasOwnOnStore: c ? api(c).has(NAME) : null,
      };
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>)[NAME];
    }
  };
  const protoKey = (mode: "bare" | "plugin", door: "setAll" | "clone") => {
    const r = mode === "bare" ? bare() : withPlugin();
    const bag = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as Record<
      string,
      unknown
    >;
    const ownProtoKey = Object.hasOwn(bag, "__proto__");
    if (door === "setAll") {
      const thrown = err(() => {
        api(r).setAll(bag);
      });
      return {
        bagHasOwnProtoKey: ownProtoKey,
        thrown,
        okLanded: api(r).get("ok"),
        storeProtoStillNull:
          Object.getPrototypeOf(ints(r).dependenciesGetStore().dependencies) ===
          null,
        globalPolluted:
          ({} as Record<string, unknown>)["polluted"] !== undefined,
        getAllHasProtoKey: Object.hasOwn(api(r).getAll(), "__proto__"),
      };
    }
    let c: unknown;
    const thrown = err(() => {
      c = cloneRouter(r as never, bag as never);
    });
    return {
      bagHasOwnProtoKey: ownProtoKey,
      thrown,
      okLanded: c ? api(c).get("ok") : null,
      storeProtoStillNull: c
        ? Object.getPrototypeOf(ints(c).dependenciesGetStore().dependencies) ===
          null
        : null,
      globalPolluted: ({} as Record<string, unknown>)["polluted"] !== undefined,
      getAllHasProtoKey: c ? Object.hasOwn(api(c).getAll(), "__proto__") : null,
    };
  };
  dump("P3_inheritedAccessorAndProtoKey", {
    inherited_bare_setAll: inherited("bare", "setAll"),
    inherited_plugin_setAll: inherited("plugin", "setAll"),
    inherited_bare_clone: inherited("bare", "clone"),
    protoKey_bare_setAll: protoKey("bare", "setAll"),
    protoKey_plugin_setAll: protoKey("plugin", "setAll"),
    protoKey_bare_clone: protoKey("bare", "clone"),
  });
}

// ==== P4: заморожен уровень ядра и не глубже
{
  const leaf = { deep: { n: 1 } };
  const r = withPlugin();
  const bag = { svc: leaf } as Record<string, unknown>;
  api(r).setAll(bag);
  const ds = ints(r).dependenciesGetStore();
  const cloneR = cloneRouter(r as never, { extra: leaf } as never);
  dump("P4_freezeLevels", {
    callerBagFrozen: Object.isFrozen(bag),
    callerLeafFrozen: Object.isFrozen(leaf),
    callerLeafDeepFrozen: Object.isFrozen(leaf.deep),
    coreStoreContainerFrozen: Object.isFrozen(ds),
    coreDependenciesTableFrozen: Object.isFrozen(ds.dependencies),
    coreLimitsFrozen: Object.isFrozen(ds.limits),
    getAllResultFrozen: Object.isFrozen(api(r).getAll()),
    cloneStateDepsFrozen: Object.isFrozen(ints(r).getCloneState().dependencies),
    leafIdentityPreserved: api(r).get("svc") === leaf,
    cloneLeafIdentityPreserved: api(cloneR).get("extra") === leaf,
  });
}

console.log(JSON.stringify(out, null, 1));
