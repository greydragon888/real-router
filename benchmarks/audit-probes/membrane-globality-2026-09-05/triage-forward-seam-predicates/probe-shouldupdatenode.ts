// S6-переработка: shouldUpdateNode с НЕ-корневым nodeName — только так вход
// доходит до getTransitionPath (корень "" возвращает true до кэша:
// RoutesNamespace.ts · static shouldUpdateNode, ветка DEFAULT_ROUTE_NAME).
// Вопрос: удерживает ли модульный кэш transitionPath.ts объекты вызывающего
// по ИДЕНТИЧНОСТИ (cached1To === toState).
import { createRouter } from "@real-router/core";

type Bag = Record<string, unknown>;
const out = (s: string, d: unknown): void => {
  console.log(`${s} ${JSON.stringify(d)}`);
};

const router = createRouter(
  [
    { name: "home", path: "/home" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "profile", path: "/:id" },
      ],
    },
  ] as never,
  {} as never,
);

const pred = router.shouldUpdateNode("users") as unknown as (
  to: unknown,
  from?: unknown,
) => boolean;

let getReads = 0;
let hasReads = 0;
const wrap = (o: Bag): Bag =>
  new Proxy(o, {
    get(t, k, rec) {
      if (k === "name") getReads += 1;

      return Reflect.get(t, k, rec);
    },
    has(t, k) {
      if (k === "name") hasReads += 1;

      return Reflect.has(t, k);
    },
  });

const to = wrap({
  name: "users.profile",
  params: { id: "1" },
  search: {},
  path: "/users/1",
});
const from = wrap({
  name: "users.list",
  params: {},
  search: {},
  path: "/users/list",
});

// ПОЗИТИВНЫЙ КОНТРОЛЬ: узел "users" — пересечение, предикат обязан
// вернуть true, и вход обязан дойти до getTransitionPath (getReads > 0).
const first = pred(to, from);
const g1 = getReads;
const second = pred(to, from); // ТЕ ЖЕ объекты → попадание в кэш идентичности
const g2 = getReads;
// НЕГАТИВНЫЙ КОНТРОЛЬ кэша: клон той же формы, другая идентичность
const to2 = wrap({
  name: "users.profile",
  params: { id: "1" },
  search: {},
  path: "/users/1",
});
const third = pred(to2, from);
const g3 = getReads;

// Узел вне пути — предикат обязан вернуть false (контроль дискриминации)
const predOther = router.shouldUpdateNode("home") as unknown as (
  to: unknown,
  from?: unknown,
) => boolean;
const offPath = predOther(to, from);

out("S6' shouldUpdateNode", {
  reachedTransitionPath: g1 > 0,
  first,
  second,
  third,
  offPathNodeMustBeFalse: offPath,
  getReads: { afterFirst: g1, afterSecond: g2, afterThird: g3 },
  hasReads,
  cacheHitOnSameObjects: g2 === g1,
  cacheMissOnClone: g3 > g2,
});
