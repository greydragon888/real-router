// Family matrix, part 2: D1 P2 discrimination + D2 decodeParams·return +
// D3 defaultParams·callbackReturn + D4 defaultSearch·callbackReturn.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-callback-return-.../matrix2.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

const out = (section: string, data: unknown): void => {
  console.log(`${section} ${JSON.stringify(data)}`);
};

const errText = (e: unknown): string =>
  e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);

const attempt = async <T>(run: () => T | Promise<T>): Promise<T | string> => {
  try {
    return await run();
  } catch (e) {
    return `THREW ${errText(e)}`;
  }
};

interface Traced<T> {
  readonly bag: T;
  readonly traps: Record<string, unknown>;
}
function tracer<T extends object>(source: T): Traced<T> {
  const traps: Record<string, unknown> = {};
  const bump = (kind: string, key?: string): void => {
    if (key === undefined) {
      traps[kind] = ((traps[kind] as number | undefined) ?? 0) + 1;

      return;
    }
    const m = (traps[kind] ??= {}) as Record<string, number>;

    m[key] = (m[key] ?? 0) + 1;
  };
  const bag = new Proxy(source as Record<string, unknown>, {
    get(t, k, r): unknown {
      if (typeof k === "string") bump("get", k);

      return Reflect.get(t, k, r);
    },
    getOwnPropertyDescriptor(t, k): PropertyDescriptor | undefined {
      if (typeof k === "string") bump("gopd", k);

      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    has(t, k): boolean {
      if (typeof k === "string") bump("has", k);

      return Reflect.has(t, k);
    },
    ownKeys(t): ArrayLike<string | symbol> {
      bump("ownKeys");

      return Reflect.ownKeys(t);
    },
  });

  return { bag: bag as T, traps };
}

function lyingBag(
  visible: Record<string, unknown>,
  hiddenKey: string,
  hiddenValue: unknown,
): object {
  return new Proxy(
    { ...visible },
    {
      get(t, k, r): unknown {
        return k === hiddenKey ? hiddenValue : Reflect.get(t, k, r);
      },
      getOwnPropertyDescriptor(t, k): PropertyDescriptor | undefined {
        if (k === hiddenKey) {
          return {
            value: hiddenValue,
            enumerable: true,
            configurable: true,
            writable: true,
          };
        }

        return Reflect.getOwnPropertyDescriptor(t, k);
      },
      has(t, k): boolean {
        return k === hiddenKey ? true : Reflect.has(t, k);
      },
      ownKeys(t): ArrayLike<string | symbol> {
        return Reflect.ownKeys(t);
      },
    },
  );
}

// A bag whose per-key VALUE drifts: `first` on read 1, `then` from read 2.
function driftProxy(
  keys: string[],
  first: Record<string, unknown>,
  then: Record<string, unknown>,
): { bag: object; reads: Record<string, number> } {
  const reads: Record<string, number> = {};
  const bag = new Proxy({} as Record<string, unknown>, {
    get(_t, k): unknown {
      if (typeof k !== "string" || !keys.includes(k)) return undefined;
      reads[k] = (reads[k] ?? 0) + 1;

      return reads[k] === 1 ? first[k] : (then[k] ?? first[k]);
    },
    getOwnPropertyDescriptor(_t, k): PropertyDescriptor | undefined {
      if (typeof k !== "string" || !keys.includes(k)) return undefined;

      return {
        value: undefined,
        enumerable: true,
        configurable: true,
        writable: true,
      };
    },
    has(_t, k): boolean {
      return typeof k === "string" && keys.includes(k);
    },
    ownKeys(): string[] {
      return [...keys];
    },
  });

  return { bag, reads };
}

// A bag whose DESCRIPTOR drifts: own on gOPD ask 1, absent from ask 2.
function descriptorDriftBag(
  key: string,
  value: unknown,
): { bag: object; asks: number } {
  const box = { asks: 0 };
  const bag = new Proxy({} as Record<string, unknown>, {
    get(_t, k): unknown {
      return k === key ? value : undefined;
    },
    getOwnPropertyDescriptor(_t, k): PropertyDescriptor | undefined {
      if (k !== key) return undefined;
      box.asks += 1;

      return box.asks === 1
        ? { value, enumerable: true, configurable: true, writable: true }
        : undefined;
    },
    has(_t, k): boolean {
      return k === key;
    },
    ownKeys(): string[] {
      return [key];
    },
  });

  return {
    bag,
    get asks(): number {
      return box.asks;
    },
  } as { bag: object; asks: number };
}

async function withInheritedAccessor<T>(
  name: string,
  run: () => T | Promise<T>,
): Promise<{ result: T | string; setterFired: unknown[]; getterReads: number }> {
  const setterFired: unknown[] = [];
  let getterReads = 0;

  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    get(): unknown {
      getterReads += 1;

      return "FROM_PROTO_GETTER";
    },
    set(v: unknown): void {
      setterFired.push(v);
    },
  });
  try {
    return { result: await attempt(run), setterFired, getterReads };
  } finally {
    delete (Object.prototype as Record<string, unknown>)[name];
  }
}

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id?tab" },
];

