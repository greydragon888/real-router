// Опровергатель триажа для семейства «Router-инстанс · ключ WeakMap».
// Вопрос ровно один: ЧИТАЕТ ли функция свойства переданной ручки — то есть
// существует ли read-back отданного ядром объекта после того, как приложение
// могло его изменить (round-trip), или обращение исчерпывается WeakMap-ключом.
// Измеряется СНАРУЖИ: на настоящем инстансе каждому имени свойства ставится
// собственный аксессор-счётчик (значение отдаётся неизменным), затем вызывается
// каждая из спорных функций.
import { createRouter } from "@real-router/core";
import {
  getDependenciesApi,
  getLifecycleApi,
  cloneRouter,
} from "@real-router/core/api";
import { invalidate } from "@real-router/ssr-data-plugin";

import { hydrateRouter } from "../../../../packages/ssr-utils/src/hydrateRouter";

type Bag = Record<string, unknown>;

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "a", path: "/a" },
] as never;

function instrument(router: object): Record<string, number> {
  const reads: Record<string, number> = {};
  const names = new Set<string>();

  for (
    let o: object | null = router;
    o && o !== Object.prototype;
    o = Object.getPrototypeOf(o) as object | null
  ) {
    for (const k of Object.getOwnPropertyNames(o)) {
      if (k !== "constructor") names.add(k);
    }
  }

  for (const name of names) {
    const value = (router as Bag)[name];
    const ok = Reflect.defineProperty(router, name, {
      configurable: true,
      enumerable: false,
      get(): unknown {
        reads[name] = (reads[name] ?? 0) + 1;

        return value;
      },
      set(v: unknown): void {
        Reflect.defineProperty(router, name, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: v,
        });
      },
    });

    if (!ok) reads[`!undefinable:${name}`] = -1;
  }

  return reads;
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // ── позитивный контроль инструмента ──────────────────────────────────────
  {
    const r = createRouter(ROUTES, {} as never);
    const reads = instrument(r);
    void (r as Bag).getState; // заведомое чтение
    const href = r.buildPath("a"); // инструментованный роутер работоспособен

    out.control_instrument = {
      readsAfterOneDeliberateRead: { ...reads },
      buildPathStillWorks: href,
    };
  }

  // ── арма: getDependenciesApi ────────────────────────────────────────────
  {
    const r = createRouter(ROUTES, {} as never);
    const reads = instrument(r);
    const api = getDependenciesApi(r);

    api.set("db", { q: 1 });
    out.getDependenciesApi = {
      readsOnHandle: { ...reads },
      apiWorks: api.has("db"),
    };
  }

  // ── арма: getLifecycleApi ───────────────────────────────────────────────
  {
    const r = createRouter(ROUTES, {} as never);
    const reads = instrument(r);
    const api = getLifecycleApi(r);

    api.addActivateGuard("a", () => () => true);
    out.getLifecycleApi = {
      readsOnHandle: { ...reads },
      apiWorks: typeof api.addActivateGuard,
    };
  }

  // ── арма: cloneRouter ───────────────────────────────────────────────────
  {
    const r = createRouter(ROUTES, {} as never);
    const reads = instrument(r);
    const clone = cloneRouter(r);

    out.cloneRouter = {
      readsOnHandle: { ...reads },
      cloneBuilt: clone.buildPath("a"),
    };
  }

  // ── арма: markStale через публичный invalidate ──────────────────────────
  {
    const r = createRouter(ROUTES, {} as never);
    const reads = instrument(r);

    invalidate(r as never, "data");
    out.markStale = { readsOnHandle: { ...reads } };
  }

  // ── арма: hydrateRouter ─────────────────────────────────────────────────
  {
    const r = createRouter(ROUTES, {} as never);
    const reads = instrument(r);
    const state = await hydrateRouter(
      r as never,
      JSON.stringify({ path: "/home" }),
    );

    out.hydrateRouter = {
      readsOnHandle: { ...reads },
      startedAt: (state as { name: string }).name,
    };
  }

  // ── атака round-trip на hydrateRouter: приложение затеняет `start` ──────
  {
    const control = createRouter(ROUTES, {} as never);
    const controlState = await hydrateRouter(
      control as never,
      JSON.stringify({ path: "/home" }),
    );

    const r = createRouter(ROUTES, {} as never);
    let calls = 0;
    let sawPath: unknown;
    const original = r.start.bind(r);

    // Запись возможна только тому, КОМУ ручку отдали: это и есть хэндаут.
    (r as Bag).start = (p: unknown): unknown => {
      calls += 1;
      sawPath = p;

      return original("/a" as never);
    };

    const shadowedState = await hydrateRouter(
      r as never,
      JSON.stringify({ path: "/home" }),
    );

    out.hydrateRouter_shadowAttack = {
      shadowInstalled: Object.hasOwn(r, "start"),
      controlLandsOn: (controlState as { name: string }).name,
      appStartCalledByCore: calls,
      pathCoreHandedToAppFn: sawPath,
      shadowedLandsOn: (shadowedState as { name: string }).name,
    };
  }

  console.log(JSON.stringify(out, null, 1));
}

void main();
