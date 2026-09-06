// MATRIX A — идентичность контейнеров и эксперимент (а) для семейства
// «валидатор·батчи-патчи-и-объекты-маршрута».
//
// Два объекта на восемь дверей:
//   OBJ-1 «patch»  — контейнер ВЫЗЫВАЮЩЕГО, три читателя-валидатора
//                    (validateUpdateRouteBasicArgs / validateUpdateRoutePropertyTypes /
//                     validateUpdateRoute) + commitRouteUpdate.
//   OBJ-2 «batch»  — СНАПШОТ ЯДРА (snapshotRouteBatch), пять читателей-валидаторов
//                    (guardRouteCallbacks / guardNoAsyncCallbacks по элементу,
//                     throwIfInternalRouteInArray / validateAddRouteArgs / validateRoutes
//                     по массиву) + addRoutes/replaceRoutes.
//
// Позитивные контроли — в каждой секции; арма «control» отключает воздействие,
// расхождение арм доказывает, что вход дошёл до ветки.
import { createRouter } from "@real-router/core";
import { getRoutesApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

/* eslint-disable */
type Any = any;

const out: Record<string, unknown>[] = [];
const say = (row: string, data: Record<string, unknown>) =>
  out.push({ row, ...data });

function fresh(routes: Any[] = [{ name: "root", path: "/root" }]): Any {
  return createRouter(routes as Any, {} as Any);
}

function withPlugin(routes: Any[] = [{ name: "root", path: "/root" }]): Any {
  const r = fresh(routes);
  r.usePlugin(validationPlugin() as Any);
  return r;
}

/** Ставит записывающий валидатор в тот же слот, что и validation-plugin. */
function installSpy(
  router: Any,
  onCall: (method: string, args: unknown[]) => void,
): void {
  const validator = new Proxy(
    {},
    {
      get: (_t, group) =>
        new Proxy(
          {},
          {
            get:
              (_t2, m) =>
              (...args: unknown[]) => {
                onCall(`${String(group)}.${String(m)}`, args);
              },
          },
        ),
    },
  );
  (getInternals(router) as Any).validator = validator;
}

/** Оборачивает УЖЕ поставленный валидатор: подменяет аргумент-контейнер. */
function wrapValidator(
  router: Any,
  transform: (method: string, args: unknown[]) => unknown[],
): void {
  const inner = (getInternals(router) as Any).validator;
  const wrapped = new Proxy(inner, {
    get: (target, group) => {
      const g = (target as Any)[group];
      if (!g || typeof g !== "object") return g;
      return new Proxy(g, {
        get: (gt, m) => {
          const fn = (gt as Any)[m];
          if (typeof fn !== "function") return fn;
          return (...args: unknown[]) =>
            fn.apply(gt, transform(`${String(group)}.${String(m)}`, args));
        },
      });
    },
  });
  (getInternals(router) as Any).validator = wrapped;
}

/** Копия КОНТЕЙНЕРА (листья — те же ссылки); для массива — новый массив копий. */
function copyRoute(route: Any): Any {
  const c = { ...route };
  if (Array.isArray(c.children)) c.children = c.children.map(copyRoute);
  return c;
}
function copyBatch(b: Any): Any {
  return Array.isArray(b) ? b.map(copyRoute) : b;
}

/** Ровно пять методов-читателей батча/элемента этого семейства. */
const BATCH_METHODS = new Set([
  "routes.guardRouteCallbacks",
  "routes.guardNoAsyncCallbacks",
  "routes.throwIfInternalRouteInArray",
  "routes.validateAddRouteArgs",
  "routes.validateRoutes",
]);
/** Копия контейнера ровно для этих пяти; прочие аргументы — нетронуты. */
function copyForBatchDoor(m: string, args: unknown[]): unknown[] {
  if (!BATCH_METHODS.has(m)) return args;
  const a0 = args[0];
  if (Array.isArray(a0)) return [copyBatch(a0), ...args.slice(1)];
  if (a0 && typeof a0 === "object") return [copyRoute(a0), ...args.slice(1)];
  return args;
}

function observe(router: Any, names: string[]): Record<string, unknown> {
  const api = getRoutesApi(router);
  const plug = getPluginApi(router);
  const snap: Record<string, unknown> = {};
  for (const n of names) {
    const g = api.get(n) as Any;
    snap[n] = g
      ? {
          name: g.name,
          path: g.path,
          forwardTo: typeof g.forwardTo === "function" ? "[fn]" : g.forwardTo,
          defaultParams: g.defaultParams,
          defaultSearch: g.defaultSearch,
          hasDecode: typeof g.decodeParams === "function",
          hasEncode: typeof g.encodeParams === "function",
          hasCanActivate: typeof g.canActivate === "function",
          children: Array.isArray(g.children)
            ? g.children.map((c: Any) => `${c.name}:${c.path}`)
            : undefined,
        }
      : null;
    snap[`${n}#config`] = plug.getRouteConfig(n);
    try {
      snap[`${n}#build`] = router.buildPath(n, {});
    } catch (e) {
      snap[`${n}#build`] = `THROWN ${(e as Error).name}`;
    }
  }
  return snap;
}

// ===========================================================================
// A1. OBJ-2 «batch»: чей это контейнер и один ли он на пять читателей
// ===========================================================================
{
  const r = fresh();
  const callerLeafDefaults: Record<string, string> = { id: "leaf" };
  const callerChild = { name: "kid", path: "/kid" };
  const callerRoute: Any = {
    name: "b1",
    path: "/b1/:id",
    defaultParams: callerLeafDefaults,
    children: [callerChild],
  };
  const callerArray = [callerRoute];

  const seen: Record<string, unknown[]> = {};
  installSpy(r, (m, args) => {
    (seen[m] ??= []).push(args[0]);
  });
  getRoutesApi(r).add(callerArray as Any);

  const arrays = [
    ...(seen["routes.throwIfInternalRouteInArray"] ?? []),
    ...(seen["routes.validateAddRouteArgs"] ?? []),
    ...(seen["routes.validateRoutes"] ?? []),
  ];
  const elems = [
    ...(seen["routes.guardRouteCallbacks"] ?? []),
    ...(seen["routes.guardNoAsyncCallbacks"] ?? []),
  ];
  say("A1 batch identity", {
    arrayReaders: arrays.length,
    elementReaders: elems.length,
    everyArrayIsSameObject: arrays.every((a) => a === arrays[0]),
    arrayIsCallerArray: arrays[0] === callerArray,
    parentElemIsCallerRoute: elems[0] === callerRoute,
    everyParentElemSame:
      elems.filter((e: Any) => e?.name === "b1").every((e) => e === elems[0]) &&
      arrays[0] !== undefined &&
      (arrays[0] as Any[])[0] === elems[0],
    childElemIsCallerChild: elems.some((e) => e === callerChild),
    childrenArrayIsCallers: (elems[0] as Any).children === callerRoute.children,
    nestedDefaultParamsIsCallers:
      (elems[0] as Any).defaultParams === callerLeafDefaults,
    registeredDefaultParamsIsCallers:
      (getRoutesApi(r).get("b1") as Any).defaultParams === callerLeafDefaults,
  });
}

// ===========================================================================
// A2. OBJ-1 «patch»: чей это контейнер, сколько читателей, в каком порядке
// ===========================================================================
{
  const r = fresh([{ name: "root", path: "/root" }, { name: "home", path: "/home/:id" }]);
  const leaf: Record<string, string> = { id: "7" };
  const patch: Any = { defaultParams: leaf, forwardTo: "root", zzCustom: { a: 1 } };
  const order: string[] = [];
  const ids: unknown[] = [];
  installSpy(r, (m, args) => {
    if (m.startsWith("routes.validateUpdateRoute")) {
      order.push(m);
      ids.push(args[1]);
    }
  });
  getRoutesApi(r).update("home", patch);
  say("A2 patch identity", {
    readerOrder: order,
    everyReaderGotCallerPatch: ids.every((o) => o === patch),
    readers: ids.length,
    storedConfigIsPatch: getPluginApi(r).getRouteConfig("home") === patch,
    registeredDefaultParamsIsCallersLeaf:
      (getRoutesApi(r).get("home") as Any).defaultParams === leaf,
  });
}

// ===========================================================================
// A3. Эксперимент (а) на OBJ-2 «batch»:
//     плагину (НАСТОЯЩЕМУ validation-plugin) отдаётся КОПИЯ контейнера.
//     Наблюдаемые следствия сравниваются с сегодняшним поведением.
// ===========================================================================
{
  const build = (mode: "today" | "copy-at-boundary" | "mutating-plugin") => {
    const r = withPlugin();
    if (mode === "copy-at-boundary") {
      wrapValidator(r, copyForBatchDoor);
    }
    if (mode === "mutating-plugin") {
      wrapValidator(r, (m, args) => {
        if (m === "routes.validateRoutes") (args[0] as Any)[0].path = "/HIJACKED";
        return args;
      });
    }
    const leaf = { id: "9" };
    const events: unknown[] = [];
    getRoutesApi(r).subscribeChanges((e: Any) =>
      events.push({
        op: e.op,
        added: (e.added ?? []).map((x: Any) => `${x.name}:${x.path}`),
        addedFrozen: (e.added ?? []).map((x: Any) => Object.isFrozen(x)),
      }),
    );
    getRoutesApi(r).add([
      {
        name: "c1",
        path: "/c1/:id",
        defaultParams: leaf,
        children: [{ name: "kid", path: "/kid" }],
        zzCustom: { tag: "leafy" },
      },
    ] as Any);
    return {
      obs: observe(r, ["c1", "c1.kid"]),
      events,
      leafFrozen: Object.isFrozen(leaf),
      leafStillCallers:
        (getRoutesApi(r).get("c1") as Any).defaultParams === leaf,
    };
  };

  const today = build("today");
  const copied = build("copy-at-boundary");
  const hijack = build("mutating-plugin");
  const j = (x: unknown) => JSON.stringify(x);
  say("A3 experiment (a) · batch", {
    todayEqualsCopyAtBoundary: j(today) === j(copied),
    today: today.obs["c1"],
    copy: copied.obs["c1"],
    todayEvents: today.events,
    copyEvents: copied.events,
    mutatingPluginRegisteredPath: (hijack.obs["c1"] as Any)?.path,
    positiveControl_mutationDiffersFromToday:
      j(hijack.obs["c1"]) !== j(today.obs["c1"]),
  });
}

// ===========================================================================
// A4. Эксперимент (а) на OBJ-2 «batch», арка REPLACE
// ===========================================================================
{
  const run = (copy: boolean) => {
    const r = withPlugin([{ name: "root", path: "/root" }]);
    if (copy) wrapValidator(r, copyForBatchDoor);
    getRoutesApi(r).replace([
      { name: "r1", path: "/r1/:id", defaultParams: { id: "z" } },
    ] as Any);
    return observe(r, ["r1"]);
  };
  const a = run(false);
  const b = run(true);
  say("A4 experiment (a) · replace arc", {
    equal: JSON.stringify(a) === JSON.stringify(b),
    today: a["r1"],
    copy: b["r1"],
  });
}

// ===========================================================================
// A5. Эксперимент (а) на OBJ-1 «patch»: дверь получает ОРИГИНАЛ и КОПИЮ
//     (мелкая копия: новый контейнер, листья — те же ссылки)
// ===========================================================================
{
  const run = (mode: "original" | "shallow-copy") => {
    const r = withPlugin([
      { name: "root", path: "/root" },
      { name: "home", path: "/home/:id" },
    ]);
    const leaf: Record<string, string> = { id: "42" };
    const custom = { tag: "svc" };
    const patch: Any = {
      defaultParams: leaf,
      forwardTo: "root",
      decodeParams: (c: Any) => c,
      zzCustom: custom,
    };
    const events: unknown[] = [];
    getRoutesApi(r).subscribeChanges((e: Any) =>
      events.push({ op: e.op, name: e.name, patchKeys: Object.keys(e.patch ?? {}) }),
    );
    getRoutesApi(r).update("home", mode === "original" ? patch : { ...patch });
    const after = observe(r, ["home"]);
    // обратная видимость: мутируем ОРИГИНАЛ ПОСЛЕ вызова
    patch.forwardTo = "POST-WRITE";
    (patch as Any).zzCustom = { tag: "POST" };
    const afterPostWrite = observe(r, ["home"]);
    // мутируем ЛИСТ (он по ссылке в обеих армах)
    leaf.id = "leaf-mutated";
    return {
      after,
      coreSawPostPatchWrite: JSON.stringify(after) !== JSON.stringify(afterPostWrite),
      events,
      leafIdentityKept: (getRoutesApi(r).get("home") as Any).defaultParams === leaf,
      leafMutationVisible:
        ((getRoutesApi(r).get("home") as Any).defaultParams as Any).id ===
        "leaf-mutated",
      customIdentityKept:
        (getPluginApi(r).getRouteConfig("home") as Any).zzCustom === custom,
      patchFrozen: Object.isFrozen(patch),
      leafFrozen: Object.isFrozen(leaf),
    };
  };
  const orig = run("original");
  const cop = run("shallow-copy");
  say("A5 experiment (a) · patch", {
    equal: JSON.stringify(orig) === JSON.stringify(cop),
    original: orig,
    copy: cop,
  });
}

// ===========================================================================
// A6. Позитивный контроль эквивалентности: копия НЕ обезоруживает валидатор
//     (тот же отказ на невалидном входе в обеих армах)
// ===========================================================================
{
  const attempt = (copy: boolean, fn: (api: Any) => void) => {
    const r = withPlugin([
      { name: "root", path: "/root" },
      { name: "home", path: "/home/:id" },
    ]);
    if (copy)
      wrapValidator(r, (m, args) => {
        if (BATCH_METHODS.has(m)) return copyForBatchDoor(m, args);
        // патч-двери: копия КОНТЕЙНЕРА патча (листья — те же ссылки)
        if (
          m === "routes.validateUpdateRouteBasicArgs" ||
          m === "routes.validateUpdateRoutePropertyTypes" ||
          m === "routes.validateUpdateRoute"
        ) {
          const upd = args[1];
          return upd && typeof upd === "object" && !Array.isArray(upd)
            ? [args[0], { ...(upd as Any) }, ...args.slice(2)]
            : args;
        }
        return args;
      });
    try {
      fn(getRoutesApi(r));
      return "NO THROW";
    } catch (e) {
      return `${(e as Error).name}: ${(e as Error).message}`;
    }
  };
  const cases: [string, (api: Any) => void][] = [
    ["dup name in batch", (api) => api.add([{ name: "d", path: "/d" }, { name: "d", path: "/d2" }])],
    ["async canActivate", (api) => api.add([{ name: "e", path: "/e", canActivate: async () => true }])],
    ["internal name", (api) => api.add([{ name: "@@x", path: "/x" }])],
    ["bad forwardTo target", (api) => api.update("home", { forwardTo: "ghost" })],
    ["bad defaultParams type", (api) => api.update("home", { defaultParams: 5 })],
  ];
  for (const [label, fn] of cases) {
    const a = attempt(false, fn);
    const b = attempt(true, fn);
    say("A6 refusal parity", { case: label, today: a, withCopy: b, same: a === b });
  }
}

// ===========================================================================
// A7. MUST-(б)? Пишет ли НАСТОЯЩИЙ валидатор в переданные ему контейнеры
// ===========================================================================
{
  const writes: string[] = [];
  const r = withPlugin([
    { name: "root", path: "/root" },
    { name: "home", path: "/home/:id" },
  ]);
  const watch = (obj: Any, label: string): Any =>
    Array.isArray(obj) || (obj && typeof obj === "object")
      ? new Proxy(obj, {
          set: (t, k, v, rec) => {
            writes.push(`${label}.${String(k)}`);
            return Reflect.set(t, k, v, rec);
          },
          defineProperty: (t, k, d) => {
            writes.push(`define ${label}.${String(k)}`);
            return Reflect.defineProperty(t, k, d);
          },
          deleteProperty: (t, k) => {
            writes.push(`delete ${label}.${String(k)}`);
            return Reflect.deleteProperty(t, k);
          },
        })
      : obj;
  wrapValidator(r, (m, args) => {
    if (BATCH_METHODS.has(m)) return [watch(args[0], m), ...args.slice(1)];
    if (m.startsWith("routes.validateUpdateRoute"))
      return [args[0], watch(args[1], m), ...args.slice(2)];
    return args;
  });
  getRoutesApi(r).add([
    { name: "w1", path: "/w1/:id", defaultParams: { id: "1" }, children: [{ name: "k", path: "/k" }] },
  ] as Any);
  getRoutesApi(r).update("home", { defaultParams: { id: "2" }, zzCustom: 1 } as Any);
  say("A7 does the real validator write into what it is handed", {
    writes,
    writeCount: writes.length,
  });
}

console.log(JSON.stringify(out, null, 1));
