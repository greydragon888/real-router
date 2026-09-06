// МАТРИЦА семейства «options·чтение-по-имени-без-копии».
// Строки — шесть дверей переписи, столбцы — эксперимент (а), P1, P2, P3, P4.
// Общая шапка: позитивный контроль среды. У КАЖДОЙ ячейки — свой позитивный
// контроль и доказательство, что вход ДОШЁЛ до проверяемой ветки.
import { createRouter, resolveForwardChain } from "@real-router/core";
import {
  cloneRouter,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type Counts = Record<string, number>;

/** Proxy-счётчик ВСЕХ ловушек — им доказывается отсутствие ownKeys/gopd/has. */
function trap<T extends object>(source: T): { bag: T; counts: Counts } {
  const counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const bag = new Proxy(source as Record<string, unknown>, {
    ownKeys: (t) => (bump("ownKeys"), Reflect.ownKeys(t)),
    getOwnPropertyDescriptor: (t, k) => (
      bump(`gopd:${String(k)}`), Reflect.getOwnPropertyDescriptor(t, k)
    ),
    get: (t, k, r) => (bump(`get:${String(k)}`), Reflect.get(t, k, r)),
    has: (t, k) => (bump(`has:${String(k)}`), Reflect.has(t, k)),
    getPrototypeOf: (t) => (bump("proto"), Reflect.getPrototypeOf(t)),
  });
  return { bag: bag as T, counts };
}

/**
 * ЛГУЩИЙ Proxy для P2: `ownKeys` НЕ называет ключ, `getOwnPropertyDescriptor`
 * утверждает, что он собственный, `get` его отдаёт. Дверь, ведущая перечисление
 * по ownKeys, ключ НЕ увидит; дверь, читающая по имени, — увидит.
 */
function lyingProxy<T extends object>(
  source: T,
  hidden: string,
): { bag: T; counts: Counts } {
  const counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const bag = new Proxy(source as Record<string, unknown>, {
    ownKeys: (t) => (
      bump("ownKeys"), Reflect.ownKeys(t).filter((k) => k !== hidden)
    ),
    getOwnPropertyDescriptor: (t, k) => {
      bump(`gopd:${String(k)}`);
      return k === hidden
        ? {
            value: (t as Record<string, unknown>)[hidden],
            writable: true,
            enumerable: true,
            configurable: true,
          }
        : Reflect.getOwnPropertyDescriptor(t, k);
    },
    get: (t, k, r) => (bump(`get:${String(k)}`), Reflect.get(t, k, r)),
    has: (t, k) => (bump(`has:${String(k)}`), Reflect.has(t, k)),
  });
  return { bag: bag as T, counts };
}

/** P3: унаследованный аксессор на Object.prototype, строго в try/finally. */
function withProtoAccessor<R>(
  name: string,
  getValue: () => unknown,
  body: (sets: unknown[]) => R,
): R {
  const sets: unknown[] = [];
  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    get: getValue,
    set: (v: unknown) => {
      sets.push(v);
    },
  });
  try {
    return body(sets);
  } finally {
    Reflect.deleteProperty(Object.prototype, name);
  }
}

const out: Record<string, unknown> = {};
const ROUTES = [{ name: "u", path: "/u/:id?tab" }] as never;
const QROUTES = [
  { name: "s", path: "/s?a" },
  { name: "home", path: "/home" },
] as never;
const QURL = (r: { buildPath: Function }): string =>
  r.buildPath("s", {}, { a: ["x", "y"] }) as string;

// =============================================================================
// ШАПКА — позитивный контроль среды
// =============================================================================
{
  const r = createRouter(ROUTES, {} as never, {} as never);
  out.HEADER = {
    envBuildPath: r.buildPath("u", { id: "7", tab: "x" } as never),
    envQueryDefault: QURL(createRouter(QROUTES, {} as never) as never),
  };
  r.dispose();
}

