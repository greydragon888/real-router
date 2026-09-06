// МАТРИЦА семейства «экземпляр-Router-через-мембрану · один объект × 8 путей».
// Строки — 8 дверей, столбцы — эксперимент (а), P1, P2, P3, P4.
// Объект двери ОДИН — экземпляр Router, построенный ядром (createRouter).
// Шапка: позитивные контроли (роутер жив, гвард исполняется, фабрики зовутся).
import { createRouter } from "@real-router/core";
import {
  getRoutesApi,
  getLifecycleApi,
  getPluginApi,
} from "@real-router/core/api";
import { getNavigator } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";

const out: Record<string, unknown> = {};
const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

// --- копии контейнера на границе (листья — те же ссылки) ---------------------
// Методы Router привязаны в конструкторе как СОБСТВЕННЫЕ свойства
// (Router.ts · "Bind Public Methods"), поэтому мелкая копия ЖИВАЯ: её getState()
// возвращает настоящее состояние. Именно это делает поломку идентичности
// нетривиальной — копия «работает», но отвергается каждой дверью по WeakMap.
const spreadCopy = (r: object): object => ({ ...r });
const protoCopy = (r: object): object =>
  Object.assign(Object.create(Object.getPrototypeOf(r) as object), r);
const proxyCopy = (r: object): object => new Proxy(r, {});

function tryIt(fn: () => unknown): string {
  try {
    const v = fn();

    return `ok:${typeof v}`;
  } catch (error) {
    return `threw:${(error as Error).message}`;
  }
}

