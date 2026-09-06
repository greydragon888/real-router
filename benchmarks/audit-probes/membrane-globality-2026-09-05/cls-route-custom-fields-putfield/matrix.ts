// Классификация семейства «route-custom-fields·putField».
// Строки — двери: A = createRouter·routes[].<customField>,
//                 B = RoutesApi.update·updates (контейнер патча),
//                 C = RoutesApi.update·updates.<customField>.
// Столбцы — эксперимент (а), P1, P2, P3, P4.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

import {
  countingBag,
  countingProxy,
} from "../../../../packages/core/tests/helpers/hostileBags";

const out: Record<string, unknown> = {};
const R = (name: string, path: string): unknown => ({ name, path });

// ── ПОЗИТИВНЫЕ КОНТРОЛИ ШАПКИ ────────────────────────────────────────────────
// Доказательство, что легальный вход ДОХОДИТ до ветки на каждой двери.
{
  const leaf = { schema: 1 };
  const router = createRouter([
    { name: "u", path: "/u/:id?tab", zz: leaf },
  ] as never);

  out["CTRL·A registration custom field landed"] =
    getPluginApi(router).getRouteConfig("u")?.zz === leaf;
  router.dispose();
}
{
  const router = createRouter([R("u", "/u/:id?tab")] as never);

  getRoutesApi(router).update("u", {
    zz: { a: 1 },
    defaultSearch: { tab: "x" },
  } as never);
  out["CTRL·B/C update custom field landed"] =
    getPluginApi(router).getRouteConfig("u")?.zz !== undefined;
  out["CTRL·B structural slot landed (buildPath)"] = router.buildPath("u", {
    id: "7",
  });
  router.dispose();
}

// ============================================================================
// ЭКСПЕРИМЕНТ (а) — оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО контейнера
// ============================================================================

function runA(preCopy: boolean): Record<string, unknown> {
  const leaf = { a: 1 };
  const route: Record<string, unknown> = {
    name: "u",
    path: "/u/:id?tab",
    zz: leaf,
    defaultSearch: { tab: "x" },
  };
  const passed = preCopy ? { ...route } : route;
  const router = createRouter([passed] as never);
  const events: unknown[] = [];

  getRoutesApi(router).subscribeChanges((e: unknown) => {
    events.push(e);
  });

  const record = getPluginApi(router).getRouteConfig("u");
  const got = getRoutesApi(router).get("u") as Record<string, unknown> | undefined;

  // обратная видимость: мутируем ОРИГИНАЛ после конструирования
  route.late = 9;
  (route.zz as Record<string, unknown>).mutatedLeaf = 1;

  const late = record !== undefined && "late" in record;
  const leafMutationVisible =
    record?.zz !== undefined && "mutatedLeaf" in (record.zz as object);

  // мутируем то, что отдало ядро → видит ли оригинал
  if (record !== undefined) {
    (record as Record<string, unknown>).byPlugin = 1;
  }

  const backMutSeen = "byPlugin" in route;
  const res = {
    record: record === undefined ? "none" : "present",
    recordKeys:
      record === undefined
        ? "none"
        : Object.keys(record)
            .filter((k) => k !== "byPlugin")
            .sort()
            .join(","),
    recordIsRoute: (record as unknown) === passed,
    leafSame: record?.zz === leaf,
    getReturnKeys: got === undefined ? "none" : Object.keys(got).sort().join(","),
    getHasCustom: got === undefined ? "none" : "zz" in got,
    path: router.buildPath("u", { id: "7" }),
    stateName: router.getState()?.name ?? "none",
    treeChangedEvents: events.length,
    lateKeyVisible: late,
    leafMutationVisible,
    backMutSeenByCaller: backMutSeen,
  };

  router.dispose();

  return res;
}

out["A·(а) original"] = runA(false);
out["A·(а) pre-copied container"] = runA(true);
out["A·(а) equal?"] =
  JSON.stringify(runA(false)) === JSON.stringify(runA(true));

function runB(preCopy: boolean): Record<string, unknown> {
  const leaf = { a: 1 };
  const patch: Record<string, unknown> = {
    zz: leaf,
    defaultSearch: { tab: "x" },
    defaultParams: { id: "1" },
  };
  const passed = preCopy ? { ...patch } : patch;
  const router = createRouter([R("u", "/u/:id?tab")] as never);
  const events: unknown[] = [];

  getRoutesApi(router).subscribeChanges((e: unknown) => {
    events.push(e);
  });
  getRoutesApi(router).update("u", passed as never);

  const record = getPluginApi(router).getRouteConfig("u");

  patch.late = 9;
  patch.qq = 5;

  const res = {
    recordKeys:
      record === undefined ? "none" : Object.keys(record).sort().join(","),
    leafSame: record?.zz === leaf,
    recordIsPatch: (record as unknown) === passed,
    path: router.buildPath("u", {}),
    lateVisible:
      record !== undefined && ("late" in record || "qq" in record),
    events: events.length,
    eventKind: JSON.stringify(events[0] ?? null),
    getReturnKeys: (() => {
      const g = getRoutesApi(router).get("u") as
        | Record<string, unknown>
        | undefined;

      return g === undefined ? "none" : Object.keys(g).sort().join(",");
    })(),
  };

  router.dispose();

  return res;
}

