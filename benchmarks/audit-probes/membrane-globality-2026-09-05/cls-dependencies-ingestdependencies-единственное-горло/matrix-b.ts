// ЧАСТЬ B — P1..P4 по каждой двери семейства, ДРЕЙФУЮЩИМ/ЛГУЩИМ входом.
// P1: ровно одно чтение на ключ И результат от ПЕРВОГО чтения (drifting Proxy).
// P2: лгущий Proxy — ownKeys не называет ключ, gopd утверждает, что он собственный.
// P3: унаследованный аксессор под именем ключа + собственный "__proto__" из JSON.parse.
// P4: вложенный контейнер вызывающего не должен стать frozen.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { createRequestScope } from "@real-router/ssr-utils";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
] as never;

const FIRST = { mark: "FIRST" };
const LATER = { mark: "LATER" };

const store = (r: unknown): Record<string, unknown> =>
  getInternals(r as never).dependenciesGetStore().dependencies as Record<
    string,
    unknown
  >;

const safe = <T>(fn: () => T): T | string => {
  try {
    return fn();
  } catch (error) {
    return `throw:${(error as Error).name}:${(error as Error).message}`;
  }
};

/** Дрейфующий Proxy: 1-е чтение ключа → FIRST, каждое следующее → LATER. */
function driftProxy(keys: readonly string[]): {
  bag: Record<string, unknown>;
  reads: Record<string, number>;
  ownKeysAsked: number;
} {
  const reads: Record<string, number> = {};
  const target: Record<string, unknown> = {};
  for (const k of keys) target[k] = FIRST;
  const meta = { ownKeysAsked: 0 };
  const bag = new Proxy(target, {
    ownKeys(t) {
      meta.ownKeysAsked += 1;
      return Reflect.ownKeys(t);
    },
    get(t, k, r) {
      if (typeof k !== "string") return Reflect.get(t, k, r);
      reads[k] = (reads[k] ?? 0) + 1;
      return reads[k] === 1 ? FIRST : LATER;
    },
  });
  return {
    bag,
    reads,
    get ownKeysAsked() {
      return meta.ownKeysAsked;
    },
  } as never;
}