async function main(): Promise<void> {
  // =========================== ШАПКА: позитивные контроли ====================
  const handedAt: Record<string, unknown> = {};
  let cfgActivateCalls = 0;
  let cfgDeactivateCalls = 0;
  let guardRan = 0;

  const router = createRouter(
    [
      { name: "a", path: "/a" },
      {
        name: "b",
        path: "/b",
        canActivate: (r: unknown) => {
          cfgActivateCalls++;
          handedAt["Route.canActivate·GuardFnFactory·router"] = r;

          return () => {
            guardRan++;

            return true;
          };
        },
        canDeactivate: (r: unknown) => {
          cfgDeactivateCalls++;
          handedAt["Route.canDeactivate·GuardFnFactory·router"] = r;

          return () => true;
        },
      },
    ] as never,
    {} as never,
  );

  await router.start("/a");
  out.control_started = router.getState()?.name;

  await router.navigate("b");
  out.control_navigatedTo = router.getState()?.name;
  out.control_guardRan = guardRan;
  out.control_factoryCalls = { cfgActivateCalls, cfgDeactivateCalls };

  await router.navigate("a");

  // ---- пути 3..7: снять ручку на каждом ------------------------------------
  const lifecycle = getLifecycleApi(router);

  lifecycle.addActivateGuard("a", ((r: unknown) => {
    handedAt["LifecycleApi.addActivateGuard·GuardFnFactory·router"] = r;

    return () => true;
  }) as never);
  lifecycle.addDeactivateGuard("a", ((r: unknown) => {
    handedAt["LifecycleApi.addDeactivateGuard·GuardFnFactory·router"] = r;

    return () => true;
  }) as never);

  getRoutesApi(router).update("b", {
    canActivate: ((r: unknown) => {
      handedAt[
        "RoutesApi.update·updates.canActivate|canDeactivate·GuardFnFactory·router"
      ] = r;

      return () => true;
    }) as never,
    canDeactivate: ((r: unknown) => {
      handedAt["RoutesApi.update·canDeactivate(same path)"] = r;

      return () => true;
    }) as never,
  } as never);

  // ---- путь 8: SsrLoaderFnFactory ------------------------------------------
  const ssrPlugin = createSsrLoaderPlugin(
    {
      a: (r: unknown) => {
        handedAt["createSsrLoaderPlugin·SsrLoaderFnFactory·router"] = r;

        return () => "loaded";
      },
    } as never,
    { namespace: "data", modeNamespace: "dataMode", errorPrefix: "[probe]" },
  );

  router.usePlugin(ssrPlugin as never);

  // ---- пути 1..2: сам аргумент двери — это router ---------------------------
  handedAt["getNavigator·router"] = router;
  handedAt["getRoutesApi·router"] = router;

  out.identity_sameInstanceAtEveryPath = Object.fromEntries(
    Object.entries(handedAt).map(([k, v]) => [k, v === router]),
  );
  out.identity_arrivedAtEveryPath = Object.fromEntries(
    Object.entries(handedAt).map(([k, v]) => [k, v !== undefined]),
  );
  out.identity_pathsCollected = Object.keys(handedAt).length;

  // ======================= ЭКСПЕРИМЕНТ (а): копия на границе =================
  // Кандидат-«копии контейнера»: собственные свойства те же (листья по ссылке).
  const spread = spreadCopy(router);
  const proto = protoCopy(router);
  const prox = proxyCopy(router);

  out.copy_shape = {
    ownKeysCount: Object.keys(spread).length,
    // копия ЖИВАЯ: связанные методы работают
    spreadGetStateWorks:
      (spread as { getState: () => { name?: string } }).getState()?.name ===
      router.getState()?.name,
    protoGetStateWorks:
      (proto as { getState: () => { name?: string } }).getState()?.name ===
      router.getState()?.name,
  };

  // (а1) реестр internals — ключ по идентичности
  out.a1_getInternals = {
    original: tryIt(() => getInternals(router as never)),
    spread: tryIt(() => getInternals(spread as never)),
    proto: tryIt(() => getInternals(proto as never)),
    proxy: tryIt(() => getInternals(prox as never)),
  };

  // (а2) фабрики API ядра — вход по идентичности
  out.a2_apiFactories = {
    getRoutesApi_original: tryIt(() => getRoutesApi(router)),
    getRoutesApi_spread: tryIt(() => getRoutesApi(spread as never)),
    getLifecycleApi_spread: tryIt(() => getLifecycleApi(spread as never)),
    getPluginApi_spread: tryIt(() => getPluginApi(spread as never)),
    getPluginApi_proxy: tryIt(() => getPluginApi(prox as never)),
  };

  // (а3) КЭШ ФАБРИКИ — построенный случай MUST-(б):
  // getNavigator НЕ ходит в реестр, копия проходит — и раскалывает кэш.
  const navOriginal = getNavigator(router);
  const navAgain = getNavigator(router);
  const navFromSpread = getNavigator(spread as never);

  out.a3_navigatorCache = {
    sameRouterSameNavigator: navOriginal === navAgain,
    copySplitsTheCache: navFromSpread !== navOriginal,
    copyAcceptedSilently: typeof navFromSpread === "object",
    routesApiCachedByIdentity: getRoutesApi(router) === getRoutesApi(router),
  };

  // (а4) обратная видимость: расширение, поставленное ПОСЛЕ снятия копии,
  // видно на инстансе и не видно на копии; запись в копию не видна ядру.
  const api = getPluginApi(router);

  api.extendRouter({ probeExt: 42 });
  out.a4_backVisibility = {
    onInstance: String(
      (router as unknown as Record<string, unknown>).probeExt,
    ),
    onSpreadCopyTakenEarlier: String(
      (spread as Record<string, unknown>).probeExt,
    ),
    writeIntoCopyVisibleToCore: String(
      (() => {
        (spread as Record<string, unknown>).lateWrite = 1;

        return (router as unknown as Record<string, unknown>).lateWrite;
      })(),
    ),
  };

  // ====================================== P1 =================================
  // Ядро читает ИМЕНОВАННЫЕ слоты инстанса в двух местах:
  //   getNavigator.ts · getNavigator — 7 слотов;
  //   getRoutesApi.ts · replace      — router.getState().
  // Дрейфующий/считающий вход: Proxy-счётчик как аргумент getNavigator
  // (тип допускает чужой объект), и делегирующее собственное свойство на
  // инстансе для replace.
  const reads: Record<string, number> = {};
  const counting = new Proxy(router, {
    get(t, k, r) {
      const key = String(k);

      reads[key] = (reads[key] ?? 0) + 1;

      return Reflect.get(t, k, r) as unknown;
    },
  });
  const navFromCounting = getNavigator(counting as never);

  out.p1_getNavigator_readsPerKey = { ...reads };
  getNavigator(counting as never); // повторный вызов — должен читать 0
  out.p1_getNavigator_secondCallAddedReads =
    Object.values(reads).reduce((a, b) => a + b, 0) -
    Object.values(out.p1_getNavigator_readsPerKey as Record<string, number>)
      .reduce((a, b) => a + b, 0) ===
    0;
  out.p1_navigatorKeys = Object.keys(navFromCounting);
  out.p1_navigatorFrozen = Object.isFrozen(navFromCounting);

  // P1 на обратном чтении (replace): считающее собственное свойство
  const r2 = createRouter(routes as never, {} as never);

  await r2.start("/a");

  const realGetState = (
    Object.getPrototypeOf(r2) as { getState: () => unknown }
  ).getState;
  let replaceReads = 0;

  Object.defineProperty(r2, "getState", {
    configurable: true,
    writable: true,
    value: function shadowed(this: unknown): unknown {
      replaceReads++;

      return (r2 as unknown as { constructor: unknown }) === undefined
        ? undefined
        : realGetState.call(r2);
    },
  });
  getRoutesApi(r2).replace([
    { name: "a", path: "/a" },
    { name: "c", path: "/c" },
  ] as never);
  out.p1_replace_getStateReads = replaceReads;
  Reflect.deleteProperty(r2, "getState");

  // ====================================== P2 =================================
  // Перечисляет ли ядро ключи ИНСТАНСА? Единственный вопрос о ключе —
  // `key in router` в getPluginApi.ts · extendRouter (намеренно ПО ЦЕПОЧКЕ:
  // имя, совпавшее с методом прототипа, обязано быть отвергнуто).
  // Лгущий Proxy здесь строится над ИНСТАНСОМ ЯДРА: has() врёт «нет такого»
  // про существующий метод — и всё равно ничего не попадает в состояние,
  // потому что запись идёт в РЕАЛЬНЫЙ router (ns.router), а не в Proxy.
  const r3 = createRouter(routes as never, {} as never);

  await r3.start("/a");

  out.p2_extendRouter_usesInChain = {
    // собственный ключ, которого нет нигде → ставится
    freshKey: tryIt(() => getPluginApi(r3).extendRouter({ freshOne: 1 })),
    // имя метода прототипа → отвергнуто (в цепочке)
    prototypeMethodName: tryIt(() =>
      getPluginApi(r3).extendRouter({ navigate: 1 }),
    ),
    // имя с Object.prototype → отвергнуто (в цепочке)
    objectPrototypeName: tryIt(() =>
      getPluginApi(r3).extendRouter({ toString: 1 }),
    ),
    __proto__Name: tryIt(() =>
      getPluginApi(r3).extendRouter(JSON.parse('{"__proto__":1}') as never),
    ),
  };
  out.p2_coreEnumeratesInstanceKeys_ownKeysTrap = (() => {
    // Считаем, спрашивает ли ядро ownKeys у инстанса на путях этого семейства.
    let ownKeysCalls = 0;
    const spy = new Proxy(router, {
      ownKeys(t) {
        ownKeysCalls++;

        return Reflect.ownKeys(t);
      },
    });

    getNavigator(spy as never);

    return ownKeysCalls;
  })();

  // ====================================== P3 =================================
  // Запись на инстанс есть ровно одна — extendRouter'ов `router[key] = value`
  // ([[Set]]). Ловушка: унаследованный аксессор под именем ключа.
  const r4 = createRouter(routes as never, {} as never);

  await r4.start("/a");

  let inheritedSetterCalls = 0;
  let p3Result = "";
  let p3Landed: unknown = "unset";

  try {
    Object.defineProperty(Object.prototype, "probeInherited", {
      configurable: true,
      get() {
        return "from-prototype";
      },
      set() {
        inheritedSetterCalls++;
      },
    });
    p3Result = tryIt(() =>
      getPluginApi(r4).extendRouter({ probeInherited: "app" }),
    );
    p3Landed = Object.hasOwn(r4 as object, "probeInherited")
      ? "own"
      : "not-own";
  } finally {
    Reflect.deleteProperty(Object.prototype, "probeInherited");
  }
  out.p3_inheritedAccessor = {
    extendRouterResult: p3Result,
    inheritedSetterCalls,
    landedAs: p3Landed,
  };

  // собственный "__proto__" из JSON.parse на пути записи в инстанс
  const r5 = createRouter(routes as never, {} as never);

  await r5.start("/a");

  const protoBefore = Object.getPrototypeOf(r5) as object;
  const p3Proto = tryIt(() =>
    getPluginApi(r5).extendRouter(JSON.parse('{"__proto__":{"x":1}}') as never),
  );

  out.p3_protoWrite = {
    result: p3Proto,
    prototypeUnchanged: Object.getPrototypeOf(r5) === protoBefore,
    // позитивный контроль того же примитива: обычный ключ ДОХОДИТ
    controlPlainKeyLands: (() => {
      getPluginApi(r5).extendRouter({ plainKey: 7 });

      return (r5 as unknown as Record<string, unknown>).plainKey;
    })(),
  };

  // ====================================== P4 =================================
  out.p4_freeze = {
    routerInstanceFrozen: Object.isFrozen(router),
    routerInstanceExtensible: Object.isExtensible(router),
    navigatorFrozen: Object.isFrozen(getNavigator(router)),
    routesApiFrozen: Object.isFrozen(getRoutesApi(router)),
    lifecycleApiFrozen: Object.isFrozen(getLifecycleApi(router)),
    pluginApiFrozen: Object.isFrozen(getPluginApi(router)),
  };

  // ========== SSR: подмена копией на границе плагин-фабрики ==================
  const r6 = createRouter(routes as never, {} as never);
  const ssrFactory = createSsrLoaderPlugin(
    { a: (() => () => "x") as never } as never,
    { namespace: "data", modeNamespace: "dataMode", errorPrefix: "[probe]" },
  );

  out.ssr_copyAtFactoryBoundary = {
    original: tryIt(() =>
      (ssrFactory as unknown as (r: unknown, g: unknown) => unknown)(
        r6,
        () => undefined,
      ),
    ),
    spreadCopy: tryIt(() =>
      (ssrFactory as unknown as (r: unknown, g: unknown) => unknown)(
        spreadCopy(r6),
        () => undefined,
      ),
    ),
  };

  console.log(JSON.stringify(out, null, 1));
}

void main();
