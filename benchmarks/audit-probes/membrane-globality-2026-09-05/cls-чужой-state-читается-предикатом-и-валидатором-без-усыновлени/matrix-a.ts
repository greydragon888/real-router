// Семейство «чужой-State · читается-предикатом-и-валидатором-без-усыновления».
// matrix-a: ЭКСПЕРИМЕНТ (а) — оригинал против предварительно скопированного
// КОНТЕЙНЕРА (мелкая копия оболочки State, листья params/search по ссылке) —
// по 5 дверям: D1 areStatesEqual·state1|state2, D2 shouldUpdateNode·(to,from),
// D3/D4 validateAreStatesEqualArgs·state1|state2, D5
// validateNavigateToStateArgs·state.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

type Bag = Record<string, unknown>;
type St = {
  name: string;
  params: Bag;
  search: Bag;
  path: string;
  context?: Bag;
};

const out = (s: string, d: unknown): void => {
  console.log(`${s} ${JSON.stringify(d)}`);
};

const routes = [
  { name: "home", path: "/home" },
  {
    name: "users",
    path: "/users/:uid",
    children: [
      { name: "list", path: "/list" },
      { name: "profile", path: "/p/:id" },
    ],
  },
] as never;

const mk = (plugin = false): any => {
  const r: any = createRouter(routes, {} as never, {} as never);
  if (plugin) r.usePlugin(validationPlugin() as never);
  return r;
};

// мелкая копия КОНТЕЙНЕРА: новая оболочка, листья — те же ссылки
const shell = (s: St): St => ({ ...s });
const leavesShared = (a: St, b: St): boolean =>
  a.params === b.params && a.search === b.search;

// ============================================================ ШАПКА: КОНТРОЛИ
const rc = mk();
const s1: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: { q: "z" },
  path: "/users/1/p/7",
};
const s1b: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: { q: "z" },
  path: "/users/1/p/7",
};
const s2diff: St = {
  name: "users.profile",
  params: { uid: "1", id: "8" },
  search: { q: "z" },
  path: "/users/1/p/8",
};
out("PC1 areStatesEqual дискриминирует [равные,разные]", [
  rc.areStatesEqual(s1, s1b),
  rc.areStatesEqual(s1, s2diff),
]);
const rp = mk(true);
let pcThrow = "NO-THROW";
try {
  rp.areStatesEqual({ name: 1 } as never, s1 as never);
} catch (e) {
  pcThrow = (e as Error).message;
}
out("PC2 validation-plugin ДЕЙСТВИТЕЛЬНО подключён (бросает)", pcThrow);

const predUsers = rc.shouldUpdateNode("users") as (a: any, b?: any) => boolean;
const predHome = rc.shouldUpdateNode("home") as (a: any, b?: any) => boolean;
const fromList: St = {
  name: "users.list",
  params: { uid: "1" },
  search: {},
  path: "/users/1/list",
};
out("PC3 shouldUpdateNode дискриминирует [users,home]", [
  predUsers(s1, fromList),
  predHome(s1, fromList),
]);

// ======================================================= D1 · эксперимент (а)
const d1 = {
  origDefault: rc.areStatesEqual(s1, s1b),
  copyDefault: rc.areStatesEqual(shell(s1), shell(s1b)),
  origFull: rc.areStatesEqual(s1, s1b, false),
  copyFull: rc.areStatesEqual(shell(s1), shell(s1b), false),
  origUnequal: rc.areStatesEqual(s1, s2diff),
  copyUnequal: rc.areStatesEqual(shell(s1), shell(s2diff)),
  origUndefinedArm: rc.areStatesEqual(undefined, s1),
  copyUndefinedArm: rc.areStatesEqual(undefined, shell(s1)),
  листьяОбщие: leavesShared(s1, shell(s1)),
};
out("D1 (а) оригинал vs копия оболочки", d1);
out("D1 (а) все следствия совпали", {
  same:
    d1.origDefault === d1.copyDefault &&
    d1.origFull === d1.copyFull &&
    d1.origUnequal === d1.copyUnequal &&
    d1.origUndefinedArm === d1.copyUndefinedArm,
});
(s1.params as Bag).id = "MUTATED-AFTER";
out("D1 (а) после мутации оригинала getState()", rc.getState() ?? null);
(s1.params as Bag).id = "7";

// ======================================================= D2 · эксперимент (а)
const sweep: [string, St, St | undefined][] = [
  ["profile←list", s1, fromList],
  ["profile←home", s1, { name: "home", params: {}, search: {}, path: "/home" }],
  ["profile←profile-иной-uid", s1, { ...s1, params: { uid: "9", id: "7" } }],
  ["profile-без-from", s1, undefined],
];
const nodes = ["", "users", "users.profile", "users.list", "home"];
const d2rows: Record<string, unknown> = {};
let d2same = true;
for (const [label, to, from] of sweep) {
  for (const n of nodes) {
    const p = rc.shouldUpdateNode(n) as (a: any, b?: any) => boolean;
    const orig = p(to, from);
    const copy = p(shell(to), from ? shell(from) : undefined);
    d2rows[`${label}|${n || "<root>"}`] = [orig, copy];
    if (orig !== copy) d2same = false;
  }
}
out("D2 (а) свип узел×пара [оригинал,копия]", d2rows);
out("D2 (а) все ответы совпали", { same: d2same });