/** Лгущий Proxy #1854: ownKeys прячет `hidden`, gopd/get утверждают обратное. */
function lyingProxy(
  hidden: string,
  hiddenValue: unknown,
  visible: Record<string, unknown>,
): Record<string, unknown> {
  const target: Record<string, unknown> = { ...visible };
  target[hidden] = hiddenValue;
  return new Proxy(target, {
    ownKeys: (t) => Reflect.ownKeys(t).filter((k) => k !== hidden),
    getOwnPropertyDescriptor(t, k) {
      if (k === hidden) {
        return {
          value: hiddenValue,
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get: (t, k, r) => (k === hidden ? hiddenValue : Reflect.get(t, k, r)),
    has: (t, k) => k === hidden || Reflect.has(t, k),
  });
}

const out: Record<string, unknown> = {};

// ===========================================================================
// ПОЗИТИВНЫЕ КОНТРОЛИ ИНСТРУМЕНТОВ (до любого нуля)
// ===========================================================================
{
  const d = driftProxy(["svc"]);
  const r1 = d.bag["svc"];
  const r2 = d.bag["svc"];
  const l = lyingProxy("hidden", { h: 1 }, { visible: 1 });
  out["CONTROL·instruments"] = {
    drift_firstIsFIRST: r1 === FIRST,
    drift_secondIsLATER: r2 === LATER,
    drift_readsCounted: d.reads["svc"],
    lying_ownKeysHidesIt: !Object.keys(l).includes("hidden"),
    lying_gopdClaimsOwn:
      Object.getOwnPropertyDescriptor(l, "hidden")?.enumerable === true,
    lying_getAnswers: (l["hidden"] as { h: number }).h === 1,
    lying_visibleListed: Object.keys(l).includes("visible"),
  };
}

// ===========================================================================
// P1 — одно чтение на ключ, результат от ПЕРВОГО чтения
// ===========================================================================
{
  const res: Record<string, unknown> = {};

  const d1 = driftProxy(["svc", "k"]);
  const r1 = createRouter(routes, {}, d1.bag as never);
  res["createRouter·dependencies"] = {
    reads: { ...d1.reads },
    ownKeysAsked: d1.ownKeysAsked,
    storedIsFromFirstRead: getDependenciesApi(r1 as never).get("svc" as never) === FIRST,
    landed: Object.keys(store(r1)).sort(),
  };

  const base = createRouter(routes, {}, {} as never);
  const d2 = driftProxy(["svc", "k"]);
  const c = cloneRouter(base as never, d2.bag as never);
  res["cloneRouter·dependencies"] = {
    reads: { ...d2.reads },
    ownKeysAsked: d2.ownKeysAsked,
    storedIsFromFirstRead: getDependenciesApi(c as never).get("svc" as never) === FIRST,
    landed: Object.keys(store(c)).sort(),
  };

  const r3 = createRouter(routes, {}, {} as never);
  const d3 = driftProxy(["svc", "k"]);
  getDependenciesApi(r3 as never).setAll(d3.bag as never);
  res["setAll·deps"] = {
    reads: { ...d3.reads },
    ownKeysAsked: d3.ownKeysAsked,
    storedIsFromFirstRead: getDependenciesApi(r3 as never).get("svc" as never) === FIRST,
    landed: Object.keys(store(r3)).sort(),
  };

  // set·value: контейнера нет. Дрейфовать может ИМЯ (объект с toString).
  const r4 = createRouter(routes, {}, {} as never);
  let nameReads = 0;
  const driftingName = {
    toString() {
      nameReads += 1;
      return nameReads === 1 ? "first" : "later";
    },
  };
  getDependenciesApi(r4 as never).set(driftingName as never, FIRST as never);
  res["set·value"] = {
    nameCoercions: nameReads,
    landedKeys: Object.keys(store(r4)).sort(),
    coreReadsInsideTheValue: "n/a — значение не перечисляется ядром",
  };

  const base5 = createRouter(routes, {}, {} as never);
  const req = { signal: new AbortController().signal };
  const d5 = driftProxy(["svc", "k"]);
  const s5 = createRequestScope(req as never, base5 as never, d5.bag as never);
  res["createRequestScope·deps"] = {
    reads: { ...d5.reads },
    ownKeysAsked: d5.ownKeysAsked,
    storedIsFromFirstRead:
      getDependenciesApi(s5.router as never).get("svc" as never) === FIRST,
    landed: Object.keys(store(s5.router)).sort(),
  };

  const base6 = createRouter(routes, {}, {} as never);
  const d6 = driftProxy(["svc", "k"]);
  const factoryReturn = d6.bag;
  const c6 = cloneRouter(base6 as never, factoryReturn as never);
  res["RequestDepsFactory·return"] = {
    reads: { ...d6.reads },
    ownKeysAsked: d6.ownKeysAsked,
    storedIsFromFirstRead: getDependenciesApi(c6 as never).get("svc" as never) === FIRST,
    landed: Object.keys(store(c6)).sort(),
  };

  out["P1"] = res;
}

// ===========================================================================
// P2 — лгущий Proxy: скрытый от ownKeys ключ НЕ должен попасть в состояние
// ===========================================================================
{
  const res: Record<string, unknown> = {};
  const HID = { mark: "HIDDEN" };

  const mk = (): Record<string, unknown> =>
    lyingProxy("hidden", HID, { visible: FIRST });

  const r1 = createRouter(routes, {}, mk() as never);
  res["createRouter·dependencies"] = {
    hiddenLanded: Object.hasOwn(store(r1), "hidden"),
    hiddenViaHas: getDependenciesApi(r1 as never).has("hidden" as never),
    posControl_visibleLanded: Object.hasOwn(store(r1), "visible"),
  };

  const base = createRouter(routes, {}, {} as never);
  const c = cloneRouter(base as never, mk() as never);
  res["cloneRouter·dependencies"] = {
    hiddenLanded: Object.hasOwn(store(c), "hidden"),
    posControl_visibleLanded: Object.hasOwn(store(c), "visible"),
  };

  const r3 = createRouter(routes, {}, {} as never);
  getDependenciesApi(r3 as never).setAll(mk() as never);
  res["setAll·deps"] = {
    hiddenLanded: Object.hasOwn(store(r3), "hidden"),
    posControl_visibleLanded: Object.hasOwn(store(r3), "visible"),
  };

  const base5 = createRouter(routes, {}, {} as never);
  const req = { signal: new AbortController().signal };
  const s5 = createRequestScope(req as never, base5 as never, mk() as never);
  res["createRequestScope·deps"] = {
    hiddenLanded: Object.hasOwn(store(s5.router), "hidden"),
    posControl_visibleLanded: Object.hasOwn(store(s5.router), "visible"),
  };

  const base6 = createRouter(routes, {}, {} as never);
  const c6 = cloneRouter(base6 as never, mk() as never);
  res["RequestDepsFactory·return"] = {
    hiddenLanded: Object.hasOwn(store(c6), "hidden"),
    posControl_visibleLanded: Object.hasOwn(store(c6), "visible"),
  };

  res["set·value"] = "неприменимо: контейнера нет, перечислять нечего";
  out["P2"] = res;
}

// ===========================================================================
// P3a — унаследованный аксессор под именем ключа
// ===========================================================================
{
  const res: Record<string, unknown> = {};
  const NAME = "danger";
  const bags = {
    ctor: { danger: FIRST },
    clone: { danger: FIRST },
    setAll: { danger: FIRST },
    scope: { danger: FIRST },
  };
  const base = createRouter(routes, {}, {} as never);
  const rEmpty = createRouter(routes, {}, {} as never);
  const req = { signal: new AbortController().signal };
  let setterHits = 0;
  let getterHits = 0;

  try {
    Object.defineProperty(Object.prototype, NAME, {
      configurable: true,
      get() {
        getterHits += 1;
        return "INHERITED";
      },
      set() {
        setterHits += 1;
      },
    });

    // позитивный контроль: аксессор ЖИВ — обычный [[Set]] в литерал попадает в него
    const victim: Record<string, unknown> = {};
    victim[NAME] = "x";
    const posControl_setterFiresOnPlainAssign = setterHits === 1;
    const posControl_notOwnAfterAssign = !Object.hasOwn(victim, NAME);
    setterHits = 0;

    const r1 = safe(() => createRouter(routes, {}, bags.ctor as never));
    const c = safe(() => cloneRouter(base as never, bags.clone as never));
    const r3 = createRouter(routes, {}, {} as never);
    const s3 = safe(() =>
      getDependenciesApi(r3 as never).setAll(bags.setAll as never),
    );
    const s5 = safe(() =>
      createRequestScope(req as never, rEmpty as never, bags.scope as never),
    );

    res["posControl_setterFiresOnPlainAssign"] = posControl_setterFiresOnPlainAssign;
    res["posControl_notOwnAfterAssign"] = posControl_notOwnAfterAssign;
    res["setterHitsDuringDoors"] = setterHits;
    res["getterHitsDuringDoors"] = getterHits;
    res["createRouter·dependencies"] = {
      threw: typeof r1 === "string" ? r1 : false,
      ownOnStore: typeof r1 === "string" ? null : Object.hasOwn(store(r1), NAME),
      valueIsCallers:
        typeof r1 === "string" ? null : store(r1)[NAME] === FIRST,
    };
    res["cloneRouter·dependencies"] = {
      threw: typeof c === "string" ? c : false,
      ownOnStore: typeof c === "string" ? null : Object.hasOwn(store(c), NAME),
      valueIsCallers: typeof c === "string" ? null : store(c)[NAME] === FIRST,
    };
    res["setAll·deps"] = {
      threw: typeof s3 === "string" ? s3 : false,
      ownOnStore: Object.hasOwn(store(r3), NAME),
      valueIsCallers: store(r3)[NAME] === FIRST,
    };
    res["createRequestScope·deps"] = {
      threw: typeof s5 === "string" ? s5 : false,
      ownOnStore:
        typeof s5 === "string"
          ? null
          : Object.hasOwn(store((s5 as { router: unknown }).router), NAME),
    };
    // set·value: имя ключа = унаследованный аксессор
    const r6 = createRouter(routes, {}, {} as never);
    getDependenciesApi(r6 as never).set(NAME as never, FIRST as never);
    res["set·value"] = {
      ownOnStore: Object.hasOwn(store(r6), NAME),
      valueIsCallers: store(r6)[NAME] === FIRST,
      setterHitsTotalAfterAll: setterHits,
    };
  } finally {
    delete (Object.prototype as Record<string, unknown>)[NAME];
  }
  out["P3a_inheritedAccessor"] = res;
}

// ===========================================================================
// P3b — собственный "__proto__" из JSON.parse
// ===========================================================================
{
  const res: Record<string, unknown> = {};
  const mk = (): Record<string, unknown> =>
    JSON.parse('{"__proto__":{"pwned":"YES"},"ok":1}') as Record<
      string,
      unknown
    >;
  const posControl_ownProtoKey = Object.hasOwn(mk(), "__proto__");

  const r1 = createRouter(routes, {}, mk() as never);
  const base = createRouter(routes, {}, {} as never);
  const c = cloneRouter(base as never, mk() as never);
  const r3 = createRouter(routes, {}, {} as never);
  getDependenciesApi(r3 as never).setAll(mk() as never);
  const req = { signal: new AbortController().signal };
  const base5 = createRouter(routes, {}, {} as never);
  const s5 = createRequestScope(req as never, base5 as never, mk() as never);
  const r6 = createRouter(routes, {}, {} as never);
  getDependenciesApi(r6 as never).set(
    "__proto__" as never,
    { pwned: "YES" } as never,
  );

  const cell = (r: unknown): Record<string, unknown> => ({
    storeProtoStillNull: Object.getPrototypeOf(store(r)) === null,
    ownProtoKeyOnStore: Object.hasOwn(store(r), "__proto__"),
    getAllWithholdsIt: !Object.hasOwn(
      getDependenciesApi(r as never).getAll() as object,
      "__proto__",
    ),
  });

  res["posControl_jsonParseGivesOwnProtoKey"] = posControl_ownProtoKey;
  res["globalObjectPrototypeUnpolluted"] =
    (({} as Record<string, unknown>)["pwned"] as unknown) === undefined;
  res["createRouter·dependencies"] = cell(r1);
  res["cloneRouter·dependencies"] = cell(c);
  res["setAll·deps"] = cell(r3);
  res["createRequestScope·deps"] = cell(s5.router);
  res["set·value"] = cell(r6);
  out["P3b_ownProtoKey"] = res;
}

// ===========================================================================
// P4 — заморозка: вложенный контейнер вызывающего и уровень, порождённый ядром
// ===========================================================================
{
  const res: Record<string, unknown> = {};
  const nested = { deep: { x: 1 } };
  const mk = (): Record<string, unknown> => ({ cfg: nested, k: 1 });

  const r1 = createRouter(routes, {}, mk() as never);
  const base = createRouter(routes, {}, {} as never);
  const c = cloneRouter(base as never, mk() as never);
  const r3 = createRouter(routes, {}, {} as never);
  getDependenciesApi(r3 as never).setAll(mk() as never);
  const req = { signal: new AbortController().signal };
  const base5 = createRouter(routes, {}, {} as never);
  const s5 = createRequestScope(req as never, base5 as never, mk() as never);
  const r6 = createRouter(routes, {}, {} as never);
  getDependenciesApi(r6 as never).set("cfg" as never, nested as never);

  const cell = (r: unknown): Record<string, unknown> => ({
    callerNestedFrozen: Object.isFrozen(nested),
    callerNestedDeepFrozen: Object.isFrozen(nested.deep),
    coreBornStoreFrozen: Object.isFrozen(store(r)),
    coreBornGetAllFrozen: Object.isFrozen(
      getDependenciesApi(r as never).getAll(),
    ),
    storeStillMutable: (() => {
      const before = Object.keys(store(r)).length;
      getDependenciesApi(r as never).set("probe" as never, 1 as never);
      return Object.keys(store(r)).length === before + 1;
    })(),
  });

  res["createRouter·dependencies"] = cell(r1);
  res["cloneRouter·dependencies"] = cell(c);
  res["setAll·deps"] = cell(r3);
  res["createRequestScope·deps"] = cell(s5.router);
  res["set·value"] = cell(r6);
  out["P4"] = res;
}

console.log(JSON.stringify(out, null, 1));
