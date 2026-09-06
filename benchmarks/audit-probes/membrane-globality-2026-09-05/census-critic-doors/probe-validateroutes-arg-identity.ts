// Критик-находка №1: `validateRoute` (публичный экспорт @real-router/core/validation)
// читает ОБЪЕКТ ВЫЗЫВАЮЩЕГО или СНАПШОТ ядра?
// Реальный поток: getRoutesApi.add → snapshotRouteBatch(routeArray) → batch →
// ctx.validator?.routes.validateRoutes(batch, …) → validateRoute(route, …).
// Проверяем ИДЕНТИЧНОСТЬ того, что доходит до валидатора, включая children[].
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const seen: { routes?: unknown } = {};
const group = (g: string) =>
  new Proxy(
    {},
    {
      get:
        (_t, m) =>
        (...args: unknown[]) => {
          if (g === "routes" && String(m) === "validateRoutes") {
            seen.routes = args[0];
          }
        },
    },
  );
const recorder = new Proxy({}, { get: (_t, g) => group(String(g)) });

const router = createRouter([{ name: "a", path: "/a" }] as never, {} as never);
const ctx = getInternals(router);
const routesApi = getRoutesApi(router);

// НЕГАТИВНЫЙ КОНТРОЛЬ: без валидатора ничего не записано.
routesApi.add([{ name: "z", path: "/z" }] as never);
const recordedWithoutValidator = seen.routes !== undefined;

ctx.validator = recorder as never;

const childBag = countingProxy({ name: "kid", path: "/kid" });
const callerChildren = [childBag.bag];
const callerRoute = { name: "top", path: "/top", children: callerChildren };
const callerArray = [callerRoute];

routesApi.add(callerArray as never);

const got = seen.routes as { name: string; children?: unknown[] }[] | undefined;

console.log(
  JSON.stringify(
    {
      recordedWithoutValidator,
      validatorCalled: got !== undefined,
      arrayIsCallerArray: got === (callerArray as unknown),
      topIsCallerRoute: got?.[0] === (callerRoute as unknown),
      childrenArrayIsCallerArray:
        got?.[0]?.children === (callerChildren as unknown),
      childIsCallerChild: got?.[0]?.children?.[0] === (childBag.bag as unknown),
      childProxyReadsTotal: Object.values(childBag.reads).reduce(
        (a, b) => a + b,
        0,
      ),
      childProxyReads: childBag.reads,
      landed: router.buildPath("top.kid", {}, {}),
    },
    null,
    1,
  ),
);
