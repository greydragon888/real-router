// ЦЕНА стратегии (а) на горячих дверях семейства. Ядро НЕ правится — копия
// на границе ЭМУЛИРУЕТСЯ обёрткой, которая аллоцирует ровно один лишний
// контейнер-оболочку State на аргумент (листья params/search — по ссылке).
//
// D1 areStatesEqual — RoutesNamespace · isActiveRoute зовёт его на каждый
//    рендер <Link>; форма мешка реальная: 1 path-слот + 1 query-ключ.
// D2 shouldUpdateNode-предикат — @real-router/sources · createRouteNodeSource
//    зовёт его на КАЖДЫЙ смонтированный узел в одном router.subscribe, с ОДНИМИ
//    И ТЕМИ ЖЕ объектами → базовая арма моделирует N узлов (кэш идентичности
//    попадает N-1 раз), арма с копией — промах на каждом узле.
// D3/D4 — та же дверь D1 при установленном validation-plugin.
//
// Запуск (из W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-чужой-state-.../cost.ts
import { createRouter } from "@real-router/core";
import { bench, do_not_optimize, run } from "mitata";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

type Bag = Record<string, unknown>;
type St = { name: string; params: Bag; search: Bag; path: string };

const routes = [
  { name: "home", path: "/home" },
  {
    name: "users",
    path: "/users/:uid",
    children: [
      { name: "list", path: "/list" },
      { name: "profile", path: "/p/:id?tab" },
    ],
  },
] as never;

const mk = (plugin = false): any => {
  const r: any = createRouter(routes, {} as never, {} as never);
  if (plugin) r.usePlugin(validationPlugin() as never);
  return r;
};

const rA = mk();
const rA2 = mk();
const rB = mk();
const rPA = mk(true);
const rPA2 = mk(true);
const rPB = mk(true);

const S1: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: { tab: "x" },
  path: "/users/1/p/7?tab=x",
};
const S2: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: { tab: "x" },
  path: "/users/1/p/7?tab=x",
};

const shell = (s: St): St => ({ ...s });

// ------------------------------------------------ ГЕЙТ ЭКВИВАЛЕНТНОСТИ
console.log(
  `EQUIVALENCE D1: A=${String(rA.areStatesEqual(S1, S2))} B=${String(
    rB.areStatesEqual(shell(S1), shell(S2)),
  )}`,
);

const NODES = ["", "users", "users.profile", "users.list", "home"];
const predsA = NODES.map((n) => rA.shouldUpdateNode(n));
const predsA2 = NODES.map((n) => rA2.shouldUpdateNode(n));
const predsB = NODES.map((n) => rB.shouldUpdateNode(n));
const FROM: St = {
  name: "users.list",
  params: { uid: "1" },
  search: {},
  path: "/users/1/list",
};
const fanA = predsA.map((p) => (p as (a: any, b: any) => boolean)(S1, FROM));
const fanB = predsB.map((p) =>
  (p as (a: any, b: any) => boolean)(shell(S1), shell(FROM)),
);
console.log(
  `EQUIVALENCE D2: A=${JSON.stringify(fanA)} B=${JSON.stringify(fanB)} equal=${String(
    JSON.stringify(fanA) === JSON.stringify(fanB),
  )}`,
);

// ------------------------------------------------------------------ D1
bench("D1 areStatesEqual · A базовая (без копии)", () => {
  do_not_optimize(rA.areStatesEqual(S1, S2));
});
bench("D1 areStatesEqual · B копия оболочек на границе", () => {
  do_not_optimize(rB.areStatesEqual(shell(S1), shell(S2)));
});
bench("D1 areStatesEqual · A/A пол", () => {
  do_not_optimize(rA2.areStatesEqual(S1, S2));
});

// ------------------------------------------------------------- D3/D4
bench("D3/D4 areStatesEqual+плагин · A базовая", () => {
  do_not_optimize(rPA.areStatesEqual(S1, S2));
});
bench("D3/D4 areStatesEqual+плагин · B копия оболочек", () => {
  do_not_optimize(rPB.areStatesEqual(shell(S1), shell(S2)));
});
bench("D3/D4 areStatesEqual+плагин · A/A пол", () => {
  do_not_optimize(rPA2.areStatesEqual(S1, S2));
});

// ------------------------------------------------------------------ D2
// одна навигация = веер по 5 смонтированным узлам
bench("D2 веер×5 узлов · A базовая (те же ссылки, кэш попадает)", () => {
  for (const p of predsA) {
    do_not_optimize((p as (a: any, b: any) => boolean)(S1, FROM));
  }
});
bench("D2 веер×5 узлов · B копия оболочек на каждом узле", () => {
  for (const p of predsB) {
    do_not_optimize(
      (p as (a: any, b: any) => boolean)(shell(S1), shell(FROM)),
    );
  }
});
bench("D2 веер×5 узлов · A/A пол", () => {
  for (const p of predsA2) {
    do_not_optimize((p as (a: any, b: any) => boolean)(S1, FROM));
  }
});

void run();