out["B/C·(а) original"] = runB(false);
out["B/C·(а) pre-copied container"] = runB(true);
out["B/C·(а) equal?"] =
  JSON.stringify(runB(false)) === JSON.stringify(runB(true));

// ============================================================================
// P1 — одно чтение на ключ, дрейфующий/считающий вход
// ============================================================================
{
  const src = { name: "u", path: "/u", zz: { a: 1 }, yy: 2 };
  const cp = countingProxy(src);
  const router = createRouter([cp.bag] as never);

  out["P1·A reads per key (countingProxy on route)"] = { ...cp.reads };
  out["P1·A custom fields landed"] = Object.keys(
    getPluginApi(router).getRouteConfig("u") ?? {},
  ).sort();
  router.dispose();
}
{
  const cb = countingBag({ name: "u2", path: "/u2", zz: { a: 1 } });

  try {
    const router = createRouter([cb.bag] as never);

    out["P1·A accessorBag accepted, reads"] = { ...cb.reads };
    out["P1·A accessorBag custom landed"] = Object.keys(
      getPluginApi(router).getRouteConfig("u2") ?? {},
    );
    router.dispose();
  } catch (error) {
    out["P1·A accessorBag REFUSED"] = String(error);
  }
}
{
  const router = createRouter([R("u", "/u/:id?tab")] as never);
  const cb = countingBag({
    zz: { a: 1 },
    yy: 3,
    defaultSearch: { tab: "x" },
  });

  getRoutesApi(router).update("u", cb.bag as never);
  out["P1·B/C patch reads per key (bare core)"] = { ...cb.reads };
  out["P1·B/C landed"] = Object.keys(
    getPluginApi(router).getRouteConfig("u") ?? {},
  ).sort();
  router.dispose();
}
{
  // дрейф: первое чтение "FIRST", последующие — ядовитые.
  const router = createRouter([R("u", "/u")] as never);
  const drift = countingProxy({ zz: "FIRST" }, (key, nth) =>
    key === "zz" ? (nth === 1 ? "FIRST" : `POISON#${nth}`) : undefined,
  );

  getRoutesApi(router).update("u", drift.bag as never);
  out["P1·B/C drift reads"] = { ...drift.reads };
  out["P1·B/C drift landed value (must be FIRST)"] =
    getPluginApi(router).getRouteConfig("u")?.zz;
  router.dispose();
}
{
  // дрейф на регистрации
  const drift = countingProxy(
    { name: "u", path: "/u", zz: "FIRST" },
    (key, nth) =>
      key === "zz" && nth > 1
        ? `POISON#${nth}`
        : ({ name: "u", path: "/u", zz: "FIRST" } as Record<string, unknown>)[
            key
          ],
  );
  const router = createRouter([drift.bag] as never);

  out["P1·A drift reads"] = { ...drift.reads };
  out["P1·A drift landed value (must be FIRST)"] =
    getPluginApi(router).getRouteConfig("u")?.zz;
  router.dispose();
}

// ============================================================================
// P2 — лгущий Proxy: ownKeys НЕ называет ключ, gOPD утверждает «собственный»
// ============================================================================
function lyingBag(
  visible: Record<string, unknown>,
  hidden: Record<string, unknown>,
): Record<string, unknown> {
  const all = { ...visible, ...hidden };

  return new Proxy(all, {
    ownKeys: () => Reflect.ownKeys(visible),
    getOwnPropertyDescriptor: (t, k) =>
      typeof k === "string" && k in all
        ? { value: all[k], enumerable: true, configurable: true, writable: true }
        : Reflect.getOwnPropertyDescriptor(t, k),
  });
}
{
  const bag = lyingBag({ name: "u", path: "/u", zz: 1 }, { hidden: "HID" });

  try {
    const router = createRouter([bag] as never);
    const rec = getPluginApi(router).getRouteConfig("u");

    out["P2·A record keys (hidden must be absent)"] = Object.keys(
      rec ?? {},
    ).sort();
    out["P2·A hidden leaked?"] = rec !== undefined && "hidden" in rec;
    router.dispose();
  } catch (error) {
    out["P2·A threw"] = String(error);
  }
}
{
  const router = createRouter([R("u", "/u")] as never);
  const bag = lyingBag({ zz: 1 }, { hidden: "HID" });

  getRoutesApi(router).update("u", bag as never);

  const rec = getPluginApi(router).getRouteConfig("u");

  out["P2·B/C record keys (hidden must be absent)"] = Object.keys(
    rec ?? {},
  ).sort();
  out["P2·B/C hidden leaked?"] = rec !== undefined && "hidden" in rec;
  router.dispose();
}
{
  // позитивный контроль инструмента: тот же Proxy, но ownKeys НАЗЫВАЕТ ключ →
  // ключ обязан попасть в запись.
  const router = createRouter([R("u", "/u")] as never);
  const honest = lyingBag({ zz: 1, hidden: "HID" }, {});

  getRoutesApi(router).update("u", honest as never);
  out["P2 CTRL honest proxy: hidden lands"] = Object.keys(
    getPluginApi(router).getRouteConfig("u") ?? {},
  ).sort();
  router.dispose();
}

