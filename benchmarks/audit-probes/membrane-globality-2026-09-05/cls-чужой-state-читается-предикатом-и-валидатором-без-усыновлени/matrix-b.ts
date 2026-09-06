// matrix-b: свойства P1–P4 по 5 дверям семейства.
// P1 — счёт чтений на ключ + ДРЕЙФУЮЩИЙ вход (второе чтение отвечает иначе).
// P2 — лгущий Proxy (ownKeys не называет ключ, gOPD утверждает «собственный»).
// P3 — унаследованный аксессор + собственный "__proto__" из JSON.parse.
// P4 — заморозка: уровень ядра морозится, вложенный мешок вызывающего — нет.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";
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
const bare = mk();
const withP = mk(true);

const base = (): St => ({
  name: "users.profile",
  params: { uid: "1", id: "7" },
  search: { q: "z" },
  path: "/users/1/p/7",
});

// ============================================================== P1 · D1/D3/D4
// счёт чтений оболочки вызывающего: без плагина и с плагином
const countShell = (r: any, ignoreQP: boolean): Record<string, unknown> => {
  const a = countingBag(base());
  const b = countingBag(base());
  const eq = r.areStatesEqual(a.bag, b.bag, ignoreQP);
  return { eq, state1: { ...a.reads }, state2: { ...b.reads } };
};
out("P1 · D1 без плагина, default arm", countShell(bare, true));
out("P1 · D1 без плагина, full arm", countShell(bare, false));
out("P1 · D3/D4 С плагином, default arm", countShell(withP, true));
out("P1 · D3/D4 С плагином, full arm", countShell(withP, false));

// счёт чтений ЛИСТА params вызывающего
const countParams = (r: any): Record<string, unknown> => {
  const p1 = countingBag({ uid: "1", id: "7" });
  const p2 = countingBag({ uid: "1", id: "7" });
  const eq = r.areStatesEqual(
    { ...base(), params: p1.bag },
    { ...base(), params: p2.bag },
  );
  return { eq, params1: { ...p1.reads }, params2: { ...p2.reads } };
};
out("P1 · D1 листья params, без плагина", countParams(bare));
out("P1 · D3/D4 листья params, С плагином", countParams(withP));

// ДРЕЙФУЮЩИЙ вход: name отвечает "users.profile" на 1-м чтении и "home" далее.
const drift = (r: any): Record<string, unknown> => {
  const a = driftingBag(base(), { name: "home" } as Partial<St>);
  const b = base();
  const eq = r.areStatesEqual(a.bag, b, true);
  return { eq, reads: { ...a.reads } };
};
const dBare = drift(bare);
const dPlug = drift(withP);
out("P1 · D1 дрейф name, без плагина", dBare);
out("P1 · D3 дрейф name, С плагином", dPlug);
out("P1 · дрейф МЕНЯЕТ вердикт при плагине", {
  безПлагина: dBare.eq,
  сПлагином: dPlug.eq,
  ответЗависитОтНомераОбращения: dBare.eq !== dPlug.eq,
});

// дрейф на ВТОРОЙ позиции (D4)
const drift2 = (r: any): Record<string, unknown> => {
  const b = driftingBag(base(), { name: "home" } as Partial<St>);
  const eq = r.areStatesEqual(base(), b.bag, true);
  return { eq, reads: { ...b.reads } };
};
out("P1 · D4 дрейф name в позиции 2, без плагина", drift2(bare));
out("P1 · D4 дрейф name в позиции 2, С плагином", drift2(withP));

// ===================================================================== P1 · D2
const pUsers = bare.shouldUpdateNode("users") as (a: any, b?: any) => boolean;
const d2count = (): Record<string, unknown> => {
  const t = countingBag(base());
  const f = countingBag({
    name: "users.list",
    params: { uid: "1" },
    search: {},
    path: "/users/1/list",
  });
  const res = pUsers(t.bag, f.bag);
  return { res, to: { ...t.reads }, from: { ...f.reads } };
};
out("P1 · D2 счёт чтений оболочки (промах кэша)", d2count());

const d2drift = (): Record<string, unknown> => {
  const t = driftingBag(base(), { name: "home" } as Partial<St>);
  const f = {
    name: "users.list",
    params: { uid: "1" },
    search: {},
    path: "/users/1/list",
  };
  const res = pUsers(t.bag, f);
  const honest = pUsers({ ...base() }, { ...f });
  return { дрейф: res, честный: honest, reads: { ...t.reads }, разошлись: res !== honest };
};
out("P1 · D2 дрейф name", d2drift());

