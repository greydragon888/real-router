// Перепись розданных объектов ядра: заморожен ли, расширяем ли, стабильна ли
// идентичность между выдачами — знаменатель семейства «хэндаут-поле на объекте
// ядра». Каждая строка измерена, не прочитана.
import {
  createRouter,
  errorCodes,
  getNavigator,
  Router,
  RouterError,
} from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

interface Row {
  object: string;
  isFrozen: boolean;
  isExtensible: boolean;
  identityStable: boolean | string;
  note?: string;
}

async function main(): Promise<void> {
  let guardFactoryArg: unknown;
  let pluginFactoryArg: unknown;
  let hookErr: unknown;
  const routes = [
    { name: "home", path: "/" },
    {
      name: "u",
      path: "/u/:id",
      canActivate: (r: unknown) => {
        guardFactoryArg = r;
        return () => true;
      },
    },
    { name: "denied", path: "/denied", canActivate: () => () => false },
  ] as never;
  const router = createRouter(routes, {} as never);
  router.usePlugin((r) => {
    pluginFactoryArg = r;
    return {
      onTransitionError: (_to, _from, err) => {
        hookErr = err;
      },
    };
  });
  await router.start("/");
  await router.navigate("u", { id: "1" });

  const rows: Row[] = [];
  const push = (
    object: string,
    o: object,
    identityStable: boolean | string,
    note?: string,
  ): void => {
    rows.push({
      object,
      isFrozen: Object.isFrozen(o),
      isExtensible: Object.isExtensible(o),
      identityStable,
      ...(note === undefined ? {} : { note }),
    });
  };

  push(
    "Router instance (createRouter return)",
    router,
    guardFactoryArg === router && pluginFactoryArg === router,
    "тот же объект передан GuardFnFactory·router и PluginFactory·router",
  );
  const clone = cloneRouter(router as never);
  push(
    "cloneRouter return",
    clone,
    (clone as unknown) !== (router as unknown) ? "fresh instance" : "SAME",
    "новый инстанс",
  );
  push(
    "Router.prototype",
    Router.prototype,
    Object.getPrototypeOf(router) === Router.prototype,
  );
  push(
    "getInternals(router)",
    getInternals(router),
    getInternals(router) === getInternals(router),
    "reachable via @real-router/core/validation",
  );
  push(
    "getPluginApi(router)",
    getPluginApi(router),
    getPluginApi(router) === getPluginApi(router),
  );
  push(
    "getRoutesApi(router)",
    getRoutesApi(router),
    getRoutesApi(router) === getRoutesApi(router),
  );
  push(
    "getLifecycleApi(router)",
    getLifecycleApi(router),
    getLifecycleApi(router) === getLifecycleApi(router),
  );
  push(
    "getDependenciesApi(router)",
    getDependenciesApi(router),
    getDependenciesApi(router) === getDependenciesApi(router),
  );
  push(
    "getNavigator(router)",
    getNavigator(router),
    getNavigator(router) === getNavigator(router),
  );
  const st = router.getState()!;
  push("router.getState() (State shell)", st, router.getState() === st);
  push(
    "router.getState().context",
    st.context,
    router.getState()!.context === st.context,
    "вне линзы (объект State), приведено для знаменателя",
  );
  push(
    "getRoutesApi(router).get('u')",
    getRoutesApi(router).get("u")!,
    getRoutesApi(router).get("u") === getRoutesApi(router).get("u"),
  );
  push(
    "getPluginApi(router).getOptions()",
    getPluginApi(router).getOptions(),
    getPluginApi(router).getOptions() === getPluginApi(router).getOptions(),
  );

  // ошибки, которые ядро раздаёт
  let rejection: unknown;
  try {
    await router.navigate("denied");
  } catch (error) {
    rejection = error;
  }
  push(
    "navigate() rejection error (guard refusal)",
    rejection as object,
    rejection === hookErr
      ? "same instance reaches onTransitionError hook"
      : "DIFFERENT",
    `code=${(rejection as RouterError).code} expected=${errorCodes.CANNOT_ACTIVATE}`,
  );
  let notStarted: unknown;
  const idle = createRouter(routes, {} as never);
  try {
    await idle.navigate("home");
  } catch (error) {
    notStarted = error;
  }
  push(
    "navigate() rejection before start (cached singleton)",
    notStarted as object,
    "module singleton",
    `code=${(notStarted as RouterError).code}`,
  );
  const own = new RouterError("X", { extra: { k: 1 } });
  push(
    "new RouterError(...) built by the caller (not yet thrown by core)",
    own,
    "caller's own",
    "замораживается только в момент throw ядром (freezeThrownError)",
  );

  const denominator = rows.length;
  const openObjects = rows.filter((r) => r.isExtensible).map((r) => r.object);
  console.log(
    JSON.stringify(
      { denominator, openObjects: openObjects.length, openObjectsList: openObjects, rows },
      null,
      1,
    ),
  );
}

void main();