// ============================================================================
// P3 — унаследованный аксессор под именем ключа + собственный "__proto__"
// ============================================================================
function withInheritedAccessor<T>(name: string, run: (seen: string[]) => T): T {
  const seen: string[] = [];

  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    get(): unknown {
      seen.push("get");

      return "FROM_PROTO";
    },
    set(v: unknown): void {
      seen.push(`set:${String(v)}`);
    },
  });

  try {
    return run(seen);
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (Object.prototype as Record<string, unknown>)[name];
  }
}

out["P3·A inherited accessor"] = withInheritedAccessor("zzHaz", (seen) => {
  let res: unknown;

  try {
    const router = createRouter([
      { name: "u", path: "/u", zzHaz: { v: 1 } },
    ] as never);
    const rec = getPluginApi(router).getRouteConfig("u");

    res = {
      accessorTouched: [...seen],
      ownKey: rec !== undefined && Object.hasOwn(rec, "zzHaz"),
      value: JSON.stringify(rec?.zzHaz),
    };
    router.dispose();
  } catch (error) {
    res = { threw: String(error), accessorTouched: [...seen] };
  }

  return res;
});

out["P3·B/C inherited accessor"] = withInheritedAccessor("zzHaz", (seen) => {
  let res: unknown;

  try {
    const router = createRouter([R("u", "/u")] as never);

    getRoutesApi(router).update("u", { zzHaz: { v: 1 } } as never);

    const rec = getPluginApi(router).getRouteConfig("u");

    res = {
      accessorTouched: [...seen],
      ownKey: rec !== undefined && Object.hasOwn(rec, "zzHaz"),
      value: JSON.stringify(rec?.zzHaz),
    };
    router.dispose();
  } catch (error) {
    res = { threw: String(error), accessorTouched: [...seen] };
  }

  return res;
});

// позитивный контроль инструмента: аксессор ДЕЙСТВИТЕЛЬНО перехватывает
// обычное присваивание на объекте с Object.prototype в цепочке.
out["P3 CTRL plain assignment hits inherited setter"] = withInheritedAccessor(
  "zzHaz",
  (seen) => {
    const target: Record<string, unknown> = {};

    target.zzHaz = { v: 1 };

    return { seen: [...seen], ownKey: Object.hasOwn(target, "zzHaz") };
  },
);