// =============================================================================
// A. createRouter·options.queryParams
// =============================================================================
{
  const A: Record<string, unknown> = {};

  // --- (а): оригинал против ПРЕДВАРИТЕЛЬНО СКОПИРОВАННОГО контейнера --------
  {
    const orig = { arrayFormat: "brackets" };
    const copy = { ...orig };
    const rOrig = createRouter(QROUTES, { queryParams: orig } as never);
    const rCopy = createRouter(QROUTES, { queryParams: copy } as never);
    const snapOrig = (
      getInternals(rOrig).routeGetStore() as unknown as {
        matcherOptions: { queryParams: unknown };
      }
    ).matcherOptions.queryParams;
    const snapCopy = (
      getInternals(rCopy).routeGetStore() as unknown as {
        matcherOptions: { queryParams: unknown };
      }
    ).matcherOptions.queryParams;

    const before = { orig: QURL(rOrig as never), copy: QURL(rCopy as never) };

    // ОБРАТНАЯ ВИДИМОСТЬ: мутируем оригинал ПОСЛЕ конструирования
    orig.arrayFormat = "none";

    const cloneOrig = cloneRouter(rOrig as never);
    const cloneCopy = cloneRouter(rCopy as never);

    A.exp_a = {
      snapshotsEqual: JSON.stringify(snapOrig) === JSON.stringify(snapCopy),
      snapshotIsCallerBag_orig: snapOrig === (orig as unknown),
      handout_getOptions_isCallerBag_orig:
        (
          getPluginApi(rOrig).getOptions() as unknown as {
            queryParams: unknown;
          }
        ).queryParams === (orig as unknown),
      handout_getOptions_isCallerBag_copy:
        (
          getPluginApi(rCopy).getOptions() as unknown as {
            queryParams: unknown;
          }
        ).queryParams === (copy as unknown),
      urlsBeforeMutation: before,
      urlsAfterMutation: {
        origBase: QURL(rOrig as never),
        copyBase: QURL(rCopy as never),
        origClone: QURL(cloneOrig as never),
        copyClone: QURL(cloneCopy as never),
      },
    };

    cloneOrig.dispose();
    cloneCopy.dispose();
    rOrig.dispose();
    rCopy.dispose();
  }

  // --- (а) через СПРЕД ломает документированную фичу слоёного конфига ------
  {
    const base = { arrayFormat: "brackets" };
    const layered = Object.create(base) as { arrayFormat: string };
    const spread = { ...layered }; // спред теряет унаследованное
    const rLayered = createRouter(QROUTES, { queryParams: layered } as never);
    const rSpread = createRouter(QROUTES, { queryParams: spread } as never);

    A.exp_a_spreadBreaksLayering = {
      layeredUrl: QURL(rLayered as never),
      spreadCopyUrl: QURL(rSpread as never),
      spreadOwnKeys: Object.keys(spread),
    };

    rLayered.dispose();
    rSpread.dispose();
  }

  // --- P1: дрейфующий мешок — счёт и «результат от ПЕРВОГО чтения» ---------
  {
    const counting = countingBag({
      arrayFormat: "brackets",
      booleanFormat: "auto",
      nullFormat: "default",
      numberFormat: "auto",
    });
    const r = createRouter(QROUTES, {
      queryParams: counting.bag,
    } as never);
    const atConstruction = { ...counting.reads };

    // перестройка матчера — читает ли ядро мешок ещё раз?
    getRoutesApi(r).add([{ name: "extra", path: "/extra" }] as never);
    const afterRebuild = { ...counting.reads };

    const drifting = driftingBag(
      { arrayFormat: "brackets" },
      { arrayFormat: "none" },
    );
    const rd = createRouter(QROUTES, {
      queryParams: drifting.bag,
    } as never);

    const stable = createRouter(QROUTES, {
      queryParams: { arrayFormat: "brackets" },
    } as never);

    A.p1 = {
      readsAtConstruction: atConstruction,
      readsAfterMatcherRebuild: afterRebuild,
      driftingReads: { ...drifting.reads },
      driftingUrl_mustMatchFirstRead: QURL(rd as never),
      posControl_stableUrl: QURL(stable as never),
    };

    r.dispose();
    rd.dispose();
    stable.dispose();
  }

  // --- P2: лгущий Proxy + инвентарь ловушек --------------------------------
  {
    const lying = lyingProxy({ arrayFormat: "brackets" }, "arrayFormat");
    const r = createRouter(QROUTES, { queryParams: lying.bag } as never);
    const t = trap({ arrayFormat: "brackets" });
    const r2 = createRouter(QROUTES, { queryParams: t.bag } as never);

    A.p2 = {
      lyingProxy_url: QURL(r as never),
      lyingProxy_counts: lying.counts,
      allTrapCounts: t.counts,
      posControl_plainUrl: QURL(r2 as never),
    };

    r.dispose();
    r2.dispose();
  }

  // --- P3: унаследованный сеттер + собственный __proto__ -------------------
  {
    const inheritedSetterFired = withProtoAccessor(
      "arrayFormat",
      () => "brackets",
      (sets) => {
        const r = createRouter(QROUTES, { queryParams: {} } as never);
        const url = QURL(r as never);
        r.dispose();
        return { setsSeen: sets.length, urlFromInheritedGetter: url };
      },
    );

    const wire = JSON.parse('{"__proto__":"pwned"}') as Record<string, unknown>;
    wire.arrayFormat = "brackets";
    const rWire = createRouter(QROUTES, { queryParams: wire } as never);
    const snap = (
      getInternals(rWire).routeGetStore() as unknown as {
        matcherOptions: { queryParams: object };
      }
    ).matcherOptions.queryParams;

    A.p3 = {
      inherited: inheritedSetterFired,
      wireOwnKeys: Object.keys(wire),
      snapshotProtoIsObjectPrototype:
        Object.getPrototypeOf(snap) === Object.prototype,
      snapshotOwnKeys: Object.keys(snap),
      globalProtoUnpolluted: ({} as Record<string, unknown>).__proto__ !== "pwned",
      posControl_url: QURL(rWire as never),
    };

    rWire.dispose();
  }

  // --- P4: заморожен ли уровень ядра и НЕ заморожен ли уровень вызывающего --
  {
    const caller = { arrayFormat: "brackets" };
    const r = createRouter(QROUTES, { queryParams: caller } as never);
    const store = getInternals(r).routeGetStore() as unknown as {
      matcherOptions: { queryParams: object };
    };

    A.p4 = {
      callerBagFrozen_mustBeFalse: Object.isFrozen(caller),
      coreSnapshotFrozen_mustBeTrue: Object.isFrozen(
        store.matcherOptions.queryParams,
      ),
      coreContainerFrozen_mustBeTrue: Object.isFrozen(store.matcherOptions),
      posControl_url: QURL(r as never),
    };

    r.dispose();
  }

  out.A_createRouter_options_queryParams = A;
}

