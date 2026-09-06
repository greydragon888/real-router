// matrix-a2: продолжение эксперимента (а).
// D2 — дискриминирующий случай кэша идентичности (узел "users", обе стороны
// users.profile: равные сегменты → intersection="users.profile" → узел "users"
// НЕ обновляется; различный uid → intersection="" → обновляется).
// D5 — navigateToState: оригинал vs копия оболочки + враждебный кадр валидатора.
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
const shell = (s: St): St => ({ ...s });

// ========================================= D2 · дискриминирующий кэш-случай
const rc = mk();
const pUsers = rc.shouldUpdateNode("users") as (a: any, b?: any) => boolean;

// ПОЗИТИВНЫЙ КОНТРОЛЬ дискриминации: свежие объекты, uid равные vs разные
const eqTo: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: {},
  path: "/users/1/p/7",
};
const eqFrom: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: {},
  path: "/users/1/p/7",
};
const neqFrom: St = {
  name: "users.profile",
  params: { uid: "9", id: "7" },
  search: {},
  path: "/users/9/p/7",
};
out("D2 PC · узел users: [равный uid, разный uid]", [
  pUsers(eqTo, eqFrom),
  pUsers(eqTo, neqFrom),
]);

// СТАРЕНИЕ: те же ссылки, лист мутируется между вызовами
const to: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: {},
  path: "/users/1/p/7",
};
const from: St = {
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: {},
  path: "/users/1/p/7",
};
const first = pUsers(to, from);
(from.params as Bag).uid = "999";
const afterOrig = pUsers(to, from);
const afterCopy = pUsers(shell(to), shell(from));
out("D2 (а) старение кэша идентичности", {
  first_равные: first,
  afterOrig_теЖеСсылки: afterOrig,
  afterCopy_копияОболочки: afterCopy,
  копияДаётСВЕЖИЙОтвет: afterOrig !== afterCopy,
  свежийОтветСовпадаетСКонтролем: afterCopy === pUsers(shell(to), shell(from)),
});

// счётчик чтений: попадание в кэш = ноль чтений оболочки
let reads = 0;
const cnt = (o: St): St =>
  new Proxy(o as unknown as Bag, {
    get(t, k, r) {
      if (k === "name") reads += 1;
      return Reflect.get(t, k, r);
    },
    has(t, k) {
      return Reflect.has(t, k);
    },
  }) as unknown as St;
const cTo = cnt({
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: {},
  path: "/x",
});
const cFrom = cnt({
  name: "users.list",
  params: { uid: "1" },
  search: {},
  path: "/y",
});
pUsers(cTo, cFrom);
const r1 = reads;
pUsers(cTo, cFrom);
const r2 = reads;
pUsers(shell(cTo), shell(cFrom));
const r3 = reads;
out("D2 удержание по идентичности (чтения name)", {
  afterFirst: r1,
  afterSecond_теЖеСсылки: r2,
  afterThird_копии: r3,
  кэшПопал: r2 === r1,
  копияПромахнулась: r3 > r2,
});

// =============================================================== D5 · (а)
const runNav = async (useCopy: boolean): Promise<Record<string, unknown>> => {
  const r = mk(true);
  const api = getPluginApi(r as never) as any;
  await r.start("/home");
  const st: St = {
    name: "users.profile",
    params: { uid: "1", id: "9" },
    search: { q: "z" },
    path: "/users/1/p/9?q=z",
    context: { own: 1 },
  };
  const passed = useCopy ? shell(st) : st;
  await api.navigateToState(passed as never, {} as never);
  const c = r.getState();
  const res = {
    path: c?.path,
    name: c?.name,
    params: JSON.stringify(c?.params),
    search: JSON.stringify(c?.search),
    context: JSON.stringify(c?.context ?? null),
    committedShellIsCallerShell: c === passed,
    committedParamsIsCallerBag: c?.params === st.params,
    committedSearchIsCallerBag: c?.search === st.search,
    committedContextIsCallerContext: c?.context === st.context,
    shellFrozen: Object.isFrozen(c),
    callerParamsFrozen: Object.isFrozen(st.params),
    callerSearchFrozen: Object.isFrozen(st.search),
    callerContextFrozen: Object.isFrozen(st.context),
    href: r.buildPath(c.name, c.params),
  };
  // обратная видимость: мутируем ОРИГИНАЛ после коммита
  (st.params as Bag).id = "AFTER-COMMIT";
  return { ...res, paramsAfterCallerMutation: JSON.stringify(r.getState()?.params) };
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
    if (s?.search) (s.search as Bag).q = "MUTATED";
    if (typeof s?.path === "string") s.path = "/users/1/p/OVERWRITTEN";
  };
  const api = getPluginApi(r as never) as any;
  await r.start("/home");
  const st: St = {
    name: "users.profile",
    params: { uid: "1", id: "9" },
    search: { q: "z" },
    path: "/users/1/p/9?q=z",
  };
  await api.navigateToState((useCopy ? shell(st) : st) as never, {} as never);
  const c = r.getState();
  return {
    path: c?.path,
    params: JSON.stringify(c?.params),
    search: JSON.stringify(c?.search),
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
  out("D5 враждебный кадр валидатора · оригинал", await hostileNav(false));
  out("D5 враждебный кадр валидатора · копия оболочки", await hostileNav(true));
})();
