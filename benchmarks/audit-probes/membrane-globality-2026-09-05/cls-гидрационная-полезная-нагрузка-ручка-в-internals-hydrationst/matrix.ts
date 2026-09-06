// МАТРИЦА семейства «гидрационная-полезная-нагрузка · ручка в internals.hydrationState».
// Строки — двери, столбцы — эксперимент (а), P1..P4.
// Один объект (payload) × N путей чтения: ssr-utils/hydrateRouter кладёт его в
// RouterInternals.hydrationState по ссылке, shared/ssr/createSsrLoaderPlugin читает
// name/params/search/context[ns] и context[deferredKeysNamespace].
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  countingProxy,
} from "../../../../packages/core/tests/helpers/hostileBags";
import { hydrateRouter } from "../../../../packages/ssr-utils/src/hydrateRouter";
import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";

const routes = [{ name: "a", path: "/a/:id?q" }] as never;
const cfg = {
  namespace: "data",
  modeNamespace: "dataMode",
  deferredNamespace: "dataDeferred",
  deferredKeysNamespace: "dataDeferredKeys",
  errorPrefix: "[probe]",
};

interface Rig {
  router: ReturnType<typeof createRouter>;
  loaderCalls: () => number;
  slotDuringStart: () => unknown;
}

function makeRig(): Rig {
  const router = createRouter(routes, {} as never);
  let calls = 0;
  let slot: unknown = "never-captured";

  router.usePlugin(
    createSsrLoaderPlugin(
      {
        a: () => () => {
          calls += 1;

          return "loaded-by-loader";
        },
      },
      cfg,
    ) as never,
  );

  // Наблюдатель слота: интерцептор фазы start, тот же кадр, что у SSR-плагина.
  getPluginApi(router).addInterceptor("start", (next, path) => {
    slot = getInternals(router).hydrationState;

    return next(path);
  });

  return { router, loaderCalls: () => calls, slotDuringStart: () => slot };
}

function leaf(): Record<string, unknown> {
  return { fromServer: true };
}

function makePayload(value: unknown) {
  return {
    name: "a",
    path: "/a/1?q=x",
    params: { id: "1" } as Record<string, unknown>,
    search: { q: "x" } as Record<string, unknown>,
    context: { data: value } as Record<string, unknown>,
  };
}

function shallowCopyAllLevels(p: ReturnType<typeof makePayload>) {
  // Эмуляция стратегии (а): копия КАЖДОГО уровня-контейнера, который читает ядро/плагин;
  // листья (value) — те же ссылки.
  return {
    ...p,
    params: { ...p.params },
    search: { ...p.search },
    context: { ...p.context },
  };
}

async function observe(
  label: string,
  payloadFor: () => unknown,
  original: ReturnType<typeof makePayload>,
) {
  const rig = makeRig();
  const passed = payloadFor();
  const state = await hydrateRouter(rig.router as never, passed as never);

  const out = {
    label,
    "state.name": state.name,
    "state.path": state.path,
    "state.params": { ...state.params },
    "state.search": { ...state.search },
    "context.data": state.context.data,
    "context.data === original leaf (лист по ссылке)":
      state.context.data === original.context.data,
    "context.dataMode": state.context.dataMode,
    loaderCalls: rig.loaderCalls(),
    "slot during start === переданный объект": rig.slotDuringStart() === passed,
    "slot during start === оригинал приложения":
      rig.slotDuringStart() === original,
    "slot после (finally)": getInternals(rig.router as never).hydrationState,
    "getState() === возвращённый state": rig.router.getState() === state,
    "frozen: state shell": Object.isFrozen(state),
    "frozen: state.context": Object.isFrozen(state.context),
    "frozen: state.params": Object.isFrozen(state.params),
    "frozen: КОНТЕЙНЕР вызывающего payload": Object.isFrozen(original),
    "frozen: payload.params вызывающего": Object.isFrozen(original.params),
    "frozen: payload.context вызывающего": Object.isFrozen(original.context),
    "frozen: лист вызывающего": Object.isFrozen(
      original.context.data as object,
    ),
  };

  // ОБРАТНАЯ ВИДИМОСТЬ 1: мутируем оригинал ПОСЛЕ вызова.
  original.context.data = "MUTATED-AFTER";
  original.name = "MUTATED-AFTER";

  const afterMutation = {
    "state.context.data после мутации оригинала":
      rig.router.getState()!.context.data,
    "slot после (всё ещё null)": getInternals(rig.router as never)
      .hydrationState,
  };

  // ОБРАТНАЯ ВИДИМОСТЬ 2: мутируем то, что отдало ядро.
  let writeToCoreContext = "no-throw";

  try {
    (rig.router.getState()!.context as Record<string, unknown>).data =
      "WRITTEN-BY-APP";
  } catch (error) {
    writeToCoreContext = `throw: ${(error as Error).name}`;
  }

  rig.router.dispose();

  return {
    ...out,
    ...afterMutation,
    "запись приложения в state.context": writeToCoreContext,
  };
}

