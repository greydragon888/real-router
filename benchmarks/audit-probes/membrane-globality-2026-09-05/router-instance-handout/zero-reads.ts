// Дверь Router·[key: string]: сколько раз ЯДРО читает/перечисляет значение,
// записанное приложением на инстанс, за полный жизненный цикл роутера.
// Инструмент: accessor-свойство на инстансе — любое чтение по имени, spread,
// Object.assign/values/entries вызывают геттер; Object.keys / for-in / `in` /
// hasOwn — нет (их отсутствие над инстансом в src доказано статическим
// переписом, см. отчёт).
import { createRouter, getNavigator } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

type Bag = Record<string, unknown>;
const routes = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id" },
] as never;

async function main(): Promise<void> {
  const router = createRouter(routes, {} as never);
  let reads = 0;
  let writes = 0;
  const obj = { a: 1 };

  Object.defineProperty(router, "appSlot", {
    enumerable: true,
    configurable: true,
    get(): unknown {
      reads += 1;
      return obj;
    },
    set(): void {
      writes += 1;
    },
  });

  // полный жизненный цикл ядра
  await router.start("/");
  await router.navigate("u", { id: "1" });
  router.buildPath("u", { id: "2" });
  router.isActiveRoute("u", { id: "1" });
  router.canNavigateTo("u", { id: "3" });
  router.getState();
  router.getPreviousState();
  router.areStatesEqual(router.getState(), router.getPreviousState());
  router.shouldUpdateNode("u")(router.getState()!, router.getPreviousState());
  const api = getPluginApi(router);
  api.makeState("u", { id: "1" });
  api.buildNavigationState("u", { id: "1" });
  api.getOptions();
  api.getRouteConfig("u");
  const un = api.extendRouter({ other: 1 });
  un();
  const claim = api.claimContextNamespace("probe");
  claim.release();
  const routesApi = getRoutesApi(router);
  routesApi.add([{ name: "x", path: "/x" }] as never);
  routesApi.get("x");
  routesApi.update("x", { defaultParams: { q: "1" } } as never);
  routesApi.remove("x");
  getLifecycleApi(router).addActivateGuard("u", () => () => true);
  getLifecycleApi(router).removeActivateGuard("u");
  getDependenciesApi(router).set("d", 1);
  getDependenciesApi(router).getAll();
  getNavigator(router);
  const unPlugin = router.usePlugin((r) => {
    void r;
    return { onTransitionSuccess: () => undefined };
  });
  await router.navigate("home");
  unPlugin();
  const clone = cloneRouter(router as never);
  await clone.start("/");
  clone.dispose();
  router.stop();
  await router.start("/");
  router.navigateToNotFound("/zzz");
  router.dispose();

  const afterCore = { reads, writes };

  // позитивные контроли инструмента
  void (router as Bag).appSlot;
  const afterAppRead = reads;
  const spread = { ...router };
  const afterSpread = reads;
  Object.assign({}, router);
  const afterAssign = reads;
  Object.values(router);
  const afterValues = reads;
  Object.keys(router);
  const afterKeys = reads; // Object.keys НЕ вызывает геттер — инструмент слеп к нему по спецификации
  (router as Bag).appSlot = 2;
  const afterAppWrite = writes;

  console.log(
    JSON.stringify(
      {
        core_lifecycle: afterCore,
        control_appRead: afterAppRead,
        control_spread: afterSpread,
        control_objectAssign: afterAssign,
        control_objectValues: afterValues,
        control_objectKeys_noGetterBySpec: afterKeys,
        control_appWrite_setterHits: afterAppWrite,
        spreadCarriesSlot: Object.hasOwn(spread, "appSlot"),
        keysIncludeSlot: Object.keys(router).includes("appSlot"),
      },
      null,
      1,
    ),
  );
}

void main();