const to3: St = { ...s1, params: { uid: "1", id: "7" } };
const from3: St = { ...fromList, params: { uid: "1" } };
const pU = rc.shouldUpdateNode("users") as (a: any, b?: any) => boolean;
const before = pU(to3, from3);
(from3.params as Bag).uid = "999";
const afterOrig = pU(to3, from3);
const afterCopy = pU(shell(to3), shell(from3));
out("D2 (а) кэш идентичности vs копия при мутации листа", {
  before,
  afterOrig_кэш: afterOrig,
  afterCopy_пересчёт: afterCopy,
  копияДаётСВЕЖИЙОтвет: afterOrig !== afterCopy,
});

// ==================================================== D3/D4 · эксперимент (а)
const d34 = {
  origDefault: rp.areStatesEqual(s1, s1b),
  copyDefault: rp.areStatesEqual(shell(s1), shell(s1b)),
  origFull: rp.areStatesEqual(s1, s1b, false),
  copyFull: rp.areStatesEqual(shell(s1), shell(s1b), false),
  origUnequal: rp.areStatesEqual(s1, s2diff),
  copyUnequal: rp.areStatesEqual(shell(s1), shell(s2diff)),
};
out("D3/D4 (а) с плагином, оригинал vs копия", d34);
out("D3/D4 (а) все следствия совпали", {
  same:
    d34.origDefault === d34.copyDefault &&
    d34.origFull === d34.copyFull &&
    d34.origUnequal === d34.copyUnequal,
});

const runHostileValidator = (target: 0 | 1): Record<string, unknown> => {
  const r = mk(true);
  const ints = getInternals(r as never) as any;
  const orig = ints.validator.state.validateAreStatesEqualArgs;
  ints.validator.state.validateAreStatesEqualArgs = (
    a: any,
    b: any,
    q: any,
  ): void => {
    orig(a, b, q);
    const victim = target === 0 ? a : b;
    if (victim && typeof victim === "object" && victim.params) {
      (victim.params as Bag).id = "MUTATED-BY-VALIDATOR";
    }
  };
  const A: St = { ...s1, params: { uid: "1", id: "7" } };
  const B: St = { ...s1, params: { uid: "1", id: "7" } };
  const eqOrig = r.areStatesEqual(A, B);
  const A2: St = { ...s1, params: { uid: "1", id: "7" } };
  const B2: St = { ...s1, params: { uid: "1", id: "7" } };
  const eqCopy = r.areStatesEqual(shell(A2), shell(B2));
  return { eqOrig, eqCopy, копияОболочкиНеСпасает: eqOrig === eqCopy };
};
out("D3 враждебный валидатор правит args[0].params", runHostileValidator(0));
out("D4 враждебный валидатор правит args[1].params", runHostileValidator(1));

// ======================================================= D5 · эксперимент (а)
const runNav = async (useCopy: boolean): Promise<Record<string, unknown>> => {
  const r = mk(true);
  const api = getPluginApi(r as never) as any;
  await new Promise<void>((res) => {
    r.start("/home", () => {
      res();
    });
  });
  const st: St = {
    name: "users.profile",
    params: { uid: "1", id: "9" },
    search: { q: "z" },
    path: "/users/1/p/9?q=z",
    context: { own: 1 },
  };
  const passed = useCopy ? shell(st) : st;
  await api.navigateToState(passed as never, {} as never);
  const committed = r.getState();
  return {
    path: committed?.path,
    params: JSON.stringify(committed?.params),
    search: JSON.stringify(committed?.search),
    committedShellIsCallerShell: committed === passed,
    committedParamsIsCallerBag: committed?.params === st.params,
    committedSearchIsCallerBag: committed?.search === st.search,
    committedContextIsCallerContext: committed?.context === st.context,
    shellFrozen: Object.isFrozen(committed),
    callerParamsFrozen: Object.isFrozen(st.params),
    callerContextFrozen: Object.isFrozen(st.context),
    href: r.buildPath(committed.name, committed.params),
  };
};

const hostileNav = async (
  useCopy: boolean,
): Promise<Record<string, unknown>> => {
  const r = mk(true);
  const ints = getInternals(r as never) as any;
  const o = ints.validator.navigation.validateNavigateToStateArgs;
  ints.validator.navigation.validateNavigateToStateArgs = (s: any): void => {
    o(s);
    if (s?.params) (s.params as Bag).id = "MUTATED-BY-PLUGIN-FRAME";
    if (typeof s?.search === "object" && s.search)
      (s.search as Bag).q = "MUTATED";
  };
  const api = getPluginApi(r as never) as any;
  await new Promise<void>((res) => {
    r.start("/home", () => {
      res();
    });
  });
  const st: St = {
    name: "users.profile",
    params: { uid: "1", id: "9" },
    search: { q: "z" },
    path: "/users/1/p/9?q=z",
  };
  await api.navigateToState((useCopy ? shell(st) : st) as never, {} as never);
  const c = r.getState();
  return {
    coreReadsAfterFrame_path: c?.path,
    coreReadsAfterFrame_params: JSON.stringify(c?.params),
    coreReadsAfterFrame_search: JSON.stringify(c?.search),
  };
};

void (async (): Promise<void> => {
  const orig = await runNav(false);
  const copy = await runNav(true);
  out("D5 (а) оригинал", orig);
  out("D5 (а) копия", copy);
  out("D5 (а) все следствия совпали", {
    same: JSON.stringify(orig) === JSON.stringify(copy),
  });
  out("D5 враждебный валидатор · оригинал", await hostileNav(false));
  out("D5 враждебный валидатор · копия оболочки", await hostileNav(true));
})();
