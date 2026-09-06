// ДОПОЛНЕНИЕ к matrix.ts, секция B (cloneRouter·opts).
// В matrix.ts позитивный контроль СЕКЦИИ B ПРОВАЛИЛСЯ: триггер `warn()`
// (addActivateGuard + canNavigateTo) не эмитит ни одной записи в логгер —
// `posControl_seenAny: false`, значит вход НЕ ДОШЁЛ до ветки, где значение
// opts.logger наблюдаемо. Здесь триггер заменён на реальный сайт лога:
// getRoutesApi(router).remove("nope") → ctx.logger.warn (getRoutesApi.ts ·
// api.remove, "Route ... not found. No changes made.").
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type Counts = Record<string, number>;
const ROUTES = [{ name: "u", path: "/u/:id" }];
const out: Record<string, unknown> = {};

function trap<T extends object>(source: T): { bag: T; counts: Counts } {
  const counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const bag = new Proxy(source as Record<string, unknown>, {
    ownKeys: (t) => (bump("ownKeys"), Reflect.ownKeys(t)),
    getOwnPropertyDescriptor: (t, k) => (
      bump(`gopd:${String(k)}`), Reflect.getOwnPropertyDescriptor(t, k)
    ),
    get: (t, k, r) => (bump(`get:${String(k)}`), Reflect.get(t, k, r)),
    has: (t, k) => (bump(`has:${String(k)}`), Reflect.has(t, k)),
    getPrototypeOf: (t) => (bump("proto"), Reflect.getPrototypeOf(t)),
  });
  return { bag: bag as T, counts };
}

function lyingProxy<T extends object>(
  source: T,
  hidden: string,
): { bag: T; counts: Counts } {
  const counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const bag = new Proxy(source as Record<string, unknown>, {
    ownKeys: (t) => (
      bump("ownKeys"), Reflect.ownKeys(t).filter((k) => k !== hidden)
    ),
    getOwnPropertyDescriptor: (t, k) => {
      bump(`gopd:${String(k)}`);
      return k === hidden
        ? {
            value: (t as Record<string, unknown>)[hidden],
            writable: true,
            enumerable: true,
            configurable: true,
          }
        : Reflect.getOwnPropertyDescriptor(t, k);
    },
    get: (t, k, r) => (bump(`get:${String(k)}`), Reflect.get(t, k, r)),
    has: (t, k) => (bump(`has:${String(k)}`), Reflect.has(t, k)),
  });
  return { bag: bag as T, counts };
}

const mkBase = (): any => createRouter(ROUTES as never, {} as never);
/** РЕАЛЬНЫЙ триггер логгера: remove несуществующего маршрута → logger.warn. */
const fire = (r: unknown): void => {
  getRoutesApi(r as never).remove("nope");
};

// --- ШАПКА: позитивный контроль ТРИГГЕРА на базовом роутере ----------------
{
  const seen: string[] = [];
  // createRouter.ts · createRouter — порядок (routes, options, dependencies);
  // logger живёт в ОПЦИЯХ, т.е. во ВТОРОМ слоте.
  const b = createRouter(ROUTES as never, {
    logger: {
      level: "all",
      callback: (l: string, c: string) => seen.push(`${l}:${c}`),
    },
  } as never);
  fire(b);
  out.HEADER = { triggerFiresOnBaseRouter: seen.length > 0, seen };
  b.dispose();
}

// --- (а): оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО контейнера ---------
{
  const seenA: string[] = [];
  const leaf = { level: "all", callback: (l: string) => seenA.push(l) };
  const optsOrig = { logger: leaf };
  const optsCopy = { ...optsOrig }; // копия КОНТЕЙНЕРА, лист — та же ссылка

  const b1 = mkBase();
  const b2 = mkBase();
  const c1 = cloneRouter(b1, undefined, optsOrig as never);
  const c2 = cloneRouter(b2, undefined, optsCopy as never);

  fire(c1);
  const afterOrig = seenA.length;
  fire(c2);
  const afterCopy = seenA.length - afterOrig;

  // ОБРАТНАЯ ВИДИМОСТЬ: мутируем оригинальный контейнер ПОСЛЕ клонирования
  const seenAfter: string[] = [];
  (optsOrig as Record<string, unknown>).logger = {
    level: "all",
    callback: (l: string) => seenAfter.push(l),
  };
  fire(c1);

  out.exp_a = {
    origArmLogged: afterOrig,
    copyArmLogged: afterCopy,
    equalObservable: afterOrig === afterCopy && afterOrig > 0,
    afterMutationLeaked_mustBeFalse: seenAfter.length > 0,
    handout_getOptionsLoggerIsCallerLeaf:
      (getPluginApi(c1).getOptions() as unknown as { logger: unknown })
        .logger === (leaf as unknown),
    handout_getOptionsLoggerIsCallerContainer:
      (getPluginApi(c1).getOptions() as unknown as { logger: unknown })
        .logger === (optsOrig as unknown),
    buildPathsEqual:
      c1.buildPath("u", { id: "1" }) === c2.buildPath("u", { id: "1" }),
    callerOptsFrozen_mustBeFalse: Object.isFrozen(optsOrig),
    callerLeafFrozen_mustBeFalse: Object.isFrozen(leaf),
  };

  c1.dispose();
  c2.dispose();
  b1.dispose();
  b2.dispose();
}

