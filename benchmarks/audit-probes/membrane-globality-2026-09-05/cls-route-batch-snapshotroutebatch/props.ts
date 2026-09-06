// Столбцы P1–P4 матрицы семейства «route-config·snapshotRouteBatch»
// на трёх арках (createRouter / RoutesApi.add / RoutesApi.replace).
// Каждый блок: позитивный контроль + доказательство, что вход дошёл до ветви.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};

type AnyRoute = Record<string, unknown>;
type Arc = "createRouter" | "add" | "replace";

function run(arc: Arc, batch: unknown[]): ReturnType<typeof createRouter> {
  if (arc === "createRouter") {
    return createRouter(batch as never);
  }

  const router = createRouter([{ name: "seed", path: "/seed" }] as never);

  if (arc === "add") {
    getRoutesApi(router).add(batch as never);
  } else {
    getRoutesApi(router).replace(batch as never);
  }

  return router;
}

/** Считающий Proxy над МАССИВОМ (символьные ключи тоже видны). */
function arrayProbe(arr: unknown[]): { proxy: unknown[]; gets: string[] } {
  const gets: string[] = [];
  const proxy = new Proxy(arr, {
    get(target, key, receiver): unknown {
      gets.push(typeof key === "symbol" ? key.toString() : key);

      return Reflect.get(target, key, receiver);
    },
  });

  return { proxy: proxy as unknown[], gets };
}

function tally(list: readonly string[]): Record<string, number> {
  const res: Record<string, number> = {};

  for (const k of list) {
    res[k] = (res[k] ?? 0) + 1;
  }

  return res;
}