async function sectionA(): Promise<unknown> {
  const sharedLeaf = leaf();
  const originalArm = makePayload(sharedLeaf);
  const copyOriginal = makePayload(sharedLeaf);

  const armOriginal = await observe(
    "ARM-1 оригинал (ручка)",
    () => originalArm,
    originalArm,
  );
  const armCopy = await observe(
    "ARM-2 предварительно скопированный контейнер",
    () => shallowCopyAllLevels(copyOriginal),
    copyOriginal,
  );

  return { armOriginal, armCopy };
}

// ── ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ ветки: расхождение params → loader бежит ──────────
async function negativeControl(): Promise<unknown> {
  const rig = makeRig();
  const payload = makePayload(leaf());

  payload.params = { id: "OTHER" };

  const state = await hydrateRouter(rig.router as never, payload as never);
  const out = {
    "context.data": state.context.data,
    loaderCalls: rig.loaderCalls(),
  };

  rig.router.dispose();

  return out;
}

// ── P1: дрейфующий вход, второе чтение ЛЖЁТ ─────────────────────────────────
async function p1(): Promise<unknown> {
  const good = leaf();
  const base = makePayload(good);
  const paramsP = countingProxy(base.params, (key, nth) =>
    nth === 1 ? base.params[key] : "DRIFT",
  );
  const searchP = countingProxy(base.search, (key, nth) =>
    nth === 1 ? base.search[key] : "DRIFT",
  );
  const ctxP = countingProxy(base.context, (key, nth) =>
    nth === 1 ? base.context[key] : "DRIFT-VALUE",
  );
  const drifted: Record<string, unknown> = {
    name: "a",
    path: "/a/1?q=x",
    params: paramsP.bag,
    search: searchP.bag,
    context: ctxP.bag,
  };
  const payloadP = countingProxy(drifted, (key, nth) => {
    if (nth === 1) {
      return drifted[key];
    }

    return key === "name"
      ? "DRIFTED-NAME"
      : key === "path"
        ? "/DRIFT"
        : { drift: true };
  });

  const rig = makeRig();
  const state = await hydrateRouter(rig.router as never, payloadP.bag as never);
  const out = {
    "reads на контейнере payload": { ...payloadP.reads },
    "reads на payload.params": { ...paramsP.reads },
    "reads на payload.search": { ...searchP.reads },
    "reads на payload.context": { ...ctxP.reads },
    "результат от ПЕРВОГО чтения (context.data === good)":
      state.context.data === good,
    "context.data": state.context.data,
    loaderCalls: rig.loaderCalls(),
  };

  rig.router.dispose();

  return out;
}

// ── P2: лгущий Proxy (ownKeys молчит, gOPD утверждает «собственный») ────────
function lyingProxy<T extends object>(target: T, hidden: string): T {
  return new Proxy(target as Record<string, unknown>, {
    ownKeys: (t) => Reflect.ownKeys(t).filter((k) => k !== hidden),
    getOwnPropertyDescriptor: (t, k) => Reflect.getOwnPropertyDescriptor(t, k),
  }) as T;
}

