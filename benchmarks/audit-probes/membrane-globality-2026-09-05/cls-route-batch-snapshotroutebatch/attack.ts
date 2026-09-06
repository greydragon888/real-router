// Прицельные атаки на семейство «route-config·snapshotRouteBatch»:
// (A) сканер ИДЕНТИЧНОСТИ — появляется ли контейнер вызывающего в любом хэндауте;
// (B) P3 с АДРЕСНЫМ унаследованным аксессором `children` (единственный [[Set]]
//     примитива по цели с прототипом) — прошлый прогон не дошёл до ветви:
//     счётчик расходовали посторонние читатели `.children`;
// (C) следствие дрейфа `children`: регистрируется ли ребёнок, которого
//     структурный гвард обязан был отвергнуть.
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

/** Обходит граф и ищет объекты вызывающего ПО ИДЕНТИЧНОСТИ. */
function findIdentities(
  root: unknown,
  targets: ReadonlyMap<object, string>,
): string[] {
  const found = new Set<string>();
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();

    if (node === null || typeof node !== "object" || seen.has(node)) {
      continue;
    }

    seen.add(node);

    const label = targets.get(node as object);

    if (label !== undefined) {
      found.add(label);
    }

    if (node instanceof Map) {
      for (const v of node.values()) {
        stack.push(v);
      }
      continue;
    }

    for (const key of Object.getOwnPropertyNames(node)) {
      const d = Object.getOwnPropertyDescriptor(node, key);

      if (d && "value" in d) {
        stack.push(d.value);
      }
    }
  }

  return [...found].sort();
}

function main(): void {
  for (const arc of ["createRouter", "add", "replace"] as const) {
    // ═══ (A) сканер идентичности по ВСЕМ достижимым хэндаутам ═══════════════
    {
      const leaf = { serviceLike: true };
      const dp = { id: "1" };
      const child: AnyRoute = { name: "kid", path: "/kid" };
      const kids = [child];
      const route: AnyRoute = {
        name: "u",
        path: "/u/:id",
        meta: leaf,
        defaultParams: dp,
        children: kids,
      };
      const batch = [route];
      const targets = new Map<object, string>([
        [batch, "batch array"],
        [route, "route object"],
        [kids, "children array"],
        [child, "child route object"],
        [dp, "defaultParams bag (LEAF by canon)"],
        [leaf, "custom leaf (LEAF by canon)"],
      ]);

      const events: unknown[] = [];
      const router =
        arc === "createRouter"
          ? createRouter(batch as never)
          : createRouter([{ name: "seed", path: "/seed" }] as never);

      getRoutesApi(router).subscribeChanges((e) => events.push(e));

      if (arc === "add") {
        getRoutesApi(router).add(batch as never);
      } else if (arc === "replace") {
        getRoutesApi(router).replace(batch as never);
      }

      out[`${arc} · A identity of caller containers inside handouts`] = {
        "RoutesApi.get·return": findIdentities(
          getRoutesApi(router).get("u"),
          targets,
        ),
        "PluginApi.getRouteConfig·return": findIdentities(
          getPluginApi(router).getRouteConfig("u"),
          targets,
        ),
        "PluginApi.getTree·return": findIdentities(
          getPluginApi(router).getTree(),
          targets,
        ),
        "subscribeChanges·event": findIdentities(events, targets),
        eventCount: events.length,
      };
      out[`${arc} · A positive control: scanner finds a known-present leaf`] =
        findIdentities({ nested: [{ deep: leaf }] }, targets);
      out[`${arc} · A positive control: route registered`] =
        getRoutesApi(router).has("u.kid");
      router.dispose();
    }

    // ═══ (B) P3 · АДРЕСНЫЙ унаследованный аксессор `children` ════════════════
    for (const withSetter of [true, false]) {
      const injected: AnyRoute[] = [{ name: "evil", path: "/evil" }];
      let getterCalls = 0;
      let setterCalls = 0;
      let threw: string | null = null;
      let hasEvil: boolean | null = null;
      let hasU: boolean | null = null;

      const descriptor: PropertyDescriptor = {
        configurable: true,
        get(this: unknown): unknown {
          // Отвечаем ТОЛЬКО объекту маршрута «u» (и его снапшоту) — чтобы
          // посторонние читатели `.children` не съедали эксперимент.
          if (
            this !== null &&
            typeof this === "object" &&
            (this as AnyRoute).name === "u"
          ) {
            getterCalls += 1;

            return injected;
          }

          return undefined;
        },
      };

      if (withSetter) {
        descriptor.set = function (): void {
          setterCalls += 1;
        };
      }

      Object.defineProperty(Object.prototype, "children", descriptor);

      try {
        const router = run(arc, [{ name: "u", path: "/u" }]);

        hasU = getRoutesApi(router).has("u");
        hasEvil = getRoutesApi(router).has("u.evil");
        router.dispose();
      } catch (error) {
        threw = String(error).slice(0, 200);
      } finally {
        delete (Object.prototype as AnyRoute).children;
      }

      out[
        `${arc} · B inherited children accessor (${withSetter ? "get+set" : "get only"})`
      ] = { getterCalls, setterCalls, threw, hasU, hasEvil };
    }

    // ═══ (B2) контроль: без загрязнения тот же маршрут регистрируется ═══════
    {
      const router = run(arc, [{ name: "u", path: "/u" }]);

      out[`${arc} · B positive control (clean prototype)`] = {
        hasU: getRoutesApi(router).has("u"),
        hasEvil: getRoutesApi(router).has("u.evil"),
      };
      router.dispose();
    }

    // ═══ (C) дрейф `children`: ребёнок, которого гвард обязан отвергнуть ════
    {
      const legal = [{ name: "kid", path: "/kid" }];
      // Ребёнок с ГЕТТЕРОМ — validateRouteType отвергает такую форму.
      const banned = [
        {
          get name(): string {
            return "evil";
          },
          path: "/evil",
        },
      ];
      const source: AnyRoute = { name: "u", path: "/u", children: legal };
      const counted = countingProxy(source, (key, nth) =>
        key === "children"
          ? nth === 1
            ? legal
            : banned
          : (source as Record<string, unknown>)[key],
      );
      let threw: string | null = null;
      let router: ReturnType<typeof createRouter> | null = null;

      try {
        router = run(arc, [counted.bag]);
      } catch (error) {
        threw = String(error).slice(0, 200);
      }

      out[`${arc} · C drift to a child the guard refuses`] = {
        childrenReads: counted.reads.children,
        threw,
        hasEvil: router ? getRoutesApi(router).has("u.evil") : null,
        hasKid: router ? getRoutesApi(router).has("u.kid") : null,
      };
      router?.dispose();

      // ПОЗИТИВНЫЙ КОНТРОЛЬ: тот же запрещённый ребёнок БЕЗ дрейфа — отвергнут.
      let directThrew: string | null = null;

      try {
        const r2 = run(arc, [{ name: "u", path: "/u", children: banned }]);

        r2.dispose();
      } catch (error) {
        directThrew = String(error).slice(0, 200);
      }

      out[`${arc} · C positive control: same child WITHOUT drift is refused`] =
        directThrew;
    }
  }

  console.log(JSON.stringify(out, null, 1));
}

main();