// --- P1: счёт + ДРЕЙФУЮЩИЙ мешок; результат обязан быть от ПЕРВОГО чтения --
{
  const seen: string[] = [];
  const counting = countingBag({
    logger: { level: "all", callback: (l: string) => seen.push(l) },
  });
  const base = mkBase();
  const clone = cloneRouter(base, undefined, counting.bag as never);
  const atClone = { ...counting.reads };
  fire(clone);
  const afterUse = { ...counting.reads };

  const drift: string[] = [];
  const drifting = driftingBag(
    { logger: { level: "all", callback: (l: string) => drift.push(`1:${l}`) } },
    { logger: { level: "all", callback: (l: string) => drift.push(`2:${l}`) } },
  );
  const base2 = mkBase();
  const clone2 = cloneRouter(base2, undefined, drifting.bag as never);
  fire(clone2);
  fire(clone2);

  out.p1 = {
    readsAtClone: atClone,
    readsAfterUse: afterUse,
    posControl_countingArmLogged: seen.length,
    driftingReads: { ...drifting.reads },
    firstReadCallbackFired: drift.filter((s) => s.startsWith("1:")).length,
    secondReadCallbackFired_mustBeZero: drift.filter((s) => s.startsWith("2:"))
      .length,
  };
  clone.dispose();
  clone2.dispose();
  base.dispose();
  base2.dispose();
}

// --- P2: лгущий Proxy + инвентарь ловушек ---------------------------------
{
  const seen: string[] = [];
  const lying = lyingProxy(
    { logger: { level: "all", callback: (l: string) => seen.push(l) } },
    "logger",
  );
  const base = mkBase();
  const clone = cloneRouter(base, undefined, lying.bag as never);
  fire(clone);

  const seen2: string[] = [];
  const t = trap({
    logger: { level: "all", callback: (l: string) => seen2.push(l) },
  });
  const base2 = mkBase();
  const clone2 = cloneRouter(base2, undefined, t.bag as never);
  fire(clone2);

  out.p2 = {
    lyingCounts: lying.counts,
    hiddenKeyLanded: seen.length > 0,
    allTrapCounts: t.counts,
    enumerationTraps: Object.keys(t.counts).filter(
      (k) => k === "ownKeys" || k.startsWith("gopd:") || k.startsWith("has:"),
    ),
    posControl_trapArmLogged: seen2.length > 0,
  };
  clone.dispose();
  clone2.dispose();
  base.dispose();
  base2.dispose();
}

// --- P3: унаследованный аксессор под именем ключа + собственный __proto__ ---
{
  const sets: unknown[] = [];
  let inheritedGetterSeen = 0;
  let logged = 0;
  try {
    Object.defineProperty(Object.prototype, "logger", {
      configurable: true,
      get(): unknown {
        inheritedGetterSeen += 1;
        return {
          level: "all",
          callback: (): void => {
            logged += 1;
          },
        };
      },
      set(v: unknown): void {
        sets.push(v);
      },
    });
    const base = mkBase();
    const clone = cloneRouter(base, undefined, {} as never);
    fire(clone);
    clone.dispose();
    base.dispose();
  } finally {
    delete (Object.prototype as Record<string, unknown>).logger;
  }

  const wire = JSON.parse('{"__proto__":"pwned"}') as Record<string, unknown>;
  const base = mkBase();
  const clone = cloneRouter(base, undefined, wire as never);
  fire(clone);

  out.p3 = {
    inheritedSetterFired_mustBeZero: sets.length,
    inheritedGetterSeen,
    inheritedLoggerFired: logged,
    wireOwnKeys: Object.keys(wire),
    cloneProtoIsObjectPrototype:
      Object.getPrototypeOf(getPluginApi(clone).getOptions()) ===
      Object.prototype,
    globalProtoUnpolluted:
      ({} as Record<string, unknown>).__proto__ !== "pwned",
    posControl_built: clone.buildPath("u", { id: "4" }),
  };
  clone.dispose();
  base.dispose();
}

console.log(JSON.stringify(out, null, 1));