{
  const parsed = JSON.parse(
    '{"__proto__": {"polluted": 1}, "keep": 1}',
  ) as Record<string, unknown>;

  out["P3 fixture control: parsed has own __proto__"] = Object.hasOwn(
    parsed,
    "__proto__",
  );

  const routeObj: Record<string, unknown> = { name: "u", path: "/u" };

  for (const k of Object.keys(parsed)) {
    Object.defineProperty(routeObj, k, {
      value: parsed[k],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  out["P3·A route literal keeps own __proto__"] = Object.hasOwn(
    routeObj,
    "__proto__",
  );

  const router = createRouter([routeObj] as never);
  const rec = getPluginApi(router).getRouteConfig("u");

  out["P3·A record own __proto__"] =
    rec !== undefined && Object.hasOwn(rec, "__proto__");
  out["P3·A record prototype intact"] =
    rec !== undefined && Object.getPrototypeOf(rec) === Object.prototype;
  out["P3·A record polluted?"] =
    rec !== undefined && (rec as Record<string, unknown>).polluted !== undefined;
  out["P3·A record own keys"] = Object.keys(rec ?? {}).sort();
  router.dispose();
}
{
  const router = createRouter([R("u", "/u")] as never);
  const parsed = JSON.parse(
    '{"__proto__": {"polluted": 1}, "keep": 1}',
  ) as Record<string, unknown>;

  getRoutesApi(router).update("u", parsed as never);

  const rec = getPluginApi(router).getRouteConfig("u");

  out["P3·B/C record own __proto__"] =
    rec !== undefined && Object.hasOwn(rec, "__proto__");
  out["P3·B/C record prototype intact"] =
    rec !== undefined && Object.getPrototypeOf(rec) === Object.prototype;
  out["P3·B/C record own keys"] = Object.keys(rec ?? {}).sort();
  out["P3·B/C ({}).polluted after"] = ({} as Record<string, unknown>).polluted;
  router.dispose();
}

// ============================================================================
// P4 — заморозка: уровень ядра vs вложенный контейнер вызывающего
// ============================================================================
{
  const leaf = { a: 1 };
  const route: Record<string, unknown> = { name: "u", path: "/u", zz: leaf };
  const router = createRouter([route] as never);
  const rec = getPluginApi(router).getRouteConfig("u");

  out["P4·A caller leaf frozen?"] = Object.isFrozen(leaf);
  out["P4·A caller route object frozen?"] = Object.isFrozen(route);
  out["P4·A core record frozen?"] = Object.isFrozen(rec);
  router.dispose();
}
{
  const leaf = { a: 1 };
  const patch: Record<string, unknown> = { zz: leaf };
  const router = createRouter([R("u", "/u")] as never);

  getRoutesApi(router).update("u", patch as never);

  const rec = getPluginApi(router).getRouteConfig("u");

  out["P4·B/C caller leaf frozen?"] = Object.isFrozen(leaf);
  out["P4·B/C caller patch frozen?"] = Object.isFrozen(patch);
  out["P4·B/C core record frozen?"] = Object.isFrozen(rec);
  router.dispose();
}

// ============================================================================
// ПУТИ К ОДНОМУ ОБЪЕКТУ ЯДРА: A (регистрация) и C (update) пишут в
// store.routeCustomFields[name] — clone-on-write у C
// ============================================================================
{
  const router = createRouter([{ name: "u", path: "/u", zz: 1 }] as never);
  const rec1 = getPluginApi(router).getRouteConfig("u");

  getRoutesApi(router).update("u", { yy: 2 } as never);

  const rec2 = getPluginApi(router).getRouteConfig("u");

  out["paths · A record !== C record (clone-on-write)"] = rec1 !== rec2;
  out["paths · A record keys after C"] = Object.keys(rec1 ?? {}).sort();
  out["paths · C record keys"] = Object.keys(rec2 ?? {}).sort();
  router.dispose();
}

// ============================================================================
// P1 с validation-plugin — у контейнера вызывающего ДВА независимых читателя
// ============================================================================
{
  const router = createRouter([R("u", "/u/:id?tab")] as never);

  router.usePlugin(validationPlugin() as never);

  const cb = countingBag({
    zz: { a: 1 },
    defaultSearch: { tab: "x" },
    forwardTo: undefined as unknown as string,
  });

  getRoutesApi(router).update("u", cb.bag as never);
  out["P1·B patch reads per key (validation-plugin)"] = { ...cb.reads };
  out["P1·B landed (validation-plugin)"] = Object.keys(
    getPluginApi(router).getRouteConfig("u") ?? {},
  ).sort();
  router.dispose();
}
{
  // дрейф структурного ключа при установленном плагине: валидатор судит по
  // первому чтению, ядро применяет второе?
  const router = createRouter([R("u", "/u/:id?tab")] as never);

  router.usePlugin(validationPlugin() as never);

  const drift = countingProxy({ defaultSearch: { tab: "x" } }, (key, nth) =>
    key === "defaultSearch"
      ? nth === 1
        ? { tab: "x" }
        : { tab: `POISON#${nth}` }
      : undefined,
  );

  try {
    getRoutesApi(router).update("u", drift.bag as never);
    out["P1·B drift reads (validation-plugin)"] = { ...drift.reads };
    out["P1·B drift buildPath (FIRST would be tab=x)"] = router.buildPath("u", {
      id: "7",
    });
  } catch (error) {
    out["P1·B drift threw (validation-plugin)"] = String(error);
    out["P1·B drift reads (validation-plugin)"] = { ...drift.reads };
  }

  router.dispose();
}

{
  // КОНТРОЛЬ той же пробы БЕЗ плагина: расхождение обязано исчезнуть.
  const router = createRouter([R("u", "/u/:id?tab")] as never);
  const drift = countingProxy({ defaultSearch: { tab: "x" } }, (key, nth) =>
    key === "defaultSearch"
      ? nth === 1
        ? { tab: "x" }
        : { tab: `POISON#${nth}` }
      : undefined,
  );

  getRoutesApi(router).update("u", drift.bag as never);
  out["P1·B drift reads (bare core CONTROL)"] = { ...drift.reads };
  out["P1·B drift buildPath (bare core CONTROL)"] = router.buildPath("u", {
    id: "7",
  });
  router.dispose();
}

for (const [k, v] of Object.entries(out)) {
  console.log(`${k}: ${JSON.stringify(v)}`);
}
