// Матрица семейства «живое-дерево-и-store · один объект × 5 путей».
// Строки — двери (PluginApi.getTree·return, RouterInternals.getTree·return,
// PluginApi.getTree·return.<leaf>.children, RouterInternals.routeGetStore·return,
// RouterInternals.routeGetStore·return.tree); столбцы — идентичность, эксперимент (а),
// round-trip, P1..P4. Позитивные контроли — в каждой секции.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { getRouteUtils } from "@real-router/route-utils";

const out: Record<string, unknown> = {};
const DEFS = [
  { name: "home", path: "/home", children: [{ name: "kid", path: "/kid" }] },
  { name: "u", path: "/u/:id" },
] as never;

const mk = () => {
  const r = createRouter(DEFS, {} as never);
  return {
    r,
    api: getPluginApi(r) as any,
    int: getInternals(r) as any,
    routes: getRoutesApi(r) as any,
  };
};

// ───────────── S1. ИДЕНТИЧНОСТЬ: один объект на пяти путях ─────────────
{
  const { api, int } = mk();
  const t1 = api.getTree();
  out.S1_pluginApiTree_eq_internalsTree = t1 === int.getTree();
  out.S1_pluginApiTree_eq_storeSlotTree = t1 === int.routeGetStore().tree;
  out.S1_storeSameAcrossCalls = int.routeGetStore() === int.routeGetStore();
  out.S1_treeStableAcrossCalls = api.getTree() === api.getTree();
  const leaf = t1.children.get("u");
  const kid = t1.children.get("home").children.get("kid");
  out.S1_leafChildrenIsSameSentinel = leaf.children === kid.children;
  const other = mk();
  out.S1_leafSentinelSharedAcrossRouters =
    leaf.children === other.api.getTree().children.get("u").children;
}

// ───────────── S2. ЭКСПЕРИМЕНТ (а): копия контейнера на границе выдачи ─────────────
// (а) для хэндаута = отдать копию контейнера вместо живой ссылки.
{
  const { api, int, routes } = mk();
  const live = api.getTree();
  const copyOf = (t: any) => ({ ...t }); // мелкая копия: листья те же ссылки

  // (2a) реальный потребитель идентичности: packages/route-utils · getRouteUtils (WeakMap по корню)
  out.S2a_ctl_liveHandle_sameUtilsAcrossCalls =
    getRouteUtils(api.getTree()) === getRouteUtils(api.getTree());
  const u1 = getRouteUtils(copyOf(api.getTree()) as any);
  const u2 = getRouteUtils(copyOf(api.getTree()) as any);
  const u3 = getRouteUtils(copyOf(api.getTree()) as any);
  out.S2a_copyPerCall_distinctUtils = new Set([u1, u2, u3]).size;
  out.S2a_copyPerCall_isCacheMiss = u1 !== u2;

  // (2b) реальный предикат инвалидации: search-schema-plugin · plugin.ts `tree !== this.#cachedTree`
  let cached: unknown;
  const invalidatedLive = [0, 1, 2].filter(() => {
    const t = api.getTree();
    const inv = t !== cached;
    cached = t;
    return inv;
  }).length;
  let cached2: unknown;
  const invalidatedCopy = [0, 1, 2].filter(() => {
    const t = copyOf(api.getTree());
    const inv = t !== cached2;
    cached2 = t;
    return inv;
  }).length;
  out.S2b_invalidations_liveHandle_of3 = invalidatedLive; // 1 = только первый вызов
  out.S2b_invalidations_copyPerCall_of3 = invalidatedCopy; // 3 = кэш сброшен каждый вызов

  // (2c) store: копия контейнера на границе против живой ручки
  const storeLive = int.routeGetStore();
  const storeCopy = { ...storeLive };
  routes.add([{ name: "late", path: "/late" }] as never);
  out.S2c_ctl_liveStore_seesLateRoute = storeLive.matcher.hasRoute("late");
  out.S2c_copyStore_seesLateRoute = storeCopy.matcher.hasRoute("late");
  out.S2c_copyStore_treeStale = storeCopy.tree !== storeLive.tree;
  out.S2c_liveStore_treeSlotRebuilt = storeLive.tree === api.getTree();
  void live;
}

