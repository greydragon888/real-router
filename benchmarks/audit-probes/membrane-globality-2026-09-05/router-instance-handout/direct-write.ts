// Дверь Router·[key: string] — прямая запись приложения на инстанс ядра
// (`router.foo = obj`), минуя PluginApi.extendRouter.
// Вопросы: (1) куда ложится и по ссылке ли; (2) трекается ли в routerExtensions;
// (3) блокирует ли последующий extendRouter того же ключа; (4) переносится ли в
// клон (в отличие от расширения, установленного плагином); (5) переживает ли
// dispose; (6) открыт ли инстанс; (7) есть ли у цели живой сеттер __proto__;
// (8) как `key in router` реагирует на non-enumerable и symbol-ключи.
import { createRouter, errorCodes, Router, RouterError } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Bag = Record<string, unknown>;
const routes = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id" },
] as never;

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
  const obj = { a: 1 };

  // (1) куда ложится
  const router = createRouter(routes, {} as never);
  const ctx = getInternals(router);
  const ownKeysAtConstruction = Object.keys(router);
  (router as Bag).appSlot = obj;
  out.s1_lands = {
    ownKeysAtConstruction_count: ownKeysAtConstruction.length,
    ownKeysAtConstruction_allFunctions: ownKeysAtConstruction.every(
      (k) => typeof (router as Bag)[k] === "function",
    ),
    ownProperty: Object.hasOwn(router, "appSlot"),
    sameReference: (router as Bag).appSlot === obj,
    descriptor: Object.getOwnPropertyDescriptor(router, "appSlot"),
    trackedInRouterExtensions: ctx.routerExtensions.some((r) =>
      r.keys.includes("appSlot"),
    ),
    routerExtensionsLength: ctx.routerExtensions.length,
  };

  // (2) конфликт с последующим extendRouter того же ключа
  out.s2_laterExtendRouterSameKey = codeOf(() =>
    getPluginApi(router).extendRouter({ appSlot: 2 }),
  );
  out.s2_expected = errorCodes.PLUGIN_CONFLICT;

  // (3) позитивный контроль: extendRouter свежего ключа ТРЕКАЕТСЯ, значение по ссылке
  getPluginApi(router).extendRouter({ pluginSlot: obj });
  out.s3_control_extendRouter = {
    tracked: ctx.routerExtensions.some((r) => r.keys.includes("pluginSlot")),
    sameReference: (router as Bag).pluginSlot === obj,
  };

  // (4) клон: прямая запись НЕ переносится; расширение плагина переносится реплеем фабрики
  const base = createRouter(routes, {} as never);
  (base as Bag).appSlot = obj;
  base.usePlugin((r) => {
    const un = getPluginApi(r).extendRouter({ viaPlugin: obj });
    return { teardown: un };
  });
  const clone = cloneRouter(base as never);
  out.s4_clone = {
    baseHasAppSlot: Object.hasOwn(base, "appSlot"),
    cloneHasAppSlot: Object.hasOwn(clone, "appSlot"),
    cloneHasViaPlugin: Object.hasOwn(clone, "viaPlugin"),
    cloneViaPluginSameRef: (clone as unknown as Bag).viaPlugin === obj,
    cloneIsDifferentInstance: (clone as unknown) !== (base as unknown),
  };

  // (5) dispose: прямая запись переживает, трекаемое расширение удаляется
  await router.start("/");
  router.dispose();
  out.s5_dispose = {
    appSlotSurvives: Object.hasOwn(router, "appSlot"),
    appSlotStillSameRef: (router as Bag).appSlot === obj,
    pluginSlotDeleted: !Object.hasOwn(router, "pluginSlot"),
    routerExtensionsLength: ctx.routerExtensions.length,
  };

  // (6) открытость инстанса
  out.s6_openness = {
    isExtensible: Object.isExtensible(router),
    isSealed: Object.isSealed(router),
    isFrozen: Object.isFrozen(router),
    protoIsRouterPrototype: Object.getPrototypeOf(router) === Router.prototype,
    routerPrototypeIsFrozen: Object.isFrozen(Router.prototype),
  };

  // (7) [[Set]] "__proto__" приложением: у цели живой унаследованный сеттер
  const routerC = createRouter(routes, {} as never);
  const fakeProto = Object.create(Router.prototype) as object;
  (routerC as Bag)["__proto__"] = fakeProto;
  out.s7_protoSetter = {
    prototypeSwapped: Object.getPrototypeOf(routerC) === fakeProto,
    ownProtoKeyCreated: Object.hasOwn(routerC, "__proto__"),
    stillInstanceofRouter: routerC instanceof Router,
    boundOwnMethodsStillWork: routerC.buildPath("u", { id: "1" }),
    internalsStillFound: getInternals(routerC) !== undefined,
  };

  // (8) `in` видит non-enumerable; Object.keys не видит symbol
  const routerD = createRouter(routes, {} as never);
  Object.defineProperty(routerD, "hidden", {
    value: 1,
    enumerable: false,
    configurable: true,
  });
  const sym = Symbol("ext");
  const ctxD = getInternals(routerD);
  const before = ctxD.routerExtensions.length;
  const symCode = codeOf(() =>
    getPluginApi(routerD).extendRouter({ [sym]: obj } as never),
  );
  out.s8_keys = {
    nonEnumerableDirectDefine_blocksExtendRouter: codeOf(() =>
      getPluginApi(routerD).extendRouter({ hidden: 1 }),
    ),
    symbolKeyedExtension_code: symCode,
    symbolKeyedExtension_installed:
      Object.getOwnPropertySymbols(routerD).includes(sym),
    symbolKeyedExtension_recordPushed: ctxD.routerExtensions.length - before,
    symbolKeyedExtension_recordKeys: ctxD.routerExtensions.at(-1)?.keys,
  };

  console.log(JSON.stringify(out, null, 1));
}

void main();
