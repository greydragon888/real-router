// Линза L4-deps-lifecycle — ось зависимостей.
// Что измеряется: какие ловушки Proxy и сколько раз дёргает КАЖДАЯ из трёх
// дверей мешка (createRouter · dependencies, setAll · deps, cloneRouter ·
// dependencies), без плагина и с validation-plugin; что отдаёт хэндаут
// `getAll` (свежий контейнер? листья по ссылке? мутация доходит до стора?);
// лист `set(name, value)` — по ссылке ли.
// Позитивный контроль каждой двери: значение ДОШЛО до стора (`get` отдаёт тот
// же объект-лист), иначе счёт ничего не доказывает.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

type Counts = Record<string, number>;

function trapCounter<T extends object>(source: T): { bag: T; counts: Counts } {
  const counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const bag = new Proxy(source, {
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
      bump(`delete:${String(k)}`);
      return Reflect.deleteProperty(t, k);
    },
  });
  return { bag, counts };
}

const svc = { name: "db" };
const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

function run(withPlugin: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // Дверь: createRouter · dependencies
  const c1 = trapCounter({ svc, n: 1 });
  const router = createRouter(routes as never, {}, c1.bag as never);
  if (withPlugin) {
    router.usePlugin(validationPlugin());
  }
  const deps = getDependenciesApi(router);
  const store = getInternals(router).dependenciesGetStore().dependencies;
  out["createRouter·dependencies"] = {
    counts: c1.counts,
    landed: deps.get("svc" as never) === svc,
    storeIsCallerBag: store === c1.bag,
    storeProtoIsNull: Object.getPrototypeOf(store) === null,
    laterMutationOfBagReachesStore: (() => {
      (c1.bag as Record<string, unknown>).late1 = 1;
      return deps.has("late1" as never);
    })(),
  };

  // Дверь: setAll · deps
  const c2 = trapCounter({ svc2: svc, m: 2 });
  const before2 = { ...c2.counts };
  deps.setAll(c2.bag as never);
  out["setAll·deps"] = {
    countsBefore: before2,
    counts: c2.counts,
    landed: deps.get("svc2" as never) === svc,
    laterMutationOfBagReachesStore: (() => {
      (c2.bag as Record<string, unknown>).late2 = 1;
      return deps.has("late2" as never);
    })(),
  };

  // Дверь: cloneRouter · dependencies
  const c3 = trapCounter({ svc3: svc, k: 3 });
  const clone = cloneRouter(router, c3.bag as never);
  const cdeps = getDependenciesApi(clone);
  out["cloneRouter·dependencies"] = {
    counts: c3.counts,
    landed: cdeps.get("svc3" as never) === svc,
    baseUntouched: !deps.has("svc3" as never),
    inheritedLeafShared: cdeps.get("svc" as never) === svc,
    cloneStoreIsCallerBag:
      getInternals(clone).dependenciesGetStore().dependencies === c3.bag,
    laterMutationOfBagReachesClone: (() => {
      (c3.bag as Record<string, unknown>).late3 = 1;
      return cdeps.has("late3" as never);
    })(),
  };

  // Хэндаут: getAll
  const a = deps.getAll() as Record<string, unknown>;
  const b = deps.getAll();
  a.injected = 1;
  deps.set("__proto__" as never, 42 as never);
  out["getAll·handout"] = {
    freshPerCall: a !== b,
    notTheStore: (a as unknown) !== store,
    leafIdentity: a.svc === svc,
    handoutProtoIsObjectPrototype: Object.getPrototypeOf(a) === Object.prototype,
    injectedIntoHandoutReachesStore: deps.has("injected" as never),
    protoKeyStored: deps.has("__proto__" as never),
    protoKeyGetAnswers: deps.get("__proto__" as never) === 42,
    protoKeyInHandout: Object.hasOwn(deps.getAll(), "__proto__"),
    protoKeyInCloneState: Object.hasOwn(
      getInternals(router).getCloneState().dependencies,
      "__proto__",
    ),
  };

  // Дверь-лист: set · value
  const leaf = { x: 1 };
  deps.set("leaf" as never, leaf as never);
  out["set·value"] = { leafIdentity: deps.get("leaf" as never) === leaf };

  router.dispose();
  clone.dispose();
  return out;
}

console.log(
  JSON.stringify({ bare: run(false), withValidationPlugin: run(true) }, null, 1),
);