// ═════════════════════════════════════════════════════════════════════════════
// D1 extra — P2 discrimination: is the search channel led by ownKeys, or by the
// route's DECLARED query names?
// ═════════════════════════════════════════════════════════════════════════════
async function d1extra(): Promise<void> {
  const mk = (
    encode: (ch: never) => unknown,
  ): ReturnType<typeof createRouter> =>
    createRouter([
      { name: "u", path: "/u/:id?tab", encodeParams: encode },
    ] as never);

  // (i) UNDECLARED key hidden from ownKeys — if it lands, the lookup is not
  //     name-driven and P2 is broken on the caller's own key set.
  const rUndeclared = mk(() => ({
    params: { id: "9" },
    search: lyingBag({}, "zzz", "LIE"),
  }));
  // (ii) CONTROL: the same UNDECLARED key own-keyed and honestly enumerable.
  const rUndeclaredControl = mk(() => ({
    params: { id: "9" },
    search: { zzz: "HONEST" },
  }));

  out("D1x P2 (i) UNDECLARED key hidden from ownKeys on returned search", {
    href: rUndeclared.buildPath("u", { id: "1" }),
  });
  out("D1x P2 (ii) CONTROL UNDECLARED key own+enumerable on returned search", {
    href: rUndeclaredControl.buildPath("u", { id: "1" }),
  });
  rUndeclared.dispose();
  rUndeclaredControl.dispose();

  // (iii) DECLARED key with a DRIFTING descriptor: own on ask 1, gone on ask 2.
  const dd = descriptorDriftBag("tab", "DRIFTDESC");
  const rDrift = mk(() => ({ params: { id: "9" }, search: dd.bag }));

  out("D1x P2 (iii) DECLARED `tab` with a drifting descriptor (own→absent)", {
    href: rDrift.buildPath("u", { id: "1" }),
    gopdAsks: dd.asks,
  });
  rDrift.dispose();
}