// ───────────── S3. ROUND-TRIP: ядро читает отданный объект обратно ─────────────
{
  const { api, int, routes, r } = mk();
  out.S3_ctl_hasBefore = routes.has("legalz");
  routes.add([{ name: "legalz", path: "/legalz" }] as never);
  out.S3_ctl_hasAfter = routes.has("legalz"); // позитивный контроль судьи

  const t = api.getTree();
  const home = t.children.get("home");
  const fake = {
    ...home,
    name: "__inj__",
    fullName: "__inj__",
    path: "/inj",
    children: new Map(),
  };
  let v = "no-throw";
  try {
    t.children.set("__inj__", fake);
  } catch (e) {
    v = "throw:" + (e as Error).name;
  }
  out.S3_rootChildrenSetVerdict = v;
  out.S3_definitionsCarryInjected = int
    .routeGetStore()
    .definitions.some((d: any) => d.name === "__inj__");
  out.S3_hasRoute_beforeRebuild = routes.has("__inj__");
  routes.add([{ name: "spare", path: "/spare" }] as never); // любой rebuild
  out.S3_hasRoute_afterRebuild = routes.has("__inj__");
  try {
    out.S3_buildPath_injected = r.buildPath("__inj__", {} as never);
  } catch (e) {
    out.S3_buildPath_injected = "throw:" + (e as Error).message;
  }

  // тот же round-trip через ЛИСТ-сентинел — в чужой роутер и в роутер, созданный ПОСЛЕ
  const leaf = api.getTree().children.get("u");
  leaf.children.set("__leak__", {
    ...home,
    name: "__leak__",
    fullName: "u.__leak__",
    path: "/leak",
    children: new Map(),
  });
  const fresh = mk();
  out.S3_freshRouter_hasLeakAtConstruction = fresh.routes.has("u.__leak__");
  leaf.children.delete("__leak__"); // уборка процессного сентинела
  out.S3_afterCleanup_freshRouterClean = !mk().routes.has("u.__leak__");
}

// ───────────── S4. P1: ровно одно чтение на ключ на ОБРАТНОМ пути ─────────────
// Обратный путь = routesStore `get definitions()` → engine/operations/routeTreeToDefinitions · nodeToDefinition.
{
  const { api, int } = mk();
  const t = api.getTree();
  const reads: Record<string, number> = { name: 0, path: 0, absolute: 0, children: 0 };
  const realKid = t.children.get("home").children.get("kid");
  let childrenTick = 0;
  const drifting = {
    get name() {
      reads.name++;
      return "__p1__";
    },
    get path() {
      reads.path++;
      return "/p1";
    },
    get absolute() {
      reads.absolute++;
      return false;
    },
    get children() {
      reads.children++;
      childrenTick++;
      // ДРЕЙФУЮЩИЙ вход: первое чтение говорит «дети есть», второе — отдаёт пустую карту
      return childrenTick === 1 ? new Map([["ghost", realKid]]) : new Map();
    },
  };
  t.children.set("__p1__", drifting as never);
  const defs = int.routeGetStore().definitions;
  out.S4_readsPerKey = { ...reads };
  const mine = defs.find((d: any) => d.name === "__p1__");
  out.S4_reachedBranch = mine !== undefined; // вход ДОШЁЛ до nodeToDefinition
  out.S4_childrenReadCount = reads.children;
  out.S4_resultTakenFromSecondRead_childrenLen = mine?.children?.length;
  out.S4_p1_violated_childrenReadTwice = reads.children > 1;
  t.children.delete("__p1__");
}

// ───────────── S5. P2: перечисление ключей / hasOwn на объекте вызывающего ─────────────
{
  const { api, int } = mk();
  const t = api.getTree();
  const traps: Record<string, string[]> = { ownKeys: [], has: [], gopd: [], get: [] };
  const target = { name: "__p2__", path: "/p2", absolute: false, children: new Map() };
  const lying = new Proxy(target as any, {
    ownKeys(tt) {
      traps.ownKeys.push("*");
      return Reflect.ownKeys(tt).filter((k) => k !== "name"); // ЛЖЁТ: скрывает name
    },
    getOwnPropertyDescriptor(tt, k) {
      traps.gopd.push(String(k));
      return Reflect.getOwnPropertyDescriptor(tt, k);
    },
    has(tt, k) {
      traps.has.push(String(k));
      return Reflect.has(tt, k);
    },
    get(tt, k, rec) {
      traps.get.push(String(k));
      return Reflect.get(tt, k, rec);
    },
  });
  t.children.set("__p2__", lying as never);
  const defs = int.routeGetStore().definitions;
  out.S5_reachedBranch = defs.some((d: any) => d.name === "__p2__");
  out.S5_ownKeysCalls = traps.ownKeys.length;
  out.S5_hasCalls = traps.has.length;
  out.S5_gopdCalls = traps.gopd.length;
  out.S5_getKeys = traps.get.join(",");
  out.S5_hiddenKeyStillLanded = defs.some((d: any) => d.name === "__p2__");
  t.children.delete("__p2__");
}

