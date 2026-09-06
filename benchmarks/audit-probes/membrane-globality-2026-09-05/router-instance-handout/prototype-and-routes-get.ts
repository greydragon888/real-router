// Довесок семейства:
// (A) Router.prototype·[key: string] — запись приложения на экспортированный
//     прототип класса: ложится на общий объект ядра для ВСЕХ инстансов (база и
//     клоны), блокирует extendRouter того же ключа везде, ядро не читает.
// (B) RoutesApi.get·return — измерение формы выдачи (свежий/замороженный/алиасы),
//     потому что инвентарь показал isFrozen=false вопреки ожиданию.
import { createRouter, errorCodes, Router, RouterError } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

function codeOf(fn: () => void): string {
  try {
    fn();
    return "NO_THROW";
  } catch (error) {
    return error instanceof RouterError
      ? error.code
      : `NON_ROUTER_ERROR:${String(error)}`;
  }
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const obj = { shared: true };
  const callerDefaults = { tab: "x" };
  const callerGuard = (): (() => boolean) => () => true;
  const routes = [
    { name: "home", path: "/" },
    {
      name: "u",
      path: "/u/:id",
      defaultParams: callerDefaults,
      canActivate: callerGuard,
      custom: { deep: 1 },
    },
  ] as never;

  // (A) прототип
  let protoReads = 0;
  Object.defineProperty(Router.prototype, "sharedSlot", {
    enumerable: true,
    configurable: true,
    get(): unknown {
      protoReads += 1;
      return obj;
    },
  });
  const r1 = createRouter(routes, {} as never);
  const r2 = createRouter(routes, {} as never);
  await r1.start("/");
  await r1.navigate("u", { id: "1" });
  const clone = cloneRouter(r1 as never);
  await clone.start("/");
  clone.dispose();
  r1.dispose();
  const coreReadsOfPrototypeSlot = protoReads;
  const seenByAllInstances = "sharedSlot" in r2 && "sharedSlot" in clone;
  const blocksExtendRouterEverywhere = codeOf(() =>
    getPluginApi(r2).extendRouter({ sharedSlot: 1 }),
  );
  const ownOnInstance = Object.hasOwn(r2, "sharedSlot");
  void (r2 as Bag).sharedSlot;
  const controlAppRead = protoReads;
  delete (Router.prototype as unknown as Bag).sharedSlot;
  out.A_prototype = {
    coreReadsOfPrototypeSlot,
    controlAppRead,
    seenByAllInstances,
    blocksExtendRouterEverywhere,
    expected: errorCodes.PLUGIN_CONFLICT,
    ownOnInstance,
    prototypeExtensible: Object.isExtensible(Router.prototype),
    cleanedUp: !("sharedSlot" in r2),
  };

  // (B) RoutesApi.get
  const r3 = createRouter(routes, {} as never);
  const api = getRoutesApi(r3);
  const g1 = api.get("u")!;
  const g2 = api.get("u")!;
  out.B_routesGet = {
    freshPerCall: g1 !== g2,
    isFrozen: Object.isFrozen(g1),
    isExtensible: Object.isExtensible(g1),
    defaultParams_isCallerLiteral: g1.defaultParams === callerDefaults,
    defaultParams_stableAcrossCalls: g1.defaultParams === g2.defaultParams,
    defaultParams_frozen: Object.isFrozen(g1.defaultParams),
    canActivate_isCallerFn: g1.canActivate === callerGuard,
    customField_isCallerObject:
      (g1 as unknown as Bag).custom === (routes as unknown as Bag[])[1]!.custom,
    customField_present: Object.hasOwn(g1, "custom"),
    directWriteOnHandout_reachesNextCall: (() => {
      (g1 as unknown as Bag).stray = 1;
      return Object.hasOwn(api.get("u")!, "stray");
    })(),
  };

  console.log(JSON.stringify(out, null, 1));
}

void main();