// =============================================================================
// B. cloneRouter·opts
// =============================================================================
{
  const B: Record<string, unknown> = {};
  const mkBase = (): ReturnType<typeof createRouter> =>
    createRouter(ROUTES, {} as never, {} as never);

  const warn = (r: unknown): unknown => {
    getLifecycleApi(r as never).addActivateGuard("u", () => () => {
      throw new Error("boom");
    });
    return (r as { canNavigateTo: Function }).canNavigateTo("u");
  };

  // --- (а) --------------------------------------------------------------
  {
    const seenOrig: string[] = [];
    const seenCopy: string[] = [];
    const optsOrig = {
      logger: { level: "all", callback: (l: string) => seenOrig.push(l) },
    };
    const optsCopy = { ...optsOrig };
    // копия КОНТЕЙНЕРА, лист (logger) — та же ссылка; подменим колбэк листа,
    // чтобы различать арму
    optsCopy.logger = {
      level: "all",
      callback: (l: string) => seenCopy.push(l),
    };

    const b1 = mkBase();
    const b2 = mkBase();
    const c1 = cloneRouter(b1 as never, undefined, optsOrig as never);
    const c2 = cloneRouter(b2 as never, undefined, optsCopy as never);
    const v1 = warn(c1);
    const v2 = warn(c2);

    // обратная видимость: мутируем оригинал ПОСЛЕ клонирования
    (optsOrig as Record<string, unknown>).logger = {
      level: "all",
      callback: (): void => {
        seenOrig.push("AFTER");
      },
    };
    warn(c1);

    B.exp_a = {
      verdicts: [v1, v2],
      origCallbackSaw: seenOrig.length > 0,
      copyCallbackSaw: seenCopy.length > 0,
      afterMutationLeaked: seenOrig.includes("AFTER"),
      buildPathsEqual:
        (c1 as { buildPath: Function }).buildPath("u", { id: "1" }) ===
        (c2 as { buildPath: Function }).buildPath("u", { id: "1" }),
      callerOptsFrozen_mustBeFalse: Object.isFrozen(optsOrig),
    };

    c1.dispose();
    c2.dispose();
    b1.dispose();
    b2.dispose();
  }

  // --- P1 --------------------------------------------------------------
  {
    const seen: string[] = [];
    const counting = countingBag({
      logger: { level: "all", callback: (l: string) => seen.push(l) },
    });
    const base = mkBase();
    const clone = cloneRouter(base as never, undefined, counting.bag as never);
    const atClone = { ...counting.reads };
    warn(clone);

    const drifting = driftingBag(
      { logger: { level: "all", callback: (l: string) => seen.push(`1:${l}`) } },
      {
        logger: {
          level: "all",
          callback: (l: string) => seen.push(`2:${l}`),
        },
      },
    );
    const base2 = mkBase();
    const clone2 = cloneRouter(base2 as never, undefined, drifting.bag as never);
    warn(clone2);

    B.p1 = {
      readsAtClone: atClone,
      readsAfterUse: { ...counting.reads },
      driftingReads: { ...drifting.reads },
      seen_mustCarryFirstReadCallback: seen.filter((s) => s.startsWith("1:")),
      seen_secondRead_mustBeEmpty: seen.filter((s) => s.startsWith("2:")),
      posControl_seenAny: seen.length > 0,
    };

    clone.dispose();
    clone2.dispose();
    base.dispose();
    base2.dispose();
  }

  // --- P2 --------------------------------------------------------------
  {
    const seen: string[] = [];
    const lying = lyingProxy(
      { logger: { level: "all", callback: (l: string) => seen.push(l) } },
      "logger",
    );
    const base = mkBase();
    const clone = cloneRouter(base as never, undefined, lying.bag as never);
    warn(clone);
    const t = trap({ logger: { level: "none" } });
    const base2 = mkBase();
    const clone2 = cloneRouter(base2 as never, undefined, t.bag as never);

    B.p2 = {
      lyingCounts: lying.counts,
      hiddenKeyLanded: seen.length > 0,
      allTrapCounts: t.counts,
      posControl_cloneBuilt: (clone2 as { buildPath: Function }).buildPath("u", {
        id: "2",
      }),
    };

    clone.dispose();
    clone2.dispose();
    base.dispose();
    base2.dispose();
  }

  // --- P3 --------------------------------------------------------------
  {
    const res = withProtoAccessor(
      "logger",
      () => ({ level: "none" }),
      (sets) => {
        const base = mkBase();
        const clone = cloneRouter(base as never, undefined, {} as never);
        const built = (clone as { buildPath: Function }).buildPath("u", {
          id: "3",
        });
        clone.dispose();
        base.dispose();
        return { setsSeen: sets.length, built };
      },
    );

    const wire = JSON.parse('{"__proto__":"pwned"}') as Record<string, unknown>;
    const base = mkBase();
    const clone = cloneRouter(base as never, undefined, wire as never);

    B.p3 = {
      inheritedSetter: res,
      wireOwnKeys: Object.keys(wire),
      globalProtoUnpolluted: ({} as Record<string, unknown>).__proto__ !== "pwned",
      posControl_built: (clone as { buildPath: Function }).buildPath("u", {
        id: "4",
      }),
    };

    clone.dispose();
    base.dispose();
  }

  // --- P4 --------------------------------------------------------------
  {
    const opts = { logger: { level: "none" } };
    const base = mkBase();
    const clone = cloneRouter(base as never, undefined, opts as never);

    B.p4 = {
      callerOptsFrozen_mustBeFalse: Object.isFrozen(opts),
      callerLoggerLeafFrozen_mustBeFalse: Object.isFrozen(opts.logger),
      cloneOptionsFrozen_coreLevel: Object.isFrozen(
        getPluginApi(clone as never).getOptions(),
      ),
      posControl_built: (clone as { buildPath: Function }).buildPath("u", {
        id: "5",
      }),
    };

    clone.dispose();
    base.dispose();
  }

  out.B_cloneRouter_opts = B;
}

