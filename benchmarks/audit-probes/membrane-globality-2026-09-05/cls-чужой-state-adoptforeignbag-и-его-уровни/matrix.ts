// Матрица семейства «чужой-State · adoptForeignBag (и его уровни)».
// Строки — двери, столбцы — эксперимент (а), P1, P2, P3, P4.
// Двери: PluginApi.navigateToState·state(+.context), RouterInternals.navigateToState·state,
//        RouterInternals.systemCommit·toState(+.context, .transition, .transition.segments, fromState).
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/cls-чужой-state-adoptforeignbag-и-его-уровни/matrix.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { State } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "u", path: "/u/:id?tab" },
] as never;

const out = (section: string, facts: Record<string, unknown>): void => {
  console.log(`\n## ${section}`);
  for (const [k, v] of Object.entries(facts)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
};

/** Счётчик обращений по ключу через Proxy (get/has/ownKeys). */
function counting<T extends object>(target: T): {
  bag: T;
  gets: Record<string, number>;
  has: Record<string, number>;
  ownKeysCalls: { n: number };
} {
  const gets: Record<string, number> = {};
  const has: Record<string, number> = {};
  const ownKeysCalls = { n: 0 };
  const bag = new Proxy(target, {
    get(t, k, rcv): unknown {
      if (typeof k === "string") gets[k] = (gets[k] ?? 0) + 1;
      return Reflect.get(t, k, rcv);
    },
    has(t, k): boolean {
      if (typeof k === "string") has[k] = (has[k] ?? 0) + 1;
      return Reflect.has(t, k);
    },
    ownKeys(t): ArrayLike<string | symbol> {
      ownKeysCalls.n++;
      return Reflect.ownKeys(t);
    },
  }) as T;
  return { bag, gets, has, ownKeysCalls };
}

/** Дрейфующий мешок: первый ответ на ключ — first[k], второй и далее — then[k]. */
function drifting<T extends object>(
  first: T,
  then: Partial<T>,
): { bag: T; gets: Record<string, number> } {
  const gets: Record<string, number> = {};
  const bag = new Proxy(first as Record<string, unknown>, {
    get(t, k, rcv): unknown {
      if (typeof k !== "string") return Reflect.get(t, k, rcv);
      gets[k] = (gets[k] ?? 0) + 1;
      return gets[k] === 1 || !Object.hasOwn(then, k)
        ? Reflect.get(t, k, rcv)
        : (then as Record<string, unknown>)[k];
    },
  }) as T;
  return { bag, gets };
}

/**
 * P2: ЛГУЩИЙ Proxy — `ownKeys` НЕ называет hiddenKey,
 * `getOwnPropertyDescriptor` утверждает, что он собственный,
 * `has` отвечает true, `get` отдаёт значение.
 */
function lyingBag(
  visible: Record<string, unknown>,
  hiddenKey: string,
  hiddenValue: unknown,
): Record<string, unknown> {
  const target: Record<string, unknown> = {
    ...visible,
    [hiddenKey]: hiddenValue,
  };
  return new Proxy(target, {
    ownKeys(): ArrayLike<string | symbol> {
      return Object.keys(visible);
    },
    getOwnPropertyDescriptor(t, k): PropertyDescriptor | undefined {
      if (k === hiddenKey) {
        return {
          value: hiddenValue,
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    has(t, k): boolean {
      return k === hiddenKey ? true : Reflect.has(t, k);
    },
    get(t, k, rcv): unknown {
      return k === hiddenKey ? hiddenValue : Reflect.get(t, k, rcv);
    },
  });
}

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES, { defaultRoute: "a" });

/** Чужой State в форме, которую строит плагин. */
function foreignState(
  name: string,
  params: Record<string, unknown>,
  search: Record<string, unknown>,
  path: string,
  context: Record<string, unknown>,
  transition?: Record<string, unknown>,
): State {
  const s: Record<string, unknown> = { name, params, search, path, context };
  if (transition !== undefined) s.transition = transition;
  return s as unknown as State;
}

async function main(): Promise<void> {
  // ============================================================ H · ПОЗИТИВНЫЙ КОНТРОЛЬ ШАПКИ
  {
    const r = mk();
    await r.start("/a");
    await r.navigate("u", { id: "1" }, { tab: "x" } as never);
    const st = r.getState()!;
    out("H · шапка: ядро живо, обычная навигация дошла", {
      name: st.name,
      params: st.params,
      search: st.search,
      path: st.path,
      shellFrozen: Object.isFrozen(st),
      coreParamsFrozen: Object.isFrozen(st.params),
      coreTransitionFrozen: Object.isFrozen(st.transition),
      coreSegmentsFrozen: Object.isFrozen(st.transition.segments),
      contextMutableCarveOut: !Object.isFrozen(st.context),
    });
    r.stop();
  }

  // ============================================================ A · ЭКСПЕРИМЕНТ (а)
  const leafService = { id: "leaf-service" };

  async function armNavigateToState(
    precopy: boolean,
    viaInternals: boolean,
  ): Promise<Record<string, unknown>> {
    const r = mk();
    await r.start("/a");
    const events: Record<string, unknown>[] = [];

    const params0 = { id: "7" };
    const search0 = { tab: "t" };
    const context0: Record<string, unknown> = { ns: leafService };
    const transition0 = {
      phase: "activating",
      reason: "success",
      segments: { activated: ["u"] },
    };

    const params = precopy ? { ...params0 } : params0;
    const search = precopy ? { ...search0 } : search0;
    const context = precopy ? { ...context0 } : context0;
    const transition = precopy ? { ...transition0 } : transition0;

    r.usePlugin(
      (() => ({
        onTransitionSuccess(toState: State): void {
          events.push({
            to: toState.name,
            toParamsFrozen: Object.isFrozen(toState.params),
            toContextNsIsLeaf: toState.context.ns === leafService,
            toContextIsCallerContext:
              (toState.context as unknown) === (context as unknown),
          });
        },
      })) as never,
    );

    const shell0 = foreignState(
      "u",
      params,
      search,
      "/u/7?tab=t",
      context,
      transition,
    );
    const shell = precopy
      ? ({
          ...(shell0 as unknown as Record<string, unknown>),
        } as unknown as State)
      : shell0;

    const committed = viaInternals
      ? await getInternals(r).navigateToState(shell)
      : await getPluginApi(r).navigateToState(shell);
    const live = r.getState()!;

    // ОБРАТНАЯ ВИДИМОСТЬ: мутируем оригиналы ПОСЛЕ вызова.
    (params as Record<string, unknown>).id = "MUTATED";
    (search as Record<string, unknown>).tab = "MUTATED";
    (context as Record<string, unknown>).injected = "MUTATED";
    (transition as Record<string, unknown>).phase = "MUTATED";

    // Мутируем то, что ядро отдало (context — мутабельный карве-аут).
    (live.context as Record<string, unknown>).fromCore = "written-by-app";

    const res: Record<string, unknown> = {
      committedIsGetState: committed === live,
      name: live.name,
      params: { ...live.params },
      search: { ...live.search },
      path: live.path,
      buildPath: r.buildPath(
        "u",
        { id: "7" },
        { tab: live.search.tab } as never,
      ),
      contextKeys: Object.keys(live.context).sort(),
      contextNsIsLeafService: live.context.ns === leafService,
      transitionPhase: live.transition.phase,
      transitionIsCallerTransition:
        (live.transition as unknown) === (transition as unknown),
      paramsIsCallerBag: (live.params as unknown) === (params as unknown),
      searchIsCallerBag: (live.search as unknown) === (search as unknown),
      contextIsCallerContext: (live.context as unknown) === (context as unknown),
      coreSawParamsMutation: live.params.id === "MUTATED",
      coreSawContextMutation: Object.hasOwn(live.context, "injected"),
      callerSawCoreContextWrite: Object.hasOwn(context, "fromCore"),
      shellFrozen: Object.isFrozen(live),
      coreParamsFrozen: Object.isFrozen(live.params),
      coreSearchFrozen: Object.isFrozen(live.search),
      coreContextFrozen: Object.isFrozen(live.context),
      callerParamsFrozen: Object.isFrozen(params),
      callerSearchFrozen: Object.isFrozen(search),
      callerContextFrozen: Object.isFrozen(context),
      callerTransitionFrozen: Object.isFrozen(transition),
      callerShellFrozen: Object.isFrozen(shell),
      hookEvents: events,
      previousStateContextIsCallerContext:
        (r.getPreviousState()?.context as unknown) === (context as unknown),
    };
    r.stop();
    return res;
  }

  const navOrig = await armNavigateToState(false, false);
  const navCopy = await armNavigateToState(true, false);
  out("A1 · PluginApi.navigateToState·state — ОРИГИНАЛ", navOrig);
  out("A1 · PluginApi.navigateToState·state — ПРЕДКОПИЯ", navCopy);
  out("A1 · РАЗНИЦА (ключи, где оригинал ≠ предкопия)", {
    differing: Object.keys(navOrig).filter(
      (k) => JSON.stringify(navOrig[k]) !== JSON.stringify(navCopy[k]),
    ),
  });

  const intOrig = await armNavigateToState(false, true);
  const intCopy = await armNavigateToState(true, true);
  out("A2 · RouterInternals.navigateToState·state — ОРИГИНАЛ", intOrig);
  out("A2 · РАЗНИЦА (оригинал ≠ предкопия)", {
    differing: Object.keys(intOrig).filter(
      (k) => JSON.stringify(intOrig[k]) !== JSON.stringify(intCopy[k]),
    ),
  });

  // ------------------------------------------------------------ A3 · systemCommit
  async function armSystemCommit(
    precopy: boolean,
  ): Promise<Record<string, unknown>> {
    const r = mk();
    await r.start("/a");
    const hookSeen: Record<string, unknown>[] = [];
    const params0 = { id: "5" };
    const search0 = { tab: "s" };
    const context0: Record<string, unknown> = { ns: leafService };
    const segments0: Record<string, unknown> = {
      activated: ["u"],
      deactivated: [],
      intersection: "",
    };
    const transition0: Record<string, unknown> = {
      phase: "activating",
      reason: "success",
      segments: segments0,
    };

    const params = precopy ? { ...params0 } : params0;
    const search = precopy ? { ...search0 } : search0;
    const context = precopy ? { ...context0 } : context0;
    const segments = precopy ? { ...segments0 } : segments0;
    const transition = precopy ? { ...transition0, segments } : transition0;
    const shell0 = foreignState(
      "u",
      params,
      search,
      "/u/5?tab=s",
      context,
      transition,
    );
    const shell = precopy
      ? ({
          ...(shell0 as unknown as Record<string, unknown>),
        } as unknown as State)
      : shell0;

    const fromArg = foreignState("a", {}, {}, "/a", { marker: "caller-from" });
    r.usePlugin(
      (() => ({
        onTransitionSuccess(toState: State, fromState: State | undefined): void {
          hookSeen.push({
            fromIsCallerFromArg: (fromState as unknown) === (fromArg as unknown),
            fromMarker: (
              fromState?.context as Record<string, unknown> | undefined
            )?.marker,
            toIsCommittedShell: toState === r.getState(),
          });
        },
      })) as never,
    );

    const committed = getInternals(r).systemCommit(shell, fromArg, {
      replace: true,
    } as never);
    const live = r.getState()!;

    // Обратная видимость: приложение пишет ПОСЛЕ коммита.
    (params as Record<string, unknown>).id = "MUTATED";
    (context as Record<string, unknown>).injected = "MUTATED";
    (transition as Record<string, unknown>).phase = "MUTATED";
    (segments.activated as string[]).push("injected-after-commit");
    (segments as Record<string, unknown>).intersection = "rewritten";

    const res: Record<string, unknown> = {
      committedIsGetState: committed === live,
      name: live.name,
      params: { ...live.params },
      search: { ...live.search },
      path: live.path,
      contextKeys: Object.keys(live.context).sort(),
      contextNsIsLeafService: live.context.ns === leafService,
      paramsIsCallerBag: (live.params as unknown) === (params as unknown),
      contextIsCallerContext: (live.context as unknown) === (context as unknown),
      transitionIsCallerTransition:
        (live.transition as unknown) === (transition as unknown),
      transitionPhaseSeen: live.transition.phase,
      segmentsIsCallerSegments:
        (live.transition.segments as unknown) === (segments as unknown),
      coreSawParamsMutation: live.params.id === "MUTATED",
      coreSawContextMutation: Object.hasOwn(live.context, "injected"),
      coreSawTransitionMutation: live.transition.phase === "MUTATED",
      committedSegmentsSeenAfterAppWrite: JSON.stringify(
        live.transition.segments,
      ),
      shellFrozen: Object.isFrozen(live),
      coreParamsFrozen: Object.isFrozen(live.params),
      coreTransitionFrozen: Object.isFrozen(live.transition),
      committedSegmentsFrozen: Object.isFrozen(live.transition.segments),
      callerSegmentsFrozen: Object.isFrozen(segments),
      callerParamsFrozen: Object.isFrozen(params),
      callerContextFrozen: Object.isFrozen(context),
      callerTransitionFrozen: Object.isFrozen(transition),
      hookSeen,
      previousStateIsCallerFromArg:
        (r.getPreviousState() as unknown) === (fromArg as unknown),
      previousStateName: r.getPreviousState()?.name,
      callerFromArgFrozen: Object.isFrozen(fromArg),
    };
    r.stop();
    return res;
  }

  const scOrig = await armSystemCommit(false);
  const scCopy = await armSystemCommit(true);
  out(
    "A3 · systemCommit·toState(+.context,.transition,.segments,fromState) — ОРИГИНАЛ",
    scOrig,
  );
  out("A3 · РАЗНИЦА (оригинал ≠ предкопия)", {
    differing: Object.keys(scOrig).filter(
      (k) => JSON.stringify(scOrig[k]) !== JSON.stringify(scCopy[k]),
    ),
  });

  // ============================================================ P1
  {
    const r = mk();
    await r.start("/a");
    const shellC = counting(
      foreignState(
        "u",
        { id: "9" },
        { tab: "z" },
        "/u/9?tab=z",
        { ns: leafService },
      ) as unknown as Record<string, unknown>,
    );
    const paramsC = counting({ id: "9" } as Record<string, unknown>);
    (shellC.bag as Record<string, unknown>).params = paramsC.bag;
    await getPluginApi(r).navigateToState(shellC.bag as unknown as State);
    out("P1 · navigateToState — чтения слотов оболочки и ключей params", {
      shellSlotReads: shellC.gets,
      shellOwnKeysCalls: shellC.ownKeysCalls.n,
      paramsKeyReads: paramsC.gets,
      landedParamId: r.getState()!.params.id,
    });
    r.stop();
  }
  {
    // ДРЕЙФУЮЩИЙ вход: объявленный query-ключ `tab` в params отвечает undefined
    // на ПЕРВОМ чтении (гвард пропускает) и значение на ВТОРОМ (копия берёт).
    const r = mk();
    await r.start("/a");
    const drifted = drifting<Record<string, unknown>>(
      { id: "9", tab: undefined },
      { tab: "SMUGGLED" },
    );
    const shell = foreignState("u", drifted.bag, {}, "/u/9", {});
    let rejected: string | undefined;
    try {
      await getPluginApi(r).navigateToState(shell);
    } catch (e) {
      rejected = String((e as Error).message ?? e);
    }
    const live = r.getState()!;
    out("P1 · ДРЕЙФ: объявленный query-ключ в params, undefined→значение", {
      paramsKeyReads: drifted.gets,
      rejected,
      committedName: live.name,
      committedParams: { ...live.params },
      committedSearch: { ...live.search },
      committedPath: live.path,
      smuggledIntoParams: Object.hasOwn(live.params, "tab"),
      smuggledValue: (live.params as Record<string, unknown>).tab,
    });
    r.stop();
  }
  {
    // ПОЗИТИВНЫЙ КОНТРОЛЬ дрейф-инструмента: тот же ключ БЕЗ дрейфа — гвард ловит.
    const r = mk();
    await r.start("/a");
    let rejected: string | undefined;
    try {
      await getPluginApi(r).navigateToState(
        foreignState("u", { id: "9", tab: "PLAIN" }, {}, "/u/9", {}),
      );
    } catch (e) {
      rejected = String((e as Error).message ?? e);
    }
    out("P1 · КОНТРОЛЬ: тот же ключ без дрейфа", {
      rejected,
      committedName: r.getState()!.name,
    });
    r.stop();
  }
  {
    const r = mk();
    await r.start("/a");
    const shellC = counting(
      foreignState(
        "u",
        { id: "5" },
        { tab: "s" },
        "/u/5?tab=s",
        { ns: leafService },
        { phase: "activating", reason: "success", segments: { activated: ["u"] } },
      ) as unknown as Record<string, unknown>,
    );
    const transC = counting({
      phase: "activating",
      reason: "success",
      segments: { activated: ["u"] },
    } as Record<string, unknown>);
    (shellC.bag as Record<string, unknown>).transition = transC.bag;
    getInternals(r).systemCommit(shellC.bag as unknown as State, r.getState(), {
      replace: true,
    } as never);
    out("P1 · systemCommit — чтения слотов оболочки и ключей transition", {
      shellSlotReads: shellC.gets,
      transitionKeyReads: transC.gets,
      landedPhase: r.getState()!.transition.phase,
      landedParamId: r.getState()!.params.id,
    });
    r.stop();
  }

  // ============================================================ P2 · лгущий Proxy
  const p2Runs: readonly [
    string,
    (bag: Record<string, unknown>) => Promise<State>,
  ][] = [
    [
      "navigateToState·params",
      async (bag): Promise<State> => {
        const r = mk();
        await r.start("/a");
        await getPluginApi(r).navigateToState(
          foreignState("u", bag, {}, "/u/9", {}),
        );
        const s = r.getState()!;
        r.stop();
        return s;
      },
    ],
    [
      "systemCommit·params",
      async (bag): Promise<State> => {
        const r = mk();
        await r.start("/a");
        getInternals(r).systemCommit(
          foreignState("u", bag, {}, "/u/9", {}),
          r.getState(),
          { replace: true } as never,
        );
        const s = r.getState()!;
        r.stop();
        return s;
      },
    ],
  ];
  for (const [label, run] of p2Runs) {
    const lying = lyingBag({ id: "9" }, "hidden", "LIE");
    const st = await run(lying);
    const honestSt = await run({ id: "9", hidden: "HONEST" });
    out(`P2 · ${label}`, {
      committedKeys: Object.keys(st.params).sort(),
      hiddenLanded: Object.hasOwn(st.params, "hidden"),
      controlHonestKeys: Object.keys(honestSt.params).sort(),
      controlHonestLanded: Object.hasOwn(honestSt.params, "hidden"),
    });
  }
  {
    // Лгущий Proxy на КОНТЕКСТЕ (spread ведёт ownKeys?).
    const r = mk();
    await r.start("/a");
    const lyingCtx = lyingBag({ visible: 1 }, "hiddenNs", "LIE");
    getInternals(r).systemCommit(
      foreignState("u", { id: "9" }, {}, "/u/9", lyingCtx),
      r.getState(),
      { replace: true } as never,
    );
    const live = r.getState()!;
    out("P2 · systemCommit·toState.context (спред)", {
      committedContextKeys: Object.keys(live.context).sort(),
      hiddenLanded: Object.hasOwn(live.context, "hiddenNs"),
    });
    r.stop();
  }
  {
    const r = mk();
    await r.start("/a");
    const lyingTr = lyingBag(
      { phase: "activating", reason: "success", segments: {} },
      "hiddenMeta",
      "LIE",
    );
    getInternals(r).systemCommit(
      foreignState("u", { id: "9" }, {}, "/u/9", {}, lyingTr),
      r.getState(),
      { replace: true } as never,
    );
    const live = r.getState()!;
    out("P2 · systemCommit·toState.transition (adoptForeignBag)", {
      committedTransitionKeys: Object.keys(live.transition).sort(),
      hiddenLanded: Object.hasOwn(live.transition, "hiddenMeta"),
    });
    r.stop();
  }

  // ============================================================ P3
  {
    const r = mk();
    await r.start("/a");
    const seen = { sets: [] as unknown[], gets: 0 };
    Object.defineProperty(Object.prototype, "id", {
      configurable: true,
      get(): unknown {
        seen.gets++;
        return "FROM-PROTO-GETTER";
      },
      set(v: unknown): void {
        seen.sets.push(v);
      },
    });
    let thrown: string | undefined;
    let committedParams: Record<string, unknown> = {};
    try {
      await getPluginApi(r).navigateToState(
        foreignState("u", { id: "9" }, {}, "/u/9", {}),
      );
      committedParams = { ...r.getState()!.params };
    } catch (e) {
      thrown = String((e as Error).message ?? e);
    } finally {
      delete (Object.prototype as Record<string, unknown>).id;
    }
    out("P3 · navigateToState: унаследованный сеттер под именем ключа `id`", {
      thrown,
      protoSetterInvocations: seen.sets.length,
      committedIdIsOwn: Object.hasOwn(committedParams, "id"),
      committedIdValue: committedParams.id,
    });
    r.stop();
  }
  {
    const r = mk();
    await r.start("/a");
    const seen = { sets: [] as unknown[] };
    Object.defineProperty(Object.prototype, "phase", {
      configurable: true,
      get(): unknown {
        return "FROM-PROTO-GETTER";
      },
      set(v: unknown): void {
        seen.sets.push(v);
      },
    });
    let thrown: string | undefined;
    let landed: unknown;
    let isOwn: boolean | undefined;
    try {
      getInternals(r).systemCommit(
        foreignState(
          "u",
          { id: "5" },
          {},
          "/u/5",
          {},
          { phase: "activating", reason: "success", segments: {} },
        ),
        r.getState(),
        { replace: true } as never,
      );
      landed = r.getState()!.transition.phase;
      isOwn = Object.hasOwn(r.getState()!.transition, "phase");
    } catch (e) {
      thrown = String((e as Error).message ?? e);
    } finally {
      delete (Object.prototype as Record<string, unknown>).phase;
    }
    out("P3 · systemCommit: унаследованный сеттер под именем ключа `phase`", {
      thrown,
      protoSetterInvocations: seen.sets.length,
      landedPhase: landed,
      committedTransitionPhaseIsOwn: isOwn,
    });
    r.stop();
  }
  {
    const r = mk();
    await r.start("/a");
    const evilParams = JSON.parse(
      '{"id":"9","__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;
    const evilContext = JSON.parse(
      '{"__proto__":{"ctxPolluted":true}}',
    ) as Record<string, unknown>;
    const evilTransition = JSON.parse(
      '{"phase":"activating","reason":"success","segments":{},"__proto__":{"trPolluted":true}}',
    ) as Record<string, unknown>;
    getInternals(r).systemCommit(
      foreignState("u", evilParams, {}, "/u/9", evilContext, evilTransition),
      r.getState(),
      { replace: true } as never,
    );
    const live = r.getState()!;
    out("P3 · own `__proto__` из JSON.parse (systemCommit)", {
      callerParamsHasOwnProto: Object.hasOwn(evilParams, "__proto__"),
      committedParamsHasOwnProto: Object.hasOwn(live.params, "__proto__"),
      committedParamsProtoIsObjectPrototype:
        Object.getPrototypeOf(live.params) === Object.prototype,
      committedContextHasOwnProto: Object.hasOwn(live.context, "__proto__"),
      committedContextProtoIsObjectPrototype:
        Object.getPrototypeOf(live.context) === Object.prototype,
      committedTransitionHasOwnProto: Object.hasOwn(
        live.transition,
        "__proto__",
      ),
      committedShellHasOwnProto: Object.hasOwn(live, "__proto__"),
      shellProtoIsObjectPrototype:
        Object.getPrototypeOf(live) === Object.prototype,
      globalNotPolluted:
        ({} as Record<string, unknown>).polluted === undefined &&
        ({} as Record<string, unknown>).ctxPolluted === undefined,
    });
    r.stop();
  }
  {
    const r = mk();
    await r.start("/a");
    const evilParams = JSON.parse(
      '{"id":"9","__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;
    const evilContext = JSON.parse(
      '{"__proto__":{"ctxPolluted":true}}',
    ) as Record<string, unknown>;
    await getPluginApi(r).navigateToState(
      foreignState("u", evilParams, {}, "/u/9", evilContext),
    );
    const live = r.getState()!;
    out("P3 · own `__proto__` из JSON.parse (navigateToState)", {
      committedParamsHasOwnProto: Object.hasOwn(live.params, "__proto__"),
      committedParamsProtoIsObjectPrototype:
        Object.getPrototypeOf(live.params) === Object.prototype,
      committedContextHasOwnProto: Object.hasOwn(live.context, "__proto__"),
      committedContextProtoIsObjectPrototype:
        Object.getPrototypeOf(live.context) === Object.prototype,
      shellProtoIsObjectPrototype:
        Object.getPrototypeOf(live) === Object.prototype,
    });
    r.stop();
  }
}

void main();
