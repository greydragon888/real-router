/**
 * ОПРОВЕРГАТЕЛЬ · линза 1 (семантика) для двери
 * Router.shouldUpdateNode·(toState,fromState).
 *
 * Вопрос: модульный двухслотовый кэш transitionPath.ts (cached1To/cached1From …)
 * ключуется ТОЛЬКО парой объектов вызывающего и общий на процесс. Если те же
 * два объекта State пройдут через shouldUpdateNode ДВУХ РАЗНЫХ роутеров с
 * РАЗНЫМИ деревьями, второй роутер получит ответ, посчитанный по мете ПЕРВОГО.
 *
 * Если так — стратегия (а) (копия контейнера на границе) НЕ ломает семантику,
 * а ЧИНИТ её: копия промахивается мимо кэша и пересчитывает по своей мете.
 *
 * Позитивный контроль: тот же второй роутер, но со СВЕЖЕЙ парой объектов
 * (structuredClone-подобная копия оболочек) — ответ, который он даёт «честно».
 */
import { createRouter } from "@real-router/core";
import type { State } from "@real-router/core/types";

const mkShell = (name: string, params: Record<string, string>): State =>
  ({
    name,
    params,
    path: "/",
    search: {},
    context: {},
  }) as unknown as State;

// Роутер A: users.profile — ребёнок users, сегмент users имеет параметр :uid
const routerA = createRouter([
  {
    name: "users",
    path: "/users/:uid",
    children: [{ name: "profile", path: "/p/:id" }],
  },
  { name: "home", path: "/home" },
]);

// Роутер B: ТЕ ЖЕ имена, но users БЕЗ параметра — сегмент "users" в B не
// зависит от uid, значит при смене uid узел "users" в B обновляться НЕ должен,
// тогда как в A — должен.
const routerB = createRouter([
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/p/:id" }],
  },
  { name: "home", path: "/home" },
]);

const toState = mkShell("users.profile", { uid: "2", id: "9" });
const fromState = mkShell("users.profile", { uid: "1", id: "9" });

// свежая пара той же формы (промах кэша по идентичности)
const toFresh = mkShell("users.profile", { uid: "2", id: "9" });
const fromFresh = mkShell("users.profile", { uid: "1", id: "9" });

const predA = routerA.shouldUpdateNode("users");
const predB = routerB.shouldUpdateNode("users");

// 1) честный контроль: B на СВЕЖИХ объектах (кэш промахивается)
const bHonest = predB(toFresh, fromFresh);

// 2) A первым греет кэш теми же объектами …
const aWarm = predA(toState, fromState);
// 3) … и B тут же спрашивают ТЕМИ ЖЕ объектами
const bAfterA = predB(toState, fromState);

// 4) стратегия (а): B получает КОПИИ оболочек — промах кэша
const bWithCopy = predB({ ...toState }, { ...fromState });

console.log(
  "VERIFY · D2 кросс-роутерный кэш",
  JSON.stringify({
    bHonest,
    aWarm,
    bAfterA,
    bWithCopy,
    "B_отдалЧужойОтвет": bAfterA !== bHonest,
    "копияВосстановилаЧестныйОтвет": bWithCopy === bHonest,
  }),
);

// Позитивный контроль дискриминации предикатов: узел "users" в A реагирует на
// uid, в B — нет (на свежих объектах, без загрязнения кэша).
const pcA = routerA.shouldUpdateNode("users")(
  mkShell("users.profile", { uid: "5", id: "9" }),
  mkShell("users.profile", { uid: "4", id: "9" }),
);
const pcB = routerB.shouldUpdateNode("users")(
  mkShell("users.profile", { uid: "7", id: "9" }),
  mkShell("users.profile", { uid: "6", id: "9" }),
);
console.log(
  "VERIFY · PC дискриминация узла users",
  JSON.stringify({ pcA, pcB, "различаются": pcA !== pcB }),
);