// =============================================================================
// C. RoutesApi.add·options
// =============================================================================
{
  const C: Record<string, unknown> = {};
  const mk = (): ReturnType<typeof createRouter> =>
    createRouter(ROUTES, {} as never, {} as never);

  // --- (а) --------------------------------------------------------------
  {
    const orig = { parent: "u" };
    const copy = { ...orig };
    const r1 = mk();
    const r2 = mk();
    getRoutesApi(r1 as never).add(
      [{ name: "kid", path: "/kid" }] as never,
      orig as never,
    );
    getRoutesApi(r2 as never).add(
      [{ name: "kid", path: "/kid" }] as never,
      copy as never,
    );
    orig.parent = "MUTATED";

    C.exp_a = {
      origPath: (r1 as { buildPath: Function }).buildPath("u.kid", { id: "1" }),
      copyPath: (r2 as { buildPath: Function }).buildPath("u.kid", { id: "1" }),
      afterMutation_origStillRegistered: !!getRoutesApi(r1 as never).get(
        "u.kid",
      ),
      callerBagFrozen_mustBeFalse: Object.isFrozen(orig),
    };

    r1.dispose();
    r2.dispose();
  }

  // --- P1 --------------------------------------------------------------
  {
    const counting = countingBag({ parent: "u" });
    const r = mk();
    getRoutesApi(r as never).add(
      [{ name: "kid", path: "/kid" }] as never,
      counting.bag as never,
    );
    const reads = { ...counting.reads };

    const drifting = driftingBag({ parent: "u" }, { parent: undefined });
    const r2 = mk();
    getRoutesApi(r2 as never).add(
      [{ name: "kid2", path: "/kid2" }] as never,
      drifting.bag as never,
    );

    C.p1 = {
      reads,
      driftingReads: { ...drifting.reads },
      drifting_registeredUnder_mustBeFirstRead: !!getRoutesApi(
        r2 as never,
      ).get("u.kid2"),
      drifting_notAtRoot: !getRoutesApi(r2 as never).get("kid2"),
      posControl_path: (r as { buildPath: Function }).buildPath("u.kid", {
        id: "1",
      }),
    };

    r.dispose();
    r2.dispose();
  }

  // --- P2 --------------------------------------------------------------
  {
    const lying = lyingProxy({ parent: "u" }, "parent");
    const r = mk();
    getRoutesApi(r as never).add(
      [{ name: "kid", path: "/kid" }] as never,
      lying.bag as never,
    );
    const t = trap({ parent: "u" });
    const r2 = mk();
    getRoutesApi(r2 as never).add(
      [{ name: "kid", path: "/kid" }] as never,
      t.bag as never,
    );

    C.p2 = {
      lyingCounts: lying.counts,
      hiddenKeyLanded: !!getRoutesApi(r as never).get("u.kid"),
      allTrapCounts: t.counts,
      posControl_registered: !!getRoutesApi(r2 as never).get("u.kid"),
    };

    r.dispose();
    r2.dispose();
  }

  // --- P3 --------------------------------------------------------------
  {
    const res = withProtoAccessor(
      "parent",
      () => undefined,
      (sets) => {
        const r = mk();
        getRoutesApi(r as never).add([
          { name: "kid", path: "/kid" },
        ] as never);
        const atRoot = !!getRoutesApi(r as never).get("kid");
        r.dispose();
        return { setsSeen: sets.length, registeredAtRoot: atRoot };
      },
    );

    const wire = JSON.parse('{"__proto__":"pwned"}') as Record<string, unknown>;
    wire.parent = "u";
    const r = mk();
    getRoutesApi(r as never).add(
      [{ name: "kid", path: "/kid" }] as never,
      wire as never,
    );

    C.p3 = {
      inheritedAccessor: res,
      wireOwnKeys: Object.keys(wire),
      globalProtoUnpolluted: ({} as Record<string, unknown>).__proto__ !== "pwned",
      posControl_registered: !!getRoutesApi(r as never).get("u.kid"),
    };

    r.dispose();
  }

  // --- P4 --------------------------------------------------------------
  {
    const opts = { parent: "u" };
    const r = mk();
    getRoutesApi(r as never).add(
      [{ name: "kid", path: "/kid" }] as never,
      opts as never,
    );
    const cfg = getRoutesApi(r as never).get("u.kid");

    C.p4 = {
      callerOptsFrozen_mustBeFalse: Object.isFrozen(opts),
      coreRouteConfigFrozen: cfg === undefined ? "no-config" : Object.isFrozen(cfg),
      posControl_registered: !!cfg,
    };

    r.dispose();
  }

  out.C_RoutesApi_add_options = C;
}