async function p2(): Promise<unknown> {
  // (i) context: ключ namespace скрыт от ownKeys, но hasOwn его видит.
  const hiddenValue = { hidden: true };
  const p = makePayload(hiddenValue);
  const lyingContext = lyingProxy(p.context, "data");

  p.context = lyingContext;

  const rigA = makeRig();
  const stateA = await hydrateRouter(rigA.router as never, p as never);
  const contextResult = {
    "Object.keys(лгущего context)": Object.keys(lyingContext),
    "Object.hasOwn(лгущий, 'data')": Object.hasOwn(lyingContext, "data"),
    "ключ, невидимый для ownKeys, попал в state.context":
      stateA.context.data === hiddenValue,
    loaderCalls: rigA.loaderCalls(),
    "что дала бы копия контейнера ({...lying}).data": String(
      ({ ...lyingContext } as Record<string, unknown>).data,
    ),
    "ownKeys копии": Object.keys({ ...lyingContext }),
  };

  rigA.router.dispose();

  // (ii) params: ключ скрыт от ownKeys → channelAgrees не соглашается → loader.
  const p2payload = makePayload(leaf());
  const lyingParams = lyingProxy(p2payload.params, "id");

  p2payload.params = lyingParams;

  const rigB = makeRig();
  const stateB = await hydrateRouter(rigB.router as never, p2payload as never);
  const paramsResult = {
    "Object.keys(лгущего params)": Object.keys(lyingParams),
    "Object.hasOwn(лгущий, 'id')": Object.hasOwn(lyingParams, "id"),
    "context.data": stateB.context.data,
    loaderCalls: rigB.loaderCalls(),
  };

  rigB.router.dispose();

  return { contextResult, paramsResult };
}

// ── P3: унаследованный аксессор + собственный "__proto__" ───────────────────
async function p3(): Promise<unknown> {
  const setCalls: string[] = [];
  const getCalls: string[] = [];

  Object.defineProperty(Object.prototype, "data", {
    configurable: true,
    get(): unknown {
      getCalls.push("get");

      return "INHERITED-VALUE";
    },
    set(v: unknown): void {
      setCalls.push(String(v));
    },
  });

  let inherited: unknown;
  let threw = "no-throw";

  try {
    // payload.context БЕЗ собственного `data`: наследованный аксессор виден через
    // цепочку прототипов, но hasOwn его не признаёт.
    const rig = makeRig();
    const payload = {
      name: "a",
      path: "/a/1?q=x",
      params: { id: "1" },
      search: { q: "x" },
      context: {} as Record<string, unknown>,
    };
    const state = await hydrateRouter(rig.router as never, payload as never);

    inherited = {
      "context.data (ядро записало результат loader-а)": state.context.data,
      loaderCalls: rig.loaderCalls(),
      "унаследованный сеттер вызван при записи ядра": setCalls.length,
      "прототип state.context":
        Object.getPrototypeOf(state.context) === null
          ? "null"
          : "Object.prototype",
      "унаследованный геттер прочитан ядром/плагином": getCalls.length,
      // ПОЗИТИВНЫЙ КОНТРОЛЬ инструмента: аксессор жив и ловит [[Set]] на
      // обычной цели — значит нулевой счёт выше говорит о СПОСОБЕ записи ядра.
      "контроль: [[Set]] на обычном объекте зовёт унаследованный сеттер": (() => {
        const plain: Record<string, unknown> = {};

        plain.data = "ASSIGNED";

        return { setCalls: setCalls.length, ownKey: Object.hasOwn(plain, "data") };
      })(),
    };

    rig.router.dispose();
  } catch (error) {
    threw = `throw: ${(error as Error).message}`;
  } finally {
    delete (Object.prototype as Record<string, unknown>).data;
  }

  // Собственный "__proto__" из JSON.parse — в context и в массиве deferred-ключей.
  const rig2 = makeRig();
  const parsed = JSON.parse(
    '{"name":"a","path":"/a/1?q=x","params":{"id":"1"},"search":{"q":"x"},"context":{"data":{"ok":1},"__proto__":{"polluted":true},"dataDeferredKeys":["p","__proto__","constructor",42]}}',
  ) as Record<string, unknown>;
  const state2 = await hydrateRouter(rig2.router as never, parsed as never);
  const deferredOut = state2.context.dataDeferred as Record<string, unknown>;
  const parsedContext = (parsed as { context: Record<string, unknown> }).context;
  const protoResult = {
    "собственный __proto__ у распарсенного context": Object.hasOwn(
      parsedContext,
      "__proto__",
    ),
    "прототип объекта не подменён":
      Object.getPrototypeOf(parsedContext) === Object.prototype,
    "({}).polluted": ({} as Record<string, unknown>).polluted,
    "state.context.dataDeferredKeys": state2.context.dataDeferredKeys,
    "keys — новый массив (не массив payload'а)":
      state2.context.dataDeferredKeys !==
      (parsedContext.dataDeferredKeys as unknown),
    "прототип reconstructed promises":
      Object.getPrototypeOf(deferredOut) === null ? "null" : "Object.prototype",
    "reconstructed.p — thenable": typeof (deferredOut.p as { then?: unknown })
      .then,
  };

  rig2.router.dispose();

  return { inherited, threw, protoResult };
}