// ═════════════════════════════════════════════════════════════════════════════
// D2 — Route.decodeParams·return
// ═════════════════════════════════════════════════════════════════════════════
async function d2(): Promise<void> {
  const mk = (
    decode: (ch: never) => unknown,
  ): ReturnType<typeof createRouter> =>
    createRouter([
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab", decodeParams: decode },
    ] as never);

  // ── D2 (a): ORIGINAL container vs a boundary COPY.
  {
    const P = { id: "42" };
    const S = { tab: "q" };
    let ranO = 0;
    let ranC = 0;
    const orig = mk(() => {
      ranO += 1;

      return { params: P, search: S };
    });
    const copy = mk(() => {
      ranC += 1;

      return { params: { ...P }, search: { ...S } };
    });
    const so = getPluginApi(orig).matchPath("/u/1?tab=a");
    const sc = getPluginApi(copy).matchPath("/u/1?tab=a");

    await orig.start("/u/1?tab=a");
    await copy.start("/u/1?tab=a");

    const bo = orig.getState();
    const bc = copy.getState();

    out("D2(a) matchPath + start — ORIGINAL vs COPY", {
      ran: { orig: ranO, copy: ranC },
      matchPath: {
        orig: { params: so?.params, search: so?.search, path: so?.path },
        copy: { params: sc?.params, search: sc?.search, path: sc?.path },
        equal: JSON.stringify(so) === JSON.stringify(sc),
      },
      started: {
        orig: { params: bo?.params, search: bo?.search, path: bo?.path },
        copy: { params: bc?.params, search: bc?.search, path: bc?.path },
        equal: JSON.stringify(bo?.params) === JSON.stringify(bc?.params),
      },
    });
    orig.dispose();
    copy.dispose();
  }

  // ── D2 identity / back-visibility.
  {
    const P: Record<string, unknown> = { id: "42" };
    const S: Record<string, unknown> = { tab: "q" };
    const r = mk(() => ({ params: P, search: S }));

    await r.start("/u/1?tab=a");

    const st1 = r.getState();

    P.id = "MUTATED";
    S.tab = "MUTATED";

    const st2 = r.getState();

    out("D2 back-visibility (mutate the returned bags AFTER commit)", {
      committed: { params: st1?.params, search: st1?.search, path: st1?.path },
      afterMutation: { params: st2?.params, search: st2?.search },
      "state.params === returned params": st1?.params === P,
      "state.search === returned search": st1?.search === S,
      returnedFrozen: { params: Object.isFrozen(P), search: Object.isFrozen(S) },
      committedFrozen: {
        params: st1 === undefined ? null : Object.isFrozen(st1.params),
        search: st1 === undefined ? null : Object.isFrozen(st1.search),
      },
    });
    r.dispose();
  }

  // ── D2 P1: traps on the container and both returned channel bags.
  {
    const P = tracer({ id: "42" });
    const S = tracer({ tab: "q" });
    const C = tracer({ params: P.bag, search: S.bag });
    const r = mk(() => C.bag);
    const st = getPluginApi(r).matchPath("/u/1?tab=a");

    out("D2 P1 matchPath — traps", {
      landed: { params: st?.params, search: st?.search, path: st?.path },
      container: C.traps,
      params: P.traps,
      search: S.traps,
    });
    r.dispose();
  }

  // ── D2 P1 discrimination: value drift on the returned params key.
  {
    const d = driftProxy(["id"], { id: "42" }, { id: "DRIFT" });
    const r = mk(() => ({ params: d.bag, search: {} }));
    const st = getPluginApi(r).matchPath("/u/1");

    out("D2 P1 drifting `id` on returned params", {
      landed: { params: st?.params, path: st?.path },
      reads: d.reads,
    });
    r.dispose();
  }

  // ── D2 P1 discrimination on a DECLARED query key riding in params: the
  // channel guard asks, then the copy takes. Drift splits ask from take.
  {
    const d = driftProxy(
      ["id", "tab"],
      { id: "42", tab: undefined },
      { tab: "SMUGGLED" },
    );
    const r = mk(() => ({ params: d.bag, search: {} }));
    const outcome = await attempt(() => getPluginApi(r).matchPath("/u/1"));

    out("D2 P1 declared query key `tab` in returned params, drifting", {
      outcome:
        typeof outcome === "string"
          ? outcome
          : { params: outcome?.params, search: outcome?.search, path: outcome?.path },
      reads: d.reads,
    });
    r.dispose();

    // CONTROL: the same key, stable and defined — the guard must refuse.
    const rc = mk(() => ({ params: { id: "42", tab: "OPEN" }, search: {} }));

    out("D2 P1 CONTROL declared query key in params, stable", {
      outcome: await attempt(() => {
        const s = getPluginApi(rc).matchPath("/u/1");

        return s === undefined ? "undefined" : { params: s.params, path: s.path };
      }),
    });
    rc.dispose();
  }

  // ── D2 P2: lying bag on the returned params (path slot) and search.
  {
    const rp = mk(() => ({ params: lyingBag({}, "id", "LIE"), search: {} }));
    const sp = getPluginApi(rp).matchPath("/u/1");

    out("D2 P2 lying params bag (ownKeys empty, gOPD swears own `id`)", {
      landed: { params: sp?.params, path: sp?.path },
    });
    rp.dispose();

    const rs = mk(() => ({
      params: { id: "42" },
      search: lyingBag({}, "tab", "LIE"),
    }));
    const ss = getPluginApi(rs).matchPath("/u/1");

    out("D2 P2 lying search bag (ownKeys empty, gOPD swears own `tab`)", {
      landed: { params: ss?.params, search: ss?.search, path: ss?.path },
    });
    rs.dispose();

    const rc = mk(() => ({ params: { id: "42" }, search: { tab: "HONEST" } }));
    const sc = getPluginApi(rc).matchPath("/u/1");

    out("D2 P2 CONTROL own+enumerable", {
      landed: { params: sc?.params, search: sc?.search, path: sc?.path },
    });
    rc.dispose();
  }

  // ── D2 P3: inherited accessor under the key core is about to write, plus an
  // own "__proto__" key on the returned params.
  {
    const r = mk(() => ({ params: { id: "42" }, search: { tab: "q" } }));
    const w = await withInheritedAccessor("id", () =>
      getPluginApi(r).matchPath("/u/1?tab=a"),
    );

    out("D2 P3 inherited `id` accessor on Object.prototype during matchPath", {
      result:
        typeof w.result === "string"
          ? w.result
          : { params: w.result?.params, path: w.result?.path },
      setterFired: w.setterFired,
      protoGetterReads: w.getterReads,
    });

    const w2 = await withInheritedAccessor("tab", () =>
      getPluginApi(r).matchPath("/u/1?tab=a"),
    );

    out("D2 P3 inherited `tab` accessor (query channel)", {
      result:
        typeof w2.result === "string"
          ? w2.result
          : { search: w2.result?.search, path: w2.result?.path },
      setterFired: w2.setterFired,
      protoGetterReads: w2.getterReads,
    });
    r.dispose();

    const polluted = JSON.parse(
      '{"__proto__":{"pwned":1},"id":"42"}',
    ) as Record<string, unknown>;
    const rp = mk(() => ({ params: polluted, search: {} }));
    const st = getPluginApi(rp).matchPath("/u/1");

    out("D2 P3 own `__proto__` key on the returned params (JSON.parse)", {
      landed: { params: st?.params, path: st?.path },
      "Object.prototype.pwned": ({} as Record<string, unknown>).pwned ?? null,
      "committed params prototype":
        st === undefined
          ? null
          : Object.getPrototypeOf(st.params) === null
            ? "null-prototype"
            : Object.getPrototypeOf(st.params) === Object.prototype
              ? "Object.prototype"
              : "OTHER",
      "committed params proto pwned":
        st === undefined
          ? null
          : ((Object.getPrototypeOf(st.params) as Record<string, unknown> | null)
              ?.pwned ?? null),
    });
    rp.dispose();
  }

  // ── D2 P4: freeze depth.
  {
    const nested = { deep: { k: 1 } };
    const P: Record<string, unknown> = { id: "42", extra: nested };
    const r = mk(() => ({ params: P, search: {} }));

    await r.start("/u/1");

    const st = r.getState();

    out("D2 P4 freeze depth", {
      landed: { params: st?.params, path: st?.path },
      callerBagFrozen: Object.isFrozen(P),
      callerNestedFrozen: Object.isFrozen(nested),
      callerNestedDeepFrozen: Object.isFrozen(nested.deep),
      coreParamsFrozen: st === undefined ? null : Object.isFrozen(st.params),
      "state.params.extra === caller nested":
        (st?.params as Record<string, unknown> | undefined)?.extra === nested,
      "state.params.extra frozen": Object.isFrozen(
        (st?.params as Record<string, unknown> | undefined)?.extra as object,
      ),
    });
    r.dispose();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D3 / D4 — Options.defaultParams / Options.defaultSearch callback returns
// ═════════════════════════════════════════════════════════════════════════════
async function d34(): Promise<void> {
  const mk = (
    defaultParams: unknown,
    defaultSearch: unknown,
  ): ReturnType<typeof createRouter> =>
    createRouter(ROUTES as never, {
      defaultRoute: "u",
      defaultParams,
      defaultSearch,
    } as never);

  // ── (a): ORIGINAL vs boundary COPY, both channels at once.
  {
    const P = { id: "3" };
    const S = { tab: "w" };
    let ranO = { p: 0, s: 0 };
    let ranC = { p: 0, s: 0 };
    const orig = mk(
      () => {
        ranO.p += 1;

        return P;
      },
      () => {
        ranO.s += 1;

        return S;
      },
    );
    const copy = mk(
      () => {
        ranC.p += 1;

        return { ...P };
      },
      () => {
        ranC.s += 1;

        return { ...S };
      },
    );

    await orig.start("/home");
    await copy.start("/home");

    const so = await orig.navigateToDefault();
    const sc = await copy.navigateToDefault();

    out("D3/D4(a) navigateToDefault — ORIGINAL vs COPY", {
      ran: { orig: ranO, copy: ranC },
      orig: { params: so.params, search: so.search, path: so.path },
      copy: { params: sc.params, search: sc.search, path: sc.path },
      equal: JSON.stringify([so.params, so.search, so.path]) ===
        JSON.stringify([sc.params, sc.search, sc.path]),
    });
    orig.dispose();
    copy.dispose();
  }

  // ── identity / back-visibility.
  {
    const P: Record<string, unknown> = { id: "3" };
    const S: Record<string, unknown> = { tab: "w" };
    const r = mk(
      () => P,
      () => S,
    );

    await r.start("/home");

    const st = await r.navigateToDefault();

    P.id = "MUTATED";
    S.tab = "MUTATED";

    out("D3/D4 back-visibility", {
      committed: { params: st.params, search: st.search, path: st.path },
      stateAfterMutation: {
        params: r.getState()?.params,
        search: r.getState()?.search,
        path: r.getState()?.path,
      },
      "state.params === returned params": st.params === P,
      "state.search === returned search": st.search === S,
      returnedFrozen: { params: Object.isFrozen(P), search: Object.isFrozen(S) },
      committedFrozen: {
        params: Object.isFrozen(st.params),
        search: Object.isFrozen(st.search),
      },
    });
    r.dispose();
  }

  // ── P1: traps per key on both returned bags.
  {
    const P = tracer({ id: "3" });
    const S = tracer({ tab: "w" });
    const r = mk(
      () => P.bag,
      () => S.bag,
    );

    await r.start("/home");

    const st = await r.navigateToDefault();

    out("D3/D4 P1 traps on the returned bags", {
      landed: { params: st.params, search: st.search, path: st.path },
      paramsTraps: P.traps,
      searchTraps: S.traps,
    });
    r.dispose();
  }

  // ── P1 discrimination: value drift.
  {
    const dp = driftProxy(["id"], { id: "3" }, { id: "DRIFT" });
    const ds = driftProxy(["tab"], { tab: "w" }, { tab: "DRIFT" });
    const r = mk(
      () => dp.bag,
      () => ds.bag,
    );

    await r.start("/home");

    const st = await r.navigateToDefault();

    out("D3/D4 P1 drifting keys", {
      landed: { params: st.params, search: st.search, path: st.path },
      reads: { params: dp.reads, search: ds.reads },
    });
    r.dispose();
  }

  // ── P1 discrimination on the declared query key smuggled into defaultParams:
  // the seam asks, the copy takes; drift splits the two.
  {
    const d = driftProxy(
      ["id", "tab"],
      { id: "3", tab: undefined },
      { tab: "SMUGGLED" },
    );
    const r = mk(() => d.bag, undefined);

    await r.start("/home");

    const outcome = await attempt(() => r.navigateToDefault());

    out("D3 P1 declared query key `tab` in defaultParams return, drifting", {
      outcome:
        typeof outcome === "string"
          ? outcome
          : { params: outcome.params, search: outcome.search, path: outcome.path },
      reads: d.reads,
    });
    r.dispose();

    const rc = mk(() => ({ id: "3", tab: "OPEN" }), undefined);

    await rc.start("/home");

    out("D3 P1 CONTROL declared query key in defaultParams, stable", {
      outcome: await attempt(async () => {
        const s = await rc.navigateToDefault();

        return { params: s.params, path: s.path };
      }),
    });
    rc.dispose();
  }

  // ── P2: lying bags on both channels.
  {
    const r = mk(
      () => lyingBag({}, "id", "LIE"),
      () => lyingBag({}, "tab", "LIE"),
    );

    await r.start("/home");

    const outcome = await attempt(() => r.navigateToDefault());

    out("D3/D4 P2 lying bags (ownKeys empty, gOPD swears own)", {
      outcome:
        typeof outcome === "string"
          ? outcome
          : { params: outcome.params, search: outcome.search, path: outcome.path },
    });
    r.dispose();

    const rc = mk(
      () => ({ id: "LIE" }),
      () => ({ tab: "LIE" }),
    );

    await rc.start("/home");

    const c = await rc.navigateToDefault();

    out("D3/D4 P2 CONTROL own+enumerable", {
      params: c.params,
      search: c.search,
      path: c.path,
    });
    rc.dispose();
  }

  // ── P3: inherited accessor + own "__proto__".
  {
    const r = mk(
      () => ({ id: "3" }),
      () => ({ tab: "w" }),
    );

    await r.start("/home");

    const w = await withInheritedAccessor("id", () => r.navigateToDefault());

    out("D3 P3 inherited `id` accessor during navigateToDefault", {
      result:
        typeof w.result === "string"
          ? w.result
          : { params: w.result.params, path: w.result.path },
      setterFired: w.setterFired,
      protoGetterReads: w.getterReads,
    });
    r.dispose();

    const r2 = mk(
      () => ({ id: "3" }),
      () => ({ tab: "w" }),
    );

    await r2.start("/home");

    const w2 = await withInheritedAccessor("tab", () => r2.navigateToDefault());

    out("D4 P3 inherited `tab` accessor during navigateToDefault", {
      result:
        typeof w2.result === "string"
          ? w2.result
          : { search: w2.result.search, path: w2.result.path },
      setterFired: w2.setterFired,
      protoGetterReads: w2.getterReads,
    });
    r2.dispose();

    const pollutedP = JSON.parse('{"__proto__":{"pwned":1},"id":"3"}') as object;
    const pollutedS = JSON.parse(
      '{"__proto__":{"pwnedS":1},"tab":"w"}',
    ) as object;
    const r3 = mk(
      () => pollutedP,
      () => pollutedS,
    );

    await r3.start("/home");

    const st = await attempt(() => r3.navigateToDefault());

    out("D3/D4 P3 own `__proto__` key on the returned bags (JSON.parse)", {
      outcome:
        typeof st === "string"
          ? st
          : { params: st.params, search: st.search, path: st.path },
      "Object.prototype.pwned": ({} as Record<string, unknown>).pwned ?? null,
      "committed params prototype":
        typeof st === "string"
          ? null
          : Object.getPrototypeOf(st.params) === null
            ? "null-prototype"
            : Object.getPrototypeOf(st.params) === Object.prototype
              ? "Object.prototype"
              : "OTHER",
      "committed params proto pwned":
        typeof st === "string"
          ? null
          : ((Object.getPrototypeOf(st.params) as Record<string, unknown> | null)
              ?.pwned ?? null),
      "committed search proto pwnedS":
        typeof st === "string"
          ? null
          : ((Object.getPrototypeOf(st.search) as Record<string, unknown> | null)
              ?.pwnedS ?? null),
    });
    r3.dispose();
  }

  // ── P4: freeze depth.
  {
    const nested = { deep: { k: 1 } };
    const P: Record<string, unknown> = { id: "3", extra: nested };
    const nestedS = { deep: { k: 2 } };
    const S: Record<string, unknown> = { tab: "w", extraS: nestedS };
    const r = mk(
      () => P,
      () => S,
    );

    await r.start("/home");

    const st = await r.navigateToDefault();

    out("D3/D4 P4 freeze depth", {
      landed: { params: st.params, search: st.search, path: st.path },
      callerBagsFrozen: { params: Object.isFrozen(P), search: Object.isFrozen(S) },
      callerNestedFrozen: {
        params: Object.isFrozen(nested),
        search: Object.isFrozen(nestedS),
      },
      coreLevelFrozen: {
        params: Object.isFrozen(st.params),
        search: Object.isFrozen(st.search),
      },
      "state.params.extra === caller nested":
        (st.params as Record<string, unknown>).extra === nested,
    });
    r.dispose();
  }
}

async function main(): Promise<void> {
  await d1extra();
  console.log("");
  await d2();
  console.log("");
  await d34();
}

void main();
