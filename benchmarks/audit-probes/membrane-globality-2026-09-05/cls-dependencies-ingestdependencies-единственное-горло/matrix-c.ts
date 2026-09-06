// ЧАСТЬ C — две вещи, которые меняют вердикт P1 «сегодня»:
//  (1) validation-plugin добавляет ВТОРОЙ проход по мешку вызывающего ДО горла
//      (setAll / cloneRouter) — считаем ownKeys и чтения значений дрейфующим Proxy;
//  (2) расхождение политики: тот же мешок с геттером прямой cloneRouter ОТКАЗЫВАЕТ,
//      а createRequestScope сплющивает и ПРИНИМАЕТ (судья видит копию).
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { createRequestScope } from "@real-router/ssr-utils";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

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

function driftProxy(keys: readonly string[]): {
  bag: Record<string, unknown>;
  reads: Record<string, number>;
  meta: { ownKeys: number; gopd: number };
} {
  const reads: Record<string, number> = {};
  const meta = { ownKeys: 0, gopd: 0 };
  const target: Record<string, unknown> = {};
  for (const k of keys) target[k] = FIRST;
  const bag = new Proxy(target, {
    ownKeys(t) {
      meta.ownKeys += 1;
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      meta.gopd += 1;
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get(t, k, r) {
      if (typeof k !== "string") return Reflect.get(t, k, r);
      reads[k] = (reads[k] ?? 0) + 1;
      return reads[k] === 1 ? FIRST : LATER;
    },
  });
  return { bag, reads, meta };
}

const out: Record<string, unknown> = {};

// (1) P1 при установленном validation-plugin
{
  const res: Record<string, unknown> = {};

  const r = createRouter(routes, {}, {} as never);
  r.usePlugin(validationPlugin() as never);
  const d = driftProxy(["svc", "k"]);
  getDependenciesApi(r as never).setAll(d.bag as never);
  res["setAll·deps · withValidationPlugin"] = {
    valueReadsPerKey: { ...d.reads },
    ownKeysWalks: d.meta.ownKeys,
    gopdCalls: d.meta.gopd,
    storedIsFromFirstRead:
      getDependenciesApi(r as never).get("svc" as never) === FIRST,
  };

  const base = createRouter(routes, {}, {} as never);
  base.usePlugin(validationPlugin() as never);
  const d2 = driftProxy(["svc", "k"]);
  const c = cloneRouter(base as never, d2.bag as never);
  res["cloneRouter·dependencies · withValidationPlugin"] = {
    valueReadsPerKey: { ...d2.reads },
    ownKeysWalks: d2.meta.ownKeys,
    gopdCalls: d2.meta.gopd,
    storedIsFromFirstRead:
      getDependenciesApi(c as never).get("svc" as never) === FIRST,
  };

  // позитивный контроль: без плагина тот же код даёт один проход
  const rBare = createRouter(routes, {}, {} as never);
  const d3 = driftProxy(["svc", "k"]);
  getDependenciesApi(rBare as never).setAll(d3.bag as never);
  res["CONTROL · setAll bare"] = {
    valueReadsPerKey: { ...d3.reads },
    ownKeysWalks: d3.meta.ownKeys,
    gopdCalls: d3.meta.gopd,
  };
  out["C1_validationPluginSecondWalk"] = res;
}

// (2) расхождение политики на createRequestScope (форма #1860 одним пакетом выше)
{
  let getterRuns = 0;
  const mkGetterBag = (): Record<string, unknown> => {
    const bag = {};
    Object.defineProperty(bag, "x", {
      enumerable: true,
      configurable: true,
      get() {
        getterRuns += 1;
        return FIRST;
      },
    });
    return bag as Record<string, unknown>;
  };

  const base = createRouter(routes, {}, {} as never);
  const direct = safe(() => cloneRouter(base as never, mkGetterBag() as never));
  const runsAfterDirect = getterRuns;

  const base2 = createRouter(routes, {}, {} as never);
  const req = { signal: new AbortController().signal };
  const scope = safe(() =>
    createRequestScope(req as never, base2 as never, mkGetterBag() as never),
  );
  const runsAfterScope = getterRuns - runsAfterDirect;

  // не-plain формы
  const nonPlain = (label: string, value: unknown): Record<string, unknown> => {
    const b1 = createRouter(routes, {}, {} as never);
    const d = safe(() => cloneRouter(b1 as never, value as never));
    const b2 = createRouter(routes, {}, {} as never);
    const s = safe(() =>
      createRequestScope(req as never, b2 as never, value as never),
    );
    return {
      label,
      directCloneRouter: typeof d === "string" ? d : "no-throw",
      createRequestScope: typeof s === "string" ? s : "no-throw",
      scopeLandedKeys:
        typeof s === "string"
          ? null
          : Object.keys(store((s as { router: unknown }).router)).sort(),
    };
  };

  out["C2_guardSeesTheCopy"] = {
    directCloneRouter_onGetterBag:
      typeof direct === "string" ? direct : "no-throw",
    getterRunsDuringDirect: runsAfterDirect,
    createRequestScope_onGetterBag:
      typeof scope === "string" ? scope : "no-throw",
    getterRunsDuringScope: runsAfterScope,
    scopeLandedX:
      typeof scope === "string"
        ? null
        : store((scope as { router: unknown }).router)["x"] === FIRST,
    nonPlainShapes: [
      nonPlain("Map", new Map([["a", 1]])),
      nonPlain("array", [1, 2]),
      nonPlain("string", "nope"),
      nonPlain("classInstance", new (class {
        a = 1;
      })()),
    ],
  };
}

console.log(JSON.stringify(out, null, 1));