// =============================================================================
// D. RouterInternals.matchPath·options
// =============================================================================
{
  const D: Record<string, unknown> = {};
  const mk = (): ReturnType<typeof createRouter> =>
    createRouter(ROUTES, {} as never, {} as never);

  // --- (а) --------------------------------------------------------------
  {
    const r = mk();
    const ctx = getInternals(r as never);
    const orig = {
      ...(ctx.getOptions() as unknown as Record<string, unknown>),
      rewritePathOnMatch: true,
    };
    const copy = { ...orig };
    const sOrig = ctx.matchPath("/u/2?tab=a", orig as never);
    const sCopy = ctx.matchPath("/u/2?tab=a", copy as never);

    // обратная видимость: мутация ПОСЛЕ вызова
    orig.rewritePathOnMatch = false;
    const sAfter = ctx.matchPath("/u/2?tab=a", orig as never);

    D.exp_a = {
      pathsEqual: sOrig?.path === sCopy?.path,
      path: sOrig?.path,
      paramsEqual: JSON.stringify(sOrig?.params) === JSON.stringify(sCopy?.params),
      searchEqual: JSON.stringify(sOrig?.search) === JSON.stringify(sCopy?.search),
      afterMutation_path: sAfter?.path,
      routerBuildPathUnaffected: (r as { buildPath: Function }).buildPath("u", {
        id: "4",
      }),
      callerOptsFrozen_mustBeFalse: Object.isFrozen(orig),
    };

    r.dispose();
  }

  // --- P1: счёт + ДРЕЙФ + порядок чтений относительно кода приложения ------
  {
    const r = createRouter(
      [{ name: "u", path: "/u/:id?tab" }] as never,
      {} as never,
      {} as never,
    );
    const ctx = getInternals(r as never);
    const base = ctx.getOptions() as unknown as Record<string, unknown>;
    const counting = countingBag({
      ...base,
      rewritePathOnMatch: true,
      trailingSlash: "default",
      queryParamsMode: "default",
    });
    const m1 = ctx.matchPath("/u/2?tab=a", counting.bag as never);
    const afterFirst = { ...counting.reads };
    const m2 = ctx.matchPath("/u/3?tab=b", counting.bag as never);

    // ДРЕЙФ: rewritePathOnMatch true на первом чтении, false на втором
    const drifting = driftingBag(
      { ...base, rewritePathOnMatch: true },
      { rewritePathOnMatch: false } as never,
    );
    const d1 = ctx.matchPath("/u/5?tab=c", drifting.bag as never);
    const d2 = ctx.matchPath("/u/6?tab=d", drifting.bag as never);

    D.p1 = {
      readsAfterFirstCall: {
        rewritePathOnMatch: afterFirst.rewritePathOnMatch,
        trailingSlash: afterFirst.trailingSlash,
        queryParamsMode: afterFirst.queryParamsMode,
      },
      readsAfterSecondCall: {
        rewritePathOnMatch: counting.reads.rewritePathOnMatch,
        trailingSlash: counting.reads.trailingSlash,
        queryParamsMode: counting.reads.queryParamsMode,
      },
      posControl_matched: [m1?.path, m2?.path],
      drifting_firstCall: d1?.path,
      drifting_secondCall: d2?.path,
      driftingReads: { ...drifting.reads },
    };

    r.dispose();
  }

  // --- P1b: чтения РАЗНЕСЕНЫ кодом приложения (энкодер между ними) ---------
  {
    const order: string[] = [];
    const r = createRouter(
      [
        {
          name: "u",
          path: "/u/:id?tab",
          encodeParams: (channels: { params: unknown; search: unknown }) => {
            order.push("encoder");
            return channels;
          },
        },
      ] as never,
      {} as never,
      {} as never,
    );
    const ctx = getInternals(r as never);
    const base = ctx.getOptions() as unknown as Record<string, unknown>;
    const src: Record<string, unknown> = {
      ...base,
      rewritePathOnMatch: true,
      trailingSlash: "default",
      queryParamsMode: "default",
    };
    const bag: Record<string, unknown> = {};
    for (const k of Object.keys(src)) {
      Object.defineProperty(bag, k, {
        enumerable: true,
        configurable: true,
        get: () => {
          order.push(`get:${k}`);
          return src[k];
        },
      });
    }
    const s = ctx.matchPath("/u/9?tab=e", bag as never);

    D.p1b_interleaving = {
      order: order.filter(
        (e) =>
          e === "encoder" ||
          e === "get:rewritePathOnMatch" ||
          e === "get:trailingSlash" ||
          e === "get:queryParamsMode",
      ),
      posControl_path: s?.path,
    };

    r.dispose();
  }

  // --- P2 --------------------------------------------------------------
  {
    const r = mk();
    const ctx = getInternals(r as never);
    const base = ctx.getOptions() as unknown as Record<string, unknown>;
    const lying = lyingProxy(
      { ...base, rewritePathOnMatch: true },
      "rewritePathOnMatch",
    );
    const s = ctx.matchPath("/u/2?tab=a", lying.bag as never);
    const t = trap({ ...base, rewritePathOnMatch: true });
    const s2 = ctx.matchPath("/u/2?tab=a", t.bag as never);

    D.p2 = {
      lyingCounts: {
        ownKeys: lying.counts.ownKeys,
        gopd: Object.keys(lying.counts).filter((k) => k.startsWith("gopd:")),
        has: Object.keys(lying.counts).filter((k) => k.startsWith("has:")),
      },
      hiddenKeyLanded_rewritten: s?.path,
      allTrapCounts: {
        ownKeys: t.counts.ownKeys,
        gopd: Object.keys(t.counts).filter((k) => k.startsWith("gopd:")),
        has: Object.keys(t.counts).filter((k) => k.startsWith("has:")),
        gets: Object.keys(t.counts).filter((k) => k.startsWith("get:")),
      },
      posControl_path: s2?.path,
    };

    r.dispose();
  }

  // --- P3 --------------------------------------------------------------
  {
    const res = withProtoAccessor(
      "rewritePathOnMatch",
      () => true,
      (sets) => {
        const r = mk();
        const ctx = getInternals(r as never);
        const s = ctx.matchPath(
          "/u/2?tab=a",
          { ...(ctx.getOptions() as unknown as object) } as never,
        );
        r.dispose();
        return { setsSeen: sets.length, path: s?.path };
      },
    );

    const r = mk();
    const ctx = getInternals(r as never);
    const wire = JSON.parse('{"__proto__":"pwned"}') as Record<string, unknown>;
    Object.assign(wire, ctx.getOptions(), { rewritePathOnMatch: true });
    const s = ctx.matchPath("/u/2?tab=a", wire as never);

    D.p3 = {
      inheritedAccessor: res,
      wireOwnKeys: Object.keys(wire).includes("__proto__"),
      globalProtoUnpolluted: ({} as Record<string, unknown>).__proto__ !== "pwned",
      posControl_path: s?.path,
    };

    r.dispose();
  }

  // --- P4 --------------------------------------------------------------
  {
    const r = mk();
    const ctx = getInternals(r as never);
    const opts = {
      ...(ctx.getOptions() as unknown as Record<string, unknown>),
      rewritePathOnMatch: true,
    };
    const s = ctx.matchPath("/u/2?tab=a", opts as never);

    D.p4 = {
      callerOptsFrozen_mustBeFalse: Object.isFrozen(opts),
      returnedStateFrozen_coreLevel: s === undefined ? "none" : Object.isFrozen(s),
      returnedParamsFrozen: s === undefined ? "none" : Object.isFrozen(s.params),
      posControl_path: s?.path,
    };

    r.dispose();
  }

  out.D_matchPath_options = D;
}

