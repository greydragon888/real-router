/**
 * МАТРИЦА семейства «валидатор·мешки-каналов-на-фасаде-Router» (8 дверей).
 *
 * Строки — двери: {isActiveRoute, buildPath, canNavigateTo, navigate} × {params, search}.
 * Столбцы — эксперимент (а), P1, P2, P3, P4.
 *
 * Инструмент — РЕАЛЬНЫЙ @real-router/validation-plugin (не proxy-заглушка):
 * семейство существует только при установленном плагине.
 */
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";
import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b/:id?q" },
];

type R = ReturnType<typeof createRouter>;

async function mk(withPlugin: boolean): Promise<R> {
  const r = createRouter(routes as never, {} as never);

  if (withPlugin) {
    r.usePlugin(validationPlugin() as never);
  }
  await r.start("/b/1?q=x");

  return r as R;
}

const out = (row: string, data: unknown): void => {
  console.log(JSON.stringify({ row, ...(data as object) }));
};

const attempt = <T>(f: () => T): { ok: boolean; value?: T; err?: string } => {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
};

// Каждая дверь: как её позвать мешком `bag` (вторая арка получает штатный мешок).
const doors: {
  id: string;
  channel: "params" | "search";
  bag: () => Record<string, string>;
  call: (r: R, bag: unknown) => unknown;
}[] = [
  {
    id: "isActiveRoute·params",
    channel: "params",
    bag: () => ({ id: "1" }),
    call: (r, b) =>
      r.isActiveRoute("b", b as never, { q: "x" }, true, false),
  },
  {
    id: "isActiveRoute·search",
    channel: "search",
    bag: () => ({ q: "x" }),
    call: (r, b) =>
      r.isActiveRoute("b", { id: "1" }, b as never, true, false),
  },
  {
    id: "buildPath·params",
    channel: "params",
    bag: () => ({ id: "1" }),
    call: (r, b) => r.buildPath("b", b as never, { q: "x" }),
  },
  {
    id: "buildPath·search",
    channel: "search",
    bag: () => ({ q: "x" }),
    call: (r, b) => r.buildPath("b", { id: "1" }, b as never),
  },
  {
    id: "canNavigateTo·params",
    channel: "params",
    bag: () => ({ id: "1" }),
    call: (r, b) => r.canNavigateTo("b", b as never, { q: "x" }),
  },
  {
    id: "canNavigateTo·search",
    channel: "search",
    bag: () => ({ q: "x" }),
    call: (r, b) => r.canNavigateTo("b", { id: "1" }, b as never),
  },
  {
    id: "navigate·routeParams",
    channel: "params",
    bag: () => ({ id: "2" }),
    call: (r, b) => r.navigate("b", b as never, { q: "x" }),
  },
  {
    id: "navigate·search",
    channel: "search",
    bag: () => ({ q: "y" }),
    call: (r, b) => r.navigate("b", { id: "1" }, b as never),
  },
];

/** Ждём результат двери, не роняя пробу на отказе навигации. */
async function settle(v: unknown): Promise<unknown> {
  if (v !== null && typeof v === "object" && "then" in (v as object)) {
    try {
      const st = (await (v as Promise<unknown>)) as { path?: string };

      return "resolved:" + String(st.path);
    } catch (e) {
      return "rejected:" + ((e as { code?: string }).code ?? (e as Error).message);
    }
  }

  return v;
}