// ───────────── S6. P3: унаследованный аксессор / собственный __proto__ ─────────────
{
  const { api, int } = mk();
  const t = api.getTree();
  // Контроль ДО подмены прототипа: вложенные дети доезжают в definitions.
  const before = int.routeGetStore().definitions.find((d: any) => d.name === "home");
  out.S6_ctl_childrenPresentBeforeProtoTrap = before?.children?.length;

  let setterFired = 0;
  let verdict = "no-throw";
  let childrenAfter: unknown = "unset";
  try {
    Object.defineProperty(Object.prototype, "children", {
      configurable: true,
      get() {
        return undefined;
      },
      set(v: unknown) {
        setterFired++;
        void v;
      },
    });
    const defs = int.routeGetStore().definitions;
    const homeDef = defs.find((d: any) => d.name === "home");
    childrenAfter = homeDef === undefined ? "no-home-def" : homeDef.children;
  } catch (e) {
    verdict = "throw:" + (e as Error).name + ":" + (e as Error).message;
  } finally {
    delete (Object.prototype as any).children;
  }
  out.S6_inheritedSetterFired = setterFired;
  out.S6_verdictOnDefinitionsRead = verdict;
  out.S6_childrenAfterTrap =
    childrenAfter === undefined ? "undefined" : (childrenAfter as unknown);
  // после finally контроль повторно
  out.S6_ctl_childrenPresentAfterCleanup = int
    .routeGetStore()
    .definitions.find((d: any) => d.name === "home")?.children?.length;

  // собственный ключ "__proto__" из JSON.parse в узле, подсаженном через дверь
  const evil = JSON.parse('{"name":"__pp__","path":"/pp","__proto__":{"polluted":1}}');
  evil.children = new Map();
  evil.absolute = false;
  t.children.set("__pp__", evil);
  const defs2 = int.routeGetStore().definitions;
  const d = defs2.find((x: any) => x.name === "__pp__");
  out.S6_protoKey_reached = d !== undefined;
  out.S6_protoKey_pollutedObjectPrototype = String(({} as any).polluted);
  out.S6_protoKey_defProtoIsObjectPrototype =
    d !== undefined && Object.getPrototypeOf(d) === Object.prototype;
  t.children.delete("__pp__");
}

// ─── S6b. P3, следствие: rebuild под унаследованным аксессором теряет вложенные маршруты ───
{
  const { routes } = mk();
  out.S6b_ctl_hasNestedBefore = routes.has("home.kid"); // позитивный контроль
  try {
    Object.defineProperty(Object.prototype, "children", {
      configurable: true,
      get() {
        return undefined;
      },
      set() {
        /* глотает запись ядра `def.children = …` */
      },
    });
    routes.add([{ name: "trigger", path: "/trigger" }] as never); // rebuild из definitions
  } finally {
    delete (Object.prototype as any).children;
  }
  out.S6b_hasNestedAfterRebuildUnderTrap = routes.has("home.kid");
  out.S6b_hasTopLevelAfterRebuildUnderTrap = routes.has("home");
}

// ───────────── S7. P4: какие уровни заморожены ─────────────
{
  const { api, int, routes } = mk();
  const t = api.getTree();
  const u = t.children.get("u");
  out.S7_rootFrozen = Object.isFrozen(t);
  out.S7_nodeFrozen = Object.isFrozen(u);
  out.S7_childrenMapShellFrozen = Object.isFrozen(t.children);
  out.S7_paramMetaFrozen = Object.isFrozen(u.paramMeta);
  out.S7_urlParamsFrozen = Object.isFrozen(u.paramMeta?.urlParams ?? u.urlParams);
  let nodeWrite = "no-throw";
  try {
    (u as any).path = "/hacked";
  } catch (e) {
    nodeWrite = "throw:" + (e as Error).name;
  }
  out.S7_nodeFieldWriteVerdict = nodeWrite;
  let mapWrite = "no-throw";
  try {
    t.children.set("__f__", {
      ...u,
      name: "__f__",
      fullName: "__f__",
      path: "/f",
      children: new Map(),
    });
  } catch (e) {
    mapWrite = "throw:" + (e as Error).name;
  }
  out.S7_frozenMapEntryWriteVerdict = mapWrite; // freeze не запирает записи Map
  // уровень ВЫЗЫВАЮЩЕГО, прошедший через дверь, не должен стать frozen
  const callerNode: any = { name: "__own__", path: "/own", absolute: false, children: new Map() };
  t.children.set("__own__", callerNode);
  routes.add([{ name: "spare2", path: "/spare2" }] as never); // rebuild читает обратно
  out.S7_callerObjectFrozenAfterRebuild = Object.isFrozen(callerNode);
  out.S7_storeFrozen = Object.isFrozen(int.routeGetStore());
  const st = int.routeGetStore();
  out.S7_storeTreeSlotWritable = !!Object.getOwnPropertyDescriptor(st, "tree")?.writable;
  out.S7_storeMatcherOptionsWritable = !!Object.getOwnPropertyDescriptor(st, "matcherOptions")
    ?.writable;
  t.children.delete("__own__");
}

console.log(JSON.stringify(out, null, 1));