// =============================================================================
// E. Router.navigate·target   (асинхронная секция)
// =============================================================================
async function sectionE(): Promise<void> {
  const E: Record<string, unknown> = {};
  const mk = (): ReturnType<typeof createRouter> => {
    const r = createRouter(ROUTES, { defaultRoute: "u" } as never, {} as never);
    r.start("/u/1");
    return r;
  };

  // --- (а) --------------------------------------------------------------
  {
    const orig = { name: "u", params: { id: "5" }, search: { tab: "z" } };
    const copy = { ...orig };
    const r1 = mk();
    const r2 = mk();
    const s1 = await (r1 as { navigate: Function }).navigate(orig);
    const s2 = await (r2 as { navigate: Function }).navigate(copy);

    orig.name = "MUTATED";
    const after = (r1 as { getState: Function }).getState();

    E.exp_a = {
      pathsEqual: s1.path === s2.path,
      path: s1.path,
      namesEqual: s1.name === s2.name,
      paramsEqual: JSON.stringify(s1.params) === JSON.stringify(s2.params),
      searchEqual: JSON.stringify(s1.search) === JSON.stringify(s2.search),
      committedParamsIsCallerBag: s1.params === (orig.params as unknown),
      afterMutation_stateName: after.name,
      callerTargetFrozen_mustBeFalse: Object.isFrozen(orig),
    };

    r1.dispose();
    r2.dispose();
  }

  // --- P1 --------------------------------------------------------------
  {
    const counting = countingBag({
      name: "u",
      params: { id: "5" },
      search: { tab: "z" },
    });
    const r = mk();
    const s = await (r as { navigate: Function }).navigate(counting.bag);
    const reads = { ...counting.reads };

    const drifting = driftingBag(
      { name: "u", params: { id: "8" }, search: {} },
      { name: "nope" },
    );
    const r2 = mk();
    const s2 = await (r2 as { navigate: Function }).navigate(drifting.bag);

    E.p1 = {
      reads,
      posControl_path: s.path,
      driftingReads: { ...drifting.reads },
      drifting_committedName_mustBeFirstRead: s2.name,
      drifting_path: s2.path,
    };

    r.dispose();
    r2.dispose();
  }

  // --- P2 --------------------------------------------------------------
  {
    const lying = lyingProxy(
      { name: "u", params: { id: "5" }, search: { tab: "z" } },
      "search",
    );
    const r = mk();
    const s = await (r as { navigate: Function }).navigate(lying.bag);
    const t = trap({ name: "u", params: { id: "6" }, search: { tab: "y" } });
    const r2 = mk();
    const s2 = await (r2 as { navigate: Function }).navigate(t.bag);

    E.p2 = {
      lyingCounts: {
        ownKeys: lying.counts.ownKeys,
        gopd: Object.keys(lying.counts).filter((k) => k.startsWith("gopd:")),
        has: Object.keys(lying.counts).filter((k) => k.startsWith("has:")),
      },
      hiddenKeyLanded_path: s.path,
      allTrapCounts: {
        ownKeys: t.counts.ownKeys,
        gopd: Object.keys(t.counts).filter((k) => k.startsWith("gopd:")),
        has: Object.keys(t.counts).filter((k) => k.startsWith("has:")),
        gets: Object.keys(t.counts).filter((k) => k.startsWith("get:")),
      },
      posControl_path: s2.path,
    };

    r.dispose();
    r2.dispose();
  }

  // --- P3 --------------------------------------------------------------
  {
    const r = mk();
    const res = await withProtoAccessor(
      "params",
      () => ({ id: "99" }),
      async (sets) => {
        const s = await (r as { navigate: Function }).navigate({ name: "u" });
        return { setsSeen: sets.length, path: s.path };
      },
    );

    const wire = JSON.parse('{"__proto__":"pwned"}') as Record<string, unknown>;
    Object.assign(wire, { name: "u", params: { id: "7" } });
    const r2 = mk();
    const s2 = await (r2 as { navigate: Function }).navigate(wire);

    E.p3 = {
      inheritedAccessor: res,
      wireOwnKeys: Object.keys(wire).includes("__proto__"),
      globalProtoUnpolluted: ({} as Record<string, unknown>).__proto__ !== "pwned",
      posControl_path: s2.path,
    };

    r.dispose();
    r2.dispose();
  }

  // --- P4 --------------------------------------------------------------
  {
    const target = { name: "u", params: { id: "5" }, search: { tab: "z" } };
    const r = mk();
    const s = await (r as { navigate: Function }).navigate(target);

    E.p4 = {
      callerTargetFrozen_mustBeFalse: Object.isFrozen(target),
      callerParamsLeafFrozen_mustBeFalse: Object.isFrozen(target.params),
      callerSearchLeafFrozen_mustBeFalse: Object.isFrozen(target.search),
      coreStateFrozen_mustBeTrue: Object.isFrozen(s),
      coreStateParamsFrozen: Object.isFrozen(s.params),
      posControl_path: s.path,
    };

    r.dispose();
  }

  out.E_navigate_target = E;
}