async function sectionA(): Promise<void> {
  // ЭКСПЕРИМЕНТ (а): оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО контейнера.
  for (const withPlugin of [true, false]) {
    for (const d of doors) {
      const orig: Record<string, string> = d.bag();
      const copy = { ...orig };

      const rO = await mk(withPlugin);
      const rC = await mk(withPlugin);

      const vO = await settle(d.call(rO, orig));
      const vC = await settle(d.call(rC, copy));

      const sO = rO.getState();
      const sC = rC.getState();

      // Обратная видимость: мутируем ОРИГИНАЛ ПОСЛЕ вызова — видит ли ядро.
      orig.id = "AFTER";
      orig.q = "AFTER";
      const afterO = JSON.stringify({
        params: sO?.params,
        search: sO?.search,
        path: sO?.path,
      });

      out("A·" + d.id, {
        withPlugin,
        resultOriginal: vO,
        resultCopy: vC,
        resultsEqual: JSON.stringify(vO ?? null) === JSON.stringify(vC ?? null),
        stateEqual:
          JSON.stringify({ p: sO?.params, s: sO?.search, path: sO?.path }) ===
          JSON.stringify({ p: sC?.params, s: sC?.search, path: sC?.path }),
        stateParamsIsCallerBag: sO?.params === (orig as never),
        stateSearchIsCallerBag: sO?.search === (orig as never),
        backVisibilityAfterMutatingOriginal: afterO,
      });
    }
  }

  // Подпункт: ГДЕ стоит копия. Копия ДО кадра валидатора стирает диагностику
  // (валидатор судит уже не объект вызывающего), копия ПОСЛЕ — не стирает.
  const rp = await mk(true);
  const arr: unknown = ["x"];
  out("A·ordering·array-as-params", {
    original: attempt(() => rp.buildPath("b", arr as never)),
    shallowCopyOfArray: attempt(() =>
      rp.buildPath("b", { ...(arr as object) } as never),
    ),
  });
  const inst = new (class {
    id = "1";
  })();
  out("A·ordering·class-instance-as-params", {
    original: attempt(() => rp.buildPath("b", inst as never)),
    shallowCopy: attempt(() => rp.buildPath("b", { ...inst } as never)),
  });
}

async function sectionB(): Promise<void> {
  // P1 — счёт проходов по ключу (countingBag) + ДРЕЙФУЮЩИЙ вход (driftingBag).
  for (const d of doors) {
    const key = d.channel === "params" ? "id" : "q";
    const rows: Record<string, unknown> = { door: d.id };

    for (const withPlugin of [true, false]) {
      const r = await mk(withPlugin);
      const counted = countingBag(d.bag());
      const v = await settle(d.call(r, counted.bag));

      const r2 = await mk(withPlugin);
      const drift = driftingBag(
        d.bag(),
        d.channel === "params" ? { id: "MUT" } : { q: "MUT" },
      );
      const v2 = await settle(d.call(r2, drift.bag));
      const s2 = r2.getState();

      const tag = withPlugin ? "withPlugin" : "noPlugin";
      rows[tag + "_reads_" + key] = counted.reads[key] ?? 0;
      rows[tag + "_result"] = v;
      rows[tag + "_driftResult"] = v2;
      rows[tag + "_driftStatePath"] = s2?.path;
      rows[tag + "_driftReads"] = drift.reads[key] ?? 0;
    }
    out("B·P1·" + d.id, rows);
  }
}