// ── Дверь hydrateRouter·options и deserialize·return ────────────────────────
async function optionsAndDeserialize(): Promise<unknown> {
  const returnedLeaf = leaf();
  const returned = makePayload(returnedLeaf);
  const returnedP = countingProxy(returned);
  const called: string[] = [];
  const options = countingBag({
    deserialize: (json: string) => {
      called.push(json);

      return returnedP.bag;
    },
  });
  const rig = makeRig();
  let slot: unknown;

  getPluginApi(rig.router as never).addInterceptor("start", (next, path) => {
    slot = getInternals(rig.router as never).hydrationState;

    return next(path);
  });

  const state = await hydrateRouter(
    rig.router as never,
    '{"path":"/IGNORED"}',
    options.bag as never,
  );
  const armOriginal = {
    "deserialize вызван с исходной строкой": called,
    "reads на мешке options": { ...options.reads },
    "slot === возврат deserialize (ручка держится)": slot === returnedP.bag,
    "reads на возвращённом объекте": { ...returnedP.reads },
    "context.data === лист возврата": state.context.data === returnedLeaf,
    "state.path": state.path,
    loaderCalls: rig.loaderCalls(),
    "мешок options НЕ удержан: аксессор-геттер не вызывается повторно после старта":
      await (async () => {
        await Promise.resolve();
        await rig.router.navigate("a", { id: "2" });

        return { ...options.reads };
      })(),
    "deserialize вызван ровно столько раз": called.length,
  };

  rig.router.dispose();

  // ARM-2: тот же deserialize, но возвращает КОПИЮ каждого уровня — сравнить следствия.
  const rig2 = makeRig();
  const state2 = await hydrateRouter(
    rig2.router as never,
    '{"path":"/IGNORED"}',
    { deserialize: () => shallowCopyAllLevels(returned) } as never,
  );
  const armCopy = {
    "state.path": state2.path,
    "state.name": state2.name,
    "context.data === тот же лист": state2.context.data === returnedLeaf,
    loaderCalls: rig2.loaderCalls(),
  };

  rig2.router.dispose();

  // Контроль: дефолт — JSON.parse (объект ядра, не приложения).
  const rig3 = makeRig();
  let slot3: unknown;

  getPluginApi(rig3.router as never).addInterceptor("start", (next, path) => {
    slot3 = getInternals(rig3.router as never).hydrationState;

    return next(path);
  });
  await hydrateRouter(rig3.router as never, '{"path":"/a/1?q=x","name":"a"}');

  const defaultBranch = {
    "slot — свежий объект JSON.parse": typeof slot3 === "object" && slot3 !== null,
    "slot.name": (slot3 as { name?: string }).name,
  };

  rig3.router.dispose();

  return { armOriginal, armCopy, defaultBranch };
}

// ── Дверь deferred-ключей: контейнер копируется (filter) ────────────────────
async function deferredKeys(): Promise<unknown> {
  const rig = makeRig();
  const keysArr: unknown[] = ["p", "__proto__", "constructor", 42, "q"];
  const payload = makePayload(leaf());

  payload.context.dataDeferredKeys = keysArr;

  const state = await hydrateRouter(rig.router as never, payload as never);
  const landed = state.context.dataDeferredKeys as unknown[];

  keysArr.push("ADDED-AFTER");

  const out = {
    "landed keys": landed,
    "landed !== массив приложения (копия на границе)": landed !== keysArr,
    "мутация массива приложения после — не видна ядру": [...landed],
    "frozen: массив приложения": Object.isFrozen(keysArr),
    "frozen: landed": Object.isFrozen(landed),
    "промисы — из глобального реестра (идентичность листа)": Object.keys(
      state.context.dataDeferred as Record<string, unknown>,
    ),
  };

  rig.router.dispose();

  return out;
}

async function main(): Promise<void> {
  const sections: Record<string, unknown> = {};

  sections["H0-негативный-контроль-ветки"] = await negativeControl();
  sections["A-эксперимент-а"] = await sectionA();
  sections["P1-дрейф"] = await p1();
  sections["P2-лгущий-proxy"] = await p2();
  sections["P3-прототип"] = await p3();
  sections["options+deserialize"] = await optionsAndDeserialize();
  sections["deferred-keys"] = await deferredKeys();

  console.log(JSON.stringify(sections, null, 1));
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