// ===================================================================== P1 · D5
void (async (): Promise<void> => {
  const r = mk(true);
  const api = getPluginApi(r as never) as any;
  await r.start("/home");
  const sh = countingBag({
    name: "users.profile",
    params: { uid: "1", id: "9" },
    search: { q: "z" },
    path: "/users/1/p/9?q=z",
  } as St);
  const pb = countingBag({ uid: "1", id: "9" });
  (sh.bag as any).params;
  const st = { ...(sh.bag as object) } as St;
  // считаем оболочку отдельно: передаём сам countingBag
  await api.navigateToState(sh.bag as never, {} as never);
  out("P1 · D5 чтения оболочки вызывающего", {
    reads: { ...sh.reads },
    committed: JSON.stringify(r.getState()?.params),
  });

  const r2 = mk(true);
  const api2 = getPluginApi(r2 as never) as any;
  await r2.start("/home");
  await api2.navigateToState(
    { ...base(), name: "users.profile", params: pb.bag, path: "/users/1/p/9" } as never,
    {} as never,
  );
  out("P1 · D5 чтения листа params вызывающего", {
    reads: { ...pb.reads },
    committed: JSON.stringify(r2.getState()?.params),
  });
  void st;

  // дрейф листа params на D5
  const r3 = mk(true);
  const api3 = getPluginApi(r3 as never) as any;
  await r3.start("/home");
  const dp = driftingBag({ uid: "1", id: "9" }, { id: "DRIFTED" });
  await api3.navigateToState(
    { ...base(), params: dp.bag, path: "/users/1/p/9" } as never,
    {} as never,
  );
  out("P1 · D5 дрейф листа params", {
    reads: { ...dp.reads },
    committed: JSON.stringify(r3.getState()?.params),
    попалоЛиДрейфнутое: JSON.stringify(r3.getState()?.params).includes("DRIFTED"),
  });

  // =================================================================== P2
  const lying = (real: Bag, hiddenKey: string): Bag =>
    new Proxy(real, {
      ownKeys: () => [],
      getOwnPropertyDescriptor: (t, k) =>
        k === hiddenKey
          ? { value: (t as Bag)[k], enumerable: true, configurable: true, writable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
      get: (t, k, rec) => Reflect.get(t, k, rec),
      has: (t, k) => Reflect.has(t, k),
    });

  // ПОЗИТИВНЫЙ КОНТРОЛЬ P2: честные мешки с одинаковым id → равны
  const honestEq = bare.areStatesEqual(
    { ...base(), params: { uid: "1", id: "7" } },
    { ...base(), params: { uid: "1", id: "7" } },
  );
  const lyingEq = bare.areStatesEqual(
    { ...base(), params: lying({ uid: "1", id: "7" }, "id") },
    { ...base(), params: { uid: "1", id: "7" } },
  );
  out("P2 · D1 лгущий params слева", {
    честныйКонтроль: honestEq,
    лгущий: lyingEq,
    ключНеПопалВСравнение: honestEq !== lyingEq,
  });
  const lyingFull = bare.areStatesEqual(
    { ...base(), search: lying({ q: "z" }, "q") },
    { ...base(), search: { q: "z" } },
    false,
  );
  out("P2 · D1 лгущий search (full arm)", {
    честныйКонтроль: bare.areStatesEqual(base(), base(), false),
    лгущий: lyingFull,
  });

  // P2 · D2 — перечисление ведёт МЕТА маршрута, не мешок вызывающего
  const p2d2 = pUsers(
    { ...base(), params: lying({ uid: "9", id: "7" }, "uid") },
    { ...base(), params: { uid: "1", id: "7" } },
  );
  const p2d2Honest = pUsers(
    { ...base(), params: { uid: "9", id: "7" } },
    { ...base(), params: { uid: "1", id: "7" } },
  );
  out("P2 · D2 лгущий params", {
    честный_разныйUid: p2d2Honest,
    лгущий_разныйUid: p2d2,
    совпали: p2d2 === p2d2Honest,
  });

  // P2 · D5 — попадёт ли скрытый ключ в закоммиченные params
  const r4 = mk(true);
  const api4 = getPluginApi(r4 as never) as any;
  await r4.start("/home");
  await api4.navigateToState(
    {
      ...base(),
      params: lying({ uid: "1", id: "9" }, "id"),
      path: "/users/1/p/9",
    } as never,
    {} as never,
  );
  out("P2 · D5 закоммиченные params", {
    committed: JSON.stringify(r4.getState()?.params),
    скрытыйКлючПопал: Object.hasOwn(r4.getState()?.params ?? {}, "id"),
  });

  // =================================================================== P3
  // унаследованный сеттер под именем ключа params
  const rec: unknown[] = [];
  let p3Threw = "NO-THROW";
  let committedP3: string | null = null;
  try {
    Object.defineProperty(Object.prototype, "id", {
      configurable: true,
      get(): unknown {
        return "FROM-PROTO";
      },
      set(v: unknown): void {
        rec.push(v);
      },
    });
    const r5 = mk(true);
    const api5 = getPluginApi(r5 as never) as any;
    await r5.start("/home");
    await api5.navigateToState(
      {
        ...base(),
        params: Object.assign(Object.create(null) as Bag, {
          uid: "1",
          id: "9",
        }),
        path: "/users/1/p/9",
      } as never,
      {} as never,
    );
    committedP3 = JSON.stringify(r5.getState()?.params ?? null);
  } catch (e) {
    p3Threw = `${(e as Error).constructor.name}: ${(e as Error).message}`;
  } finally {
    delete (Object.prototype as Bag).id;
  }
  out("P3 · D5 унаследованный аксессор 'id'", {
    бросило: p3Threw,
    сеттерПрототипаСработал: rec.length,
    committed: committedP3,
  });

  // собственный "__proto__" из JSON.parse
  const r6 = mk(true);
  const api6 = getPluginApi(r6 as never) as any;
  await r6.start("/home");
  const poisoned = JSON.parse(
    '{"uid":"1","id":"9","__proto__":{"polluted":1}}',
  ) as Bag;
  await api6.navigateToState(
    { ...base(), params: poisoned, path: "/users/1/p/9" } as never,
    {} as never,
  );
  const cp = r6.getState()?.params as Bag | undefined;
  out("P3 · D5 собственный __proto__ из JSON.parse", {
    committed: JSON.stringify(cp ?? null),
    осталсяКлючом: cp ? Object.hasOwn(cp, "__proto__") : null,
    подменилПрототип: (cp as any)?.polluted,
    глобальноеЗагрязнение: ({} as any).polluted,
  });

  // P3 · D1/D2 — записи нет; проверяем, что унаследованный name виден предикату
  let inherited: unknown = "n/a";
  try {
    Object.defineProperty(Object.prototype, "name", {
      configurable: true,
      get(): unknown {
        return "users.profile";
      },
    });
    const shellNoName = { params: { uid: "1", id: "7" }, search: {}, path: "/x" };
    inherited = {
      shouldUpdateNodeПринял: pUsers(shellNoName as never, {
        ...base(),
        name: "users.list",
      } as never),
      areStatesEqualВидитУнаследованное: bare.areStatesEqual(
        shellNoName as never,
        base() as never,
      ),
    };
  } catch (e) {
    inherited = `${(e as Error).constructor.name}: ${(e as Error).message}`;
  } finally {
    delete (Object.prototype as Bag).name;
  }
  out("P3 · D1/D2 унаследованный 'name' (чтение, не запись)", inherited);

  // =================================================================== P4
  const r7 = mk(true);
  const api7 = getPluginApi(r7 as never) as any;
  await r7.start("/home");
  const callerParams: Bag = { uid: "1", id: "9" };
  const callerSearch: Bag = { q: "z" };
  const callerCtx: Bag = { own: { deep: 1 } };
  const callerShell: St = {
    name: "users.profile",
    params: callerParams,
    search: callerSearch,
    path: "/users/1/p/9",
    context: callerCtx,
  };
  await api7.navigateToState(callerShell as never, {} as never);
  const c7 = r7.getState() as any;
  out("P4 · D5 заморозка", {
    ядроМорозитСвоюОболочку: Object.isFrozen(c7),
    committedParamsFrozen: Object.isFrozen(c7.params),
    committedSearchFrozen: Object.isFrozen(c7.search),
    committedContextFrozen: Object.isFrozen(c7.context),
    мешкиВызывающегоНеЗамёрзли: [
      Object.isFrozen(callerParams),
      Object.isFrozen(callerSearch),
      Object.isFrozen(callerCtx),
      Object.isFrozen(callerShell),
    ],
    вложенныйУровеньВызывающегоНеЗамёрз: Object.isFrozen(callerCtx.own),
  });

  const pf1: Bag = { uid: "1", id: "7" };
  const shellP4: St = { ...base(), params: pf1 };
  bare.areStatesEqual(shellP4, base());
  pUsers(shellP4, { ...base(), name: "users.list" });
  out("P4 · D1/D2 после прохода через предикаты", {
    оболочкаЗамёрзла: Object.isFrozen(shellP4),
    мешокParamsЗамёрз: Object.isFrozen(pf1),
  });
})();