async function sectionC(): Promise<void> {
  // P2 — лгущий Proxy, две формы.
  // Форма (i): ownKeys НЕ называет ключ, getOwnPropertyDescriptor лжёт «собственный».
  for (const d of doors) {
    const target: Record<string, unknown> = { ...d.bag() };
    const lying = new Proxy(target, {
      ownKeys: (t) => Reflect.ownKeys(t),
      getOwnPropertyDescriptor: (t, k) =>
        k === "smuggled"
          ? { value: "SMUGGLED", enumerable: true, configurable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
      get: (t, k, rec) =>
        k === "smuggled" ? "SMUGGLED" : Reflect.get(t, k, rec),
    });

    const r = await mk(true);
    const res = attempt(() => d.call(r, lying));
    const v = res.ok ? await settle(res.value) : undefined;
    const s = r.getState();

    out("C·P2·i·" + d.id, {
      ok: res.ok,
      err: res.err,
      result: v,
      statePath: s?.path,
      smuggledInParams: Object.hasOwn(
        (s?.params ?? {}) as object,
        "smuggled",
      ),
      smuggledInSearch: Object.hasOwn(
        (s?.search ?? {}) as object,
        "smuggled",
      ),
    });
  }

  // Форма (ii): ключ ИЗ ЦЕПОЧКИ ПРОТОТИПОВ + gOPD лжёт «собственный» —
  // валидатор (for…in + hasOwn) видит ключ, которого objectKeys ядра не видит.
  const proto = Object.prototype as unknown as Record<string, unknown>;
  const mkLiar = (t: Record<string, unknown>): Record<string, unknown> =>
    new Proxy(t, {
      getOwnPropertyDescriptor: (tt, k) =>
        k === "evil"
          ? { value: Symbol("evil"), enumerable: true, configurable: true }
          : Reflect.getOwnPropertyDescriptor(tt, k),
      get: (tt, k, rec) =>
        k === "evil" ? Symbol("evil") : Reflect.get(tt, k, rec),
    });

  // ⚠ Роутеры строим ДО загрязнения прототипа: validatePluginKeys перечисляет
  // ключи фабрики через for…in и упал бы на унаследованном `evil`.
  const rP = await mk(true);
  const rN = await mk(false);

  try {
    Object.defineProperty(proto, "evil", {
      value: Symbol("proto-evil"),
      enumerable: true,
      configurable: true,
      writable: true,
    });

    // позитивный контроль инструмента: for…in ЛЮБОГО простого объекта видит evil
    const seenByForIn: string[] = [];
    for (const k in { id: "1" }) {
      seenByForIn.push(k);
    }

    out("C·P2·ii·control", {
      forInSeesProtoKey: seenByForIn,
      hasOwnHonest: Object.hasOwn({ id: "1" }, "evil"),
      honestProxy_buildPath: attempt(() =>
        rP.buildPath("b", new Proxy({ id: "1" }, {}) as never),
      ),
    });

    out("C·P2·ii·buildPath·params", {
      withPlugin: attempt(() => rP.buildPath("b", mkLiar({ id: "1" }) as never)),
      noPlugin: attempt(() => rN.buildPath("b", mkLiar({ id: "1" }) as never)),
    });
    out("C·P2·ii·isActiveRoute·params", {
      withPlugin: attempt(() =>
        rP.isActiveRoute("b", mkLiar({ id: "1" }) as never, { q: "x" }),
      ),
      noPlugin: attempt(() =>
        rN.isActiveRoute("b", mkLiar({ id: "1" }) as never, { q: "x" }),
      ),
    });
    out("C·P2·ii·canNavigateTo·params", {
      withPlugin: attempt(() =>
        rP.canNavigateTo("b", mkLiar({ id: "1" }) as never, { q: "x" }),
      ),
      noPlugin: attempt(() =>
        rN.canNavigateTo("b", mkLiar({ id: "1" }) as never, { q: "x" }),
      ),
    });
    const navP = await attempt(() =>
      rP.navigate("b", mkLiar({ id: "1" }) as never, { q: "x" }),
    );
    let navPResolved: unknown = navP.ok ? "pending" : navP.err;
    if (navP.ok) {
      try {
        await (navP.value as never as Promise<unknown>);
        navPResolved = "resolved:" + String(rP.getState()?.path);
      } catch (e) {
        navPResolved = "rejected:" + (e as Error).message;
      }
    }
    out("C·P2·ii·navigate·params", { withPlugin: navPResolved });

    // search-двери: валидатор мешок НЕ перечисляет — контроль на той же форме
    out("C·P2·ii·buildPath·search", {
      withPlugin: attempt(() =>
        rP.buildPath("b", { id: "1" }, mkLiar({ q: "x" }) as never),
      ),
      noPlugin: attempt(() =>
        rN.buildPath("b", { id: "1" }, mkLiar({ q: "x" }) as never),
      ),
    });
  } finally {
    delete proto.evil;
  }
}

async function sectionD(): Promise<void> {
  // P3 — унаследованный аксессор под именем ключа + собственный "__proto__".
  const proto = Object.prototype as unknown as Record<string, unknown>;
  let setterCalls = 0;
  let getterCalls = 0;

  try {
    Object.defineProperty(proto, "id", {
      configurable: true,
      get(): unknown {
        getterCalls += 1;

        return "FROM_PROTO";
      },
      set(): void {
        setterCalls += 1;
      },
    });

    // позитивный контроль ловушки: обычный [[Set]] в пустой объект её ловит
    const ctl: Record<string, unknown> = {};
    (ctl as { id?: unknown }).id = "x";
    const controlSetterCalls = setterCalls;

    const r = await mk(true);
    const st = await r.navigate("b", { id: "3" }, { q: "x" });

    // Каждый sibling отдельно, без аналогии: три непубликующие двери
    // проходят тот же полюс под тем же загрязнением.
    const sib = {
      buildPath: attempt(() => r.buildPath("b", { id: "5" }, { q: "x" })),
      isActiveRoute: attempt(() =>
        r.isActiveRoute("b", { id: "3" }, { q: "x" }, true, false),
      ),
      canNavigateTo: attempt(() => r.canNavigateTo("b", { id: "5" }, { q: "x" })),
    };

    out("D·P3·siblings-under-pollution", {
      ...sib,
      setterCallsTotal: setterCalls - controlSetterCalls,
      getterCalls,
    });

    out("D·P3·inherited-accessor", {
      controlSetterCalls,
      setterCallsAfterNavigate: setterCalls - controlSetterCalls,
      getterCalls,
      statePath: st.path,
      stateParamsId: (st.params as Record<string, unknown>).id,
      stateParamsProto: Object.getPrototypeOf(st.params) === null,
    });
  } finally {
    delete proto.id;
  }

  const polluting = JSON.parse(
    '{"__proto__":{"polluted":1},"id":"1"}',
  ) as Record<string, unknown>;
  const r2 = await mk(true);
  const nav = await attempt(() => r2.navigate("b", polluting as never));
  let navOut: unknown;
  if (nav.ok) {
    try {
      const st = (await (nav.value as never as Promise<unknown>)) as {
        path: string;
        params: Record<string, unknown>;
      };
      navOut = {
        path: st.path,
        ownKeys: Object.getOwnPropertyNames(st.params),
      };
    } catch (e) {
      navOut = "rejected:" + (e as Error).message;
    }
  } else {
    navOut = "threw:" + nav.err;
  }

  out("D·P3·own-__proto__", {
    inputHasOwnProto: Object.hasOwn(polluting, "__proto__"),
    navigate: navOut,
    buildPath: attempt(() => r2.buildPath("b", polluting as never)),
    isActiveRoute: attempt(() =>
      r2.isActiveRoute("b", polluting as never, { q: "x" }, false, false),
    ),
    canNavigateTo: attempt(() => r2.canNavigateTo("b", polluting as never)),
    prototypePolluted:
      ({} as Record<string, unknown>).polluted !== undefined,
  });
}

async function sectionE(): Promise<void> {
  // P4 — что заморожено после прохода через дверь.
  const nested = { deep: 1 };
  const paramsBag: Record<string, unknown> = { id: "4", extra: nested };
  const searchBag: Record<string, unknown> = { q: "x" };

  const r = await mk(true);
  const st = await r.navigate("b", paramsBag as never, searchBag as never);

  out("E·P4·navigate", {
    callerParamsFrozen: Object.isFrozen(paramsBag),
    callerNestedFrozen: Object.isFrozen(nested),
    callerSearchFrozen: Object.isFrozen(searchBag),
    stateFrozen: Object.isFrozen(st),
    stateParamsFrozen: Object.isFrozen(st.params),
    stateSearchFrozen: Object.isFrozen(st.search),
    stateParamsIsCallerBag: (st.params as unknown) === paramsBag,
    stateParamsExtraIsCallerNested:
      (st.params as Record<string, unknown>).extra === nested,
    statePath: st.path,
  });

  // Непубликующие двери — заморозки нет по замыслу; проверяем, что мешок цел.
  const r2 = await mk(true);
  const p2: Record<string, unknown> = { id: "1", extra: { deep: 1 } };
  r2.buildPath("b", p2 as never, { q: "x" });
  r2.isActiveRoute("b", p2 as never, { q: "x" }, true, false);
  r2.canNavigateTo("b", p2 as never, { q: "x" });
  out("E·P4·non-publishing-doors", {
    callerParamsFrozen: Object.isFrozen(p2),
    callerNestedFrozen: Object.isFrozen(p2.extra as object),
  });
}

async function main(): Promise<void> {
  const ctlR = await mk(true);
  out("CONTROL·plugin-installed", {
    validatorInstalled: getInternals(ctlR).validator !== null,
    validatorRejectsArray: attempt(() => ctlR.buildPath("b", [] as never)),
    legalPathBuilds: ctlR.buildPath("b", { id: "1" }, { q: "x" }),
  });
  const ctlN = await mk(false);
  out("CONTROL·no-plugin", {
    validatorInstalled: getInternals(ctlN).validator !== null,
    arrayGoesUnjudged: attempt(() => ctlN.buildPath("b", [] as never)),
  });

  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  await sectionE();
}

void main();