// =============================================================================
// F. resolveForwardChain·forwardMap
// =============================================================================
function sectionF(): void {
  const F: Record<string, unknown> = {};

  // --- (а) --------------------------------------------------------------
  {
    const orig: Record<string, string> = { a: "b", b: "c" };
    const copy = { ...orig };
    const rOrig = resolveForwardChain("a", orig);
    const rCopy = resolveForwardChain("a", copy);
    orig.b = "z";
    const rAfter = resolveForwardChain("a", orig);

    // унаследованный хоп: спред-копия его теряет
    const proto = { b: "c" };
    const layered = Object.create(proto) as Record<string, string>;
    layered.a = "b";
    const layeredSpread = { ...layered };

    F.exp_a = {
      origResult: rOrig,
      copyResult: rCopy,
      equal: rOrig === rCopy,
      afterMutation: rAfter,
      layeredResult: resolveForwardChain("a", layered),
      spreadCopyResult: resolveForwardChain("a", layeredSpread),
      spreadOwnKeys: Object.keys(layeredSpread),
      callerMapFrozen_mustBeFalse: Object.isFrozen(orig),
    };
  }

  // --- P1 --------------------------------------------------------------
  {
    const counting = countingBag({ a: "b", b: "c" });
    const res = resolveForwardChain("a", counting.bag as never);
    const drifting = driftingBag({ a: "b", b: "c" }, { a: "zzz", b: "zzz" });
    const res2 = resolveForwardChain("a", drifting.bag as never);

    F.p1 = {
      reads: { ...counting.reads },
      posControl_result: res,
      driftingReads: { ...drifting.reads },
      drifting_result_mustBeFirstRead: res2,
    };
  }

  // --- P2 --------------------------------------------------------------
  {
    const lying = lyingProxy({ a: "b", b: "c" }, "a");
    const res = resolveForwardChain("a", lying.bag as never);
    const t = trap({ a: "b", b: "c" });
    const res2 = resolveForwardChain("a", t.bag as never);

    F.p2 = {
      lyingCounts: {
        ownKeys: lying.counts.ownKeys,
        gopd: Object.keys(lying.counts).filter((k) => k.startsWith("gopd:")),
        has: Object.keys(lying.counts).filter((k) => k.startsWith("has:")),
      },
      hiddenKeyLanded_result: res,
      allTrapCounts: t.counts,
      posControl_result: res2,
    };
  }

  // --- P3 --------------------------------------------------------------
  {
    const res = withProtoAccessor(
      "a",
      () => "b",
      (sets) => {
        const out2 = resolveForwardChain("a", { b: "c" } as never);
        return { setsSeen: sets.length, result: out2 };
      },
    );

    const wire = JSON.parse('{"__proto__":"pwned"}') as Record<string, string>;
    wire.a = "b";
    const resWire = resolveForwardChain("a", wire);
    const resProtoHop = resolveForwardChain("__proto__", wire);

    F.p3 = {
      inheritedAccessor: res,
      wireOwnKeys: Object.keys(wire),
      resultFromWire: resWire,
      resultStartingAtProtoKey: resProtoHop,
      globalProtoUnpolluted: ({} as Record<string, unknown>).__proto__ !== "pwned",
    };
  }

  // --- P4 --------------------------------------------------------------
  {
    const map = { a: "b", b: "c" };
    const res = resolveForwardChain("a", map);
    F.p4 = {
      callerMapFrozen_mustBeFalse: Object.isFrozen(map),
      returnIsString: typeof res,
      posControl_result: res,
    };
  }

  out.F_resolveForwardChain_forwardMap = F;
}

void sectionE().then(() => {
  sectionF();
  console.log(JSON.stringify(out, null, 1));
});
