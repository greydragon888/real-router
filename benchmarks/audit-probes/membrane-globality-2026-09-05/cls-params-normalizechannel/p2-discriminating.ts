// P2, усиление позитивного контроля на трёх дверях, чей ответ — boolean/строка.
//
// В matrix.ts честный Proxy на маршруте `/u/:id?tab` НЕ различал арм для
// buildPath / isActiveRoute / canNavigateTo: лишний ключ `leaked` не печатается
// в href и не влияет на предикат, поэтому «leaked не попал» там было вакуумом.
// Здесь `leaked` — ВТОРОЙ ОБЯЗАТЕЛЬНЫЙ PATH-сегмент маршрута `/w/:id/:leaked`,
// а для canNavigateTo стоит activate-гвард, читающий toState.params.leaked.
// Теперь honest-арм и lying-арм ОБЯЗАНЫ разойтись, если ownKeys — авторитет.
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const ROUTES = [
  { name: "w", path: "/w/:id/:leaked" },
  { name: "plain", path: "/plain/:id" },
] as never;

/**
 * `honest` — ownKeys называет `leaked` (ключ есть на target);
 * `lying`  — ownKeys НЕ называет, но gOPD/get/has утверждают, что он собственный.
 */
const bagOf = (honest: boolean): Bag => {
  const target: Bag = { id: "7" };
  if (honest) {
    target.leaked = "LEAKED";
  }
  return new Proxy(target, {
    ownKeys: (t) => Reflect.ownKeys(t),
    getOwnPropertyDescriptor: (t, k) =>
      k === "leaked"
        ? { value: "LEAKED", enumerable: true, configurable: true, writable: true }
        : Reflect.getOwnPropertyDescriptor(t, k),
    get: (t, k, rec) => (k === "leaked" ? "LEAKED" : Reflect.get(t, k, rec)),
    has: (t, k) => k === "leaked" || Reflect.has(t, k),
  }) as Bag;
};

const out: Record<string, unknown> = {};

const safe = (fn: () => unknown): unknown => {
  try {
    return fn();
  } catch (e) {
    return `THROW ${String((e as Error).message).slice(0, 80)}`;
  }
};

// ---------------- buildPath ----------------
{
  const r = createRouter(ROUTES, {} as never);
  out["Router.buildPath·params"] = {
    honest: safe(() => r.buildPath("w", bagOf(true) as never)),
    lying: safe(() => r.buildPath("w", bagOf(false) as never)),
    plainControl: safe(() =>
      r.buildPath("w", { id: "7", leaked: "LEAKED" } as never),
    ),
  };
}

// ---------------- isActiveRoute ----------------
{
  const r = createRouter(ROUTES, {} as never);
  r.start("/w/7/LEAKED");
  out["Router.isActiveRoute·params"] = {
    startedAt: (r.getState() as { path: string } | null)?.path,
    honest: safe(() => r.isActiveRoute("w", bagOf(true) as never)),
    lying: safe(() => r.isActiveRoute("w", bagOf(false) as never)),
    plainControl: safe(() =>
      r.isActiveRoute("w", { id: "7", leaked: "LEAKED" } as never),
    ),
    plainNegativeControl: safe(() =>
      r.isActiveRoute("w", { id: "7", leaked: "OTHER" } as never),
    ),
  };
}

// ---------------- canNavigateTo (activate-гвард читает toState.params) ------
{
  const r = createRouter(ROUTES, {} as never);
  r.start("/plain/1");
  const seen: unknown[] = [];
  getLifecycleApi(r).addActivateGuard("w", () => (toState) => {
    seen.push({ ...(toState.params as Bag) });
    return (toState.params as Bag).leaked === "LEAKED";
  });
  out["Router.canNavigateTo·params"] = {
    honest: safe(() => r.canNavigateTo("w", bagOf(true) as never)),
    lying: safe(() => r.canNavigateTo("w", bagOf(false) as never)),
    plainControl: safe(() =>
      r.canNavigateTo("w", { id: "7", leaked: "LEAKED" } as never),
    ),
    plainNegativeControl: safe(() =>
      r.canNavigateTo("w", { id: "7", leaked: "OTHER" } as never),
    ),
    guardSaw: seen,
  };
}

console.log(JSON.stringify(out, null, 1));