function main(): void {
  for (const arc of ["createRouter", "add", "replace"] as const) {
    // ═══ P1 · счёт чтений на ключ ОБЪЕКТА МАРШРУТА (countingProxy) ═══════════
    {
      const source: AnyRoute = {
        name: "u",
        path: "/u/:id",
        meta: { leaf: true },
        defaultParams: { id: "1" },
        children: [{ name: "kid", path: "/kid" }],
      };
      const counted = countingProxy(source);
      const router = run(arc, [counted.bag]);

      out[`${arc} · P1 route object reads per key`] = { ...counted.reads };
      out[`${arc} · P1 positive control: route registered + printed`] = {
        has: getRoutesApi(router).has("u"),
        hasKid: getRoutesApi(router).has("u.kid"),
        path: router.buildPath("u.kid", { id: "9" }),
      };
      router.dispose();
    }

    // ═══ P1 · счёт обходов МАССИВА-контейнера (batch и children) ═════════════
    {
      const kids = arrayProbe([{ name: "kid", path: "/kid" }]);
      const batch = arrayProbe([
        { name: "u", path: "/u/:id", children: kids.proxy },
      ]);
      const router = run(arc, batch.proxy);

      out[`${arc} · P1 batch array gets`] = tally(batch.gets);
      out[`${arc} · P1 children array gets`] = tally(kids.gets);
      out[`${arc} · P1 positive control: nested route registered`] =
        getRoutesApi(router).has("u.kid");
      router.dispose();
    }

    // ═══ P1 · ДРЕЙФУЮЩИЙ `children`: расходятся ли гвард и снапшот ═══════════
    {
      const legal = [{ name: "kid", path: "/kid" }];
      const drifted = [{ name: "evil", path: "/evil" }];
      const source: AnyRoute = { name: "u", path: "/u", children: legal };
      const counted = countingProxy(source, (key, nth) =>
        key === "children"
          ? nth === 1
            ? legal
            : drifted
          : (source as Record<string, unknown>)[key],
      );
      let threw: string | null = null;
      let router: ReturnType<typeof createRouter> | null = null;

      try {
        router = run(arc, [counted.bag]);
      } catch (error) {
        threw = String(error).slice(0, 120);
      }

      out[`${arc} · P1 drifting children`] = {
        childrenReads: counted.reads.children,
        threw,
        registeredKid: router ? getRoutesApi(router).has("u.kid") : null,
        registeredEvil: router ? getRoutesApi(router).has("u.evil") : null,
      };
      router?.dispose();
    }

    // ═══ P2 · ЛГУЩИЙ Proxy: ключ вне ownKeys, но gOPD зовёт его собственным ══
    {
      const target: AnyRoute = { name: "u", path: "/u" };
      const liar = new Proxy(target, {
        ownKeys: () => ["name", "path"],
        getOwnPropertyDescriptor(t, key): PropertyDescriptor | undefined {
          if (key === "secret") {
            return {
              value: "leaked",
              enumerable: true,
              configurable: true,
              writable: true,
            };
          }

          return Reflect.getOwnPropertyDescriptor(t, key);
        },
        get(t, key, receiver): unknown {
          if (key === "secret") {
            return "leaked";
          }

          return Reflect.get(t, key, receiver);
        },
        has: (t, key) => key === "secret" || Reflect.has(t, key),
      });
      const router = run(arc, [liar]);
      const cfg = getPluginApi(router).getRouteConfig("u");

      out[`${arc} · P2 lying key entered state?`] = {
        configKeys: cfg ? Object.keys(cfg) : null,
        secretPresent: cfg ? "secret" in cfg : null,
      };
      router.dispose();

      // ПОЗИТИВНЫЙ КОНТРОЛЬ ИНСТРУМЕНТА: тот же ключ, честно названный в ownKeys.
      const honest = run(arc, [{ name: "u", path: "/u", secret: "leaked" }]);
      const honestCfg = getPluginApi(honest).getRouteConfig("u");

      out[`${arc} · P2 positive control: honest own key IS taken`] = {
        configKeys: honestCfg ? Object.keys(honestCfg) : null,
        value: honestCfg?.secret,
      };
      honest.dispose();
    }

    // ═══ P3a · унаследованный аксессор `children` (единственный [[Set]]) ═════
    {
      let getterCalls = 0;
      let setterCalls = 0;
      const injected = [{ name: "evil", path: "/evil" }];
      let threw: string | null = null;
      let hasEvil: boolean | null = null;
      let hasU: boolean | null = null;

      Object.defineProperty(Object.prototype, "children", {
        configurable: true,
        get(): unknown {
          getterCalls += 1;

          // Отдаём массив только первым двум читателям (гвард + Array.isArray),
          // иначе рекурсия снапшота по унаследованному ключу не завершится.
          return getterCalls <= 2 ? injected : undefined;
        },
        set(): void {
          setterCalls += 1;
        },
      });

      try {
        const router = run(arc, [{ name: "u", path: "/u" }]);

        hasU = getRoutesApi(router).has("u");
        hasEvil = getRoutesApi(router).has("u.evil");
        router.dispose();
      } catch (error) {
        threw = String(error).slice(0, 160);
      } finally {
        delete (Object.prototype as AnyRoute).children;
      }

      out[`${arc} · P3a inherited children accessor`] = {
        getterCalls,
        setterCalls,
        threw,
        hasU,
        hasEvil,
      };
    }

    // ═══ P3b · тот же ключ, аксессор БЕЗ сеттера (строгий режим = throw?) ════
    {
      let getterCalls = 0;
      const injected = [{ name: "evil", path: "/evil" }];
      let threw: string | null = null;

      Object.defineProperty(Object.prototype, "children", {
        configurable: true,
        get(): unknown {
          getterCalls += 1;

          return getterCalls <= 2 ? injected : undefined;
        },
      });

      try {
        const router = run(arc, [{ name: "u", path: "/u" }]);

        router.dispose();
      } catch (error) {
        threw = String(error).slice(0, 160);
      } finally {
        delete (Object.prototype as AnyRoute).children;
      }

      out[`${arc} · P3b inherited getter-only children`] = { getterCalls, threw };
    }

    // ═══ P3c · собственный ключ "__proto__" из JSON.parse ═══════════════════
    {
      const route = JSON.parse(
        '{"name":"u","path":"/u","__proto__":{"polluted":1}}',
      ) as AnyRoute;
      const router = run(arc, [route]);
      const cfg = getPluginApi(router).getRouteConfig("u");

      out[`${arc} · P3c own __proto__ key`] = {
        ownKeysOfRecord: cfg ? Object.getOwnPropertyNames(cfg) : null,
        survivedAsData: cfg
          ? Object.getOwnPropertyDescriptor(cfg, "__proto__")?.value !==
            undefined
          : null,
        recordProtoUnchanged: cfg ? Object.getPrototypeOf(cfg) === null : null,
        globalNotPolluted: ({} as AnyRoute).polluted === undefined,
        positiveControlRegistered: getRoutesApi(router).has("u"),
      };
      router.dispose();
    }

    // ═══ P4 · заморозка: уровни вызывающего против уровня ядра ══════════════
    {
      const leaf = { serviceLike: true };
      const kids: AnyRoute[] = [{ name: "kid", path: "/kid" }];
      const dp = { id: "1" };
      const route: AnyRoute = {
        name: "u",
        path: "/u/:id",
        meta: leaf,
        defaultParams: dp,
        children: kids,
      };
      const batch = [route];
      const router = run(arc, batch);
      const tree = getPluginApi(router).getTree();
      const cfg = getPluginApi(router).getRouteConfig("u");

      out[`${arc} · P4 caller levels frozen?`] = {
        batchArray: Object.isFrozen(batch),
        routeObject: Object.isFrozen(route),
        childrenArray: Object.isFrozen(kids),
        childRoute: Object.isFrozen(kids[0]),
        defaultParamsBag: Object.isFrozen(dp),
        leaf: Object.isFrozen(leaf),
      };
      out[`${arc} · P4 core-produced levels frozen?`] = {
        tree: Object.isFrozen(tree),
        treeChildNode: Object.isFrozen(tree.children.get("u")),
        customFieldRecord: cfg ? Object.isFrozen(cfg) : null,
        customLeafIsCallerLeaf: cfg?.meta === leaf,
      };
      out[`${arc} · P4 positive control: route registered`] =
        getRoutesApi(router).has("u.kid");
      router.dispose();
    }
  }

  console.log(JSON.stringify(out, null, 1));
}

main();
