// Family «callback-return · мешок канала из функции приложения» — ONE matrix probe.
// Rows: the four doors. Columns: experiment (a), P1, P2, P3, P4.
//
// Doors
//   D1 Route.encodeParams·return        (buildPath href arc + matchPath rewrite arc)
//   D2 Route.decodeParams·return        (matchPath)
//   D3 Options.defaultParams·callbackReturn  (navigateToDefault)
//   D4 Options.defaultSearch·callbackReturn  (navigateToDefault)
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-callback-return-.../matrix.ts
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

// A full trap recorder: per-key counts for get / gOPD / has, plus ownKeys.
// countingBag only instruments `get`; the doors here also enumerate and ask.
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

// A LYING proxy (P2, #1854): ownKeys never names `hidden`, but gOPD swears it
// is an own enumerable data property and get answers it.
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

// P3 — an INHERITED accessor under the key name core is about to write.
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
// SECTION 0 — POSITIVE CONTROLS. Every later verdict is read against these.
// ═════════════════════════════════════════════════════════════════════════════
async function section0(): Promise<void> {
  const plain = createRouter(ROUTES as never);

  out("0.1 CONTROL no codec — buildPath", {
    href: plain.buildPath("u", { id: "1" }, { tab: "a" }),
  });

  const m = getPluginApi(plain).matchPath("/u/1?tab=a");

  out("0.1 CONTROL no codec — matchPath", {
    params: m?.params,
    search: m?.search,
    path: m?.path,
  });
  plain.dispose();

  const s = createRouter(ROUTES as never, {
    defaultRoute: "u",
    defaultParams: { id: "3" },
    defaultSearch: { tab: "w" },
  } as never);

  await s.start("/home");

  const st = await s.navigateToDefault();

  out("0.2 CONTROL static defaults — navigateToDefault", {
    params: st.params,
    search: st.search,
    path: st.path,
  });
  s.dispose();
}

// ═════════════════════════════════════════════════════════════════════════════
// D1 — Route.encodeParams·return
// ═════════════════════════════════════════════════════════════════════════════
async function d1(): Promise<void> {
  const mk = (
    encode: (ch: never) => unknown,
  ): ReturnType<typeof createRouter> =>
    createRouter([
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab", encodeParams: encode },
    ] as never);

  // ── D1 · experiment (a): ORIGINAL container vs a SHALLOW COPY of it made at
  // the boundary (emulated in the callback: same leaves, new containers).
  {
    const P = { id: "9" };
    const S = { tab: "z" };
    let ranO = 0;
    let ranC = 0;
    const orig = mk(() => {
      ranO += 1;

      return { params: P, search: S };
    });
    const copy = mk(() => {
      ranC += 1;
      const ret = { params: P, search: S };

      return { params: { ...ret.params }, search: { ...ret.search } };
    });
    const hrefO = orig.buildPath("u", { id: "1" }, { tab: "a" });
    const hrefC = copy.buildPath("u", { id: "1" }, { tab: "a" });
    const mO = getPluginApi(orig).matchPath("/u/1?tab=a");
    const mC = getPluginApi(copy).matchPath("/u/1?tab=a");

    out("D1(a) href/rewrite — ORIGINAL vs COPY", {
      ran: { orig: ranO, copy: ranC },
      href: { orig: hrefO, copy: hrefC, equal: hrefO === hrefC },
      matchPath: {
        orig: { params: mO?.params, search: mO?.search, path: mO?.path },
        copy: { params: mC?.params, search: mC?.search, path: mC?.path },
        pathEqual: mO?.path === mC?.path,
      },
    });
    orig.dispose();
    copy.dispose();
  }

  // ── D1 · identity / back-visibility: does core keep the returned container?
  {
    const P: Record<string, unknown> = { id: "9" };
    const S: Record<string, unknown> = { tab: "z" };
    const ret = { params: P, search: S };
    const r = mk(() => ret);
    const href1 = r.buildPath("u", { id: "1" }, { tab: "a" });

    P.id = "MUTATED";
    S.tab = "MUTATED";

    const href2 = r.buildPath("u", { id: "1" }, { tab: "a" });
    const state = getPluginApi(r).matchPath("/u/1?tab=a");

    out("D1(a) back-visibility + freeze after the call", {
      href1,
      href2_afterMutation: href2,
      "mutation of the returned bag is visible on the NEXT call": href1 !== href2,
      "state.params === returned .params": state?.params === P,
      "state.search === returned .search": state?.search === S,
      frozenAfter: {
        params: Object.isFrozen(P),
        search: Object.isFrozen(S),
        container: Object.isFrozen(ret),
      },
    });
    r.dispose();
  }

  // ── D1 · P1: reads per key on the returned container and both channel bags.
  {
    const P = tracer({ id: "9" });
    const S = tracer({ tab: "z" });
    const C = tracer({ params: P.bag, search: S.bag });
    const r = mk(() => C.bag);
    const href = r.buildPath("u", { id: "1" }, { tab: "a" });

    out("D1 P1 href arc — traps", {
      href,
      container: C.traps,
      params: P.traps,
      search: S.traps,
    });
    r.dispose();

    const P2t = tracer({ id: "9" });
    const S2t = tracer({ tab: "z" });
    const C2 = tracer({ params: P2t.bag, search: S2t.bag });
    const r2 = mk(() => C2.bag);
    const st = getPluginApi(r2).matchPath("/u/1?tab=a");

    out("D1 P1 rewrite arc — traps", {
      landedPath: st?.path,
      landedParams: st?.params,
      container: C2.traps,
      params: P2t.traps,
      search: S2t.traps,
    });
    r2.dispose();
  }

  // ── D1 · P1 discrimination: a DRIFTING key — first read "9", later "DRIFT".
  {
    let n = 0;
    const P = new Proxy({} as Record<string, unknown>, {
      get(_t, k): unknown {
        if (k === "id") {
          n += 1;

          return n === 1 ? "9" : "DRIFT";
        }

        return undefined;
      },
      getOwnPropertyDescriptor(): PropertyDescriptor {
        return {
          value: undefined,
          enumerable: true,
          configurable: true,
          writable: true,
        };
      },
      ownKeys(): string[] {
        return ["id"];
      },
      has(_t, k): boolean {
        return k === "id";
      },
    });
    const r = mk(() => ({ params: P, search: {} }));
    const href = r.buildPath("u", { id: "1" });

    out("D1 P1 drifting `id` on the returned params (href arc)", {
      href,
      idReads: n,
    });
    r.dispose();

    let n2 = 0;
    const P2p = new Proxy({} as Record<string, unknown>, {
      get(_t, k): unknown {
        if (k === "id") {
          n2 += 1;

          return n2 === 1 ? "9" : "DRIFT";
        }

        return undefined;
      },
      getOwnPropertyDescriptor(): PropertyDescriptor {
        return {
          value: undefined,
          enumerable: true,
          configurable: true,
          writable: true,
        };
      },
      ownKeys(): string[] {
        return ["id"];
      },
      has(_t, k): boolean {
        return k === "id";
      },
    });
    const r2 = mk(() => ({ params: P2p, search: {} }));
    const st2 = getPluginApi(r2).matchPath("/u/1");

    out("D1 P1 drifting `id` on the returned params (rewrite arc)", {
      path: st2?.path,
      params: st2?.params,
      idReads: n2,
    });
    r2.dispose();
  }

  // ── D1 · P2: lying proxy on the returned SEARCH bag.
  {
    const r = mk(() => ({
      params: { id: "9" },
      search: lyingBag({}, "tab", "LIE"),
    }));
    const href = r.buildPath("u", { id: "1" });
    const rc = mk(() => ({ params: { id: "9" }, search: { tab: "LIE" } }));
    const hrefControl = rc.buildPath("u", { id: "1" });

    out("D1 P2 lying search bag (ownKeys hides `tab`, gOPD swears own)", {
      href,
      "tab in href": href.includes("tab="),
      CONTROL_ownKeyed: hrefControl,
    });
    r.dispose();
    rc.dispose();

    const rp = mk(() => ({ params: lyingBag({}, "id", "LIE"), search: {} }));

    out("D1 P2 lying params bag (path slot)", {
      href: await attempt(() => rp.buildPath("u", { id: "1" })),
    });
    rp.dispose();
  }

  // ── D1 · P3: inherited accessor + own "__proto__" on the returned bags.
  {
    const r = mk(() => ({ params: { id: "9" }, search: {} }));
    const withProto = await withInheritedAccessor("id", () =>
      r.buildPath("u", { id: "1" }),
    );

    out("D1 P3 inherited `id` accessor on Object.prototype during buildPath", {
      result: withProto.result,
      setterFired: withProto.setterFired,
      protoGetterReads: withProto.getterReads,
    });

    const withProto2 = await withInheritedAccessor("id", () =>
      getPluginApi(r).matchPath("/u/1"),
    );

    out("D1 P3 inherited `id` accessor during matchPath (rewrite arc)", {
      result:
        typeof withProto2.result === "string"
          ? withProto2.result
          : {
              params: withProto2.result?.params,
              path: withProto2.result?.path,
            },
      setterFired: withProto2.setterFired,
      protoGetterReads: withProto2.getterReads,
    });
    r.dispose();

    const polluted = JSON.parse('{"__proto__":{"pwned":1},"id":"9"}') as Record<
      string,
      unknown
    >;
    const rp = mk(() => ({ params: polluted, search: {} }));
    const href = await attempt(() => rp.buildPath("u", { id: "1" }));
    const st = await attempt(() => getPluginApi(rp).matchPath("/u/1"));

    out("D1 P3 own `__proto__` key on the returned params (JSON.parse)", {
      href,
      matchPathParams: typeof st === "string" ? st : st?.params,
      "Object.prototype.pwned": ({} as Record<string, unknown>).pwned ?? null,
      "matched params proto poisoned":
        typeof st === "string" || st === undefined
          ? null
          : ((Object.getPrototypeOf(st.params) as Record<string, unknown> | null)
              ?.pwned ?? null),
    });
    rp.dispose();
  }

  // ── D1 · P4: does core freeze a NESTED caller container reached through the door?
  {
    const nested = { deep: { k: 1 } };
    const P: Record<string, unknown> = { id: "9", extra: nested };
    const r = mk(() => ({ params: P, search: {} }));
    const href = r.buildPath("u", { id: "1" });
    const st = getPluginApi(r).matchPath("/u/1");

    out("D1 P4 freeze depth", {
      href,
      callerParamsFrozen: Object.isFrozen(P),
      callerNestedFrozen: Object.isFrozen(nested),
      callerNestedDeepFrozen: Object.isFrozen(nested.deep),
      coreStateParamsFrozen: st === undefined ? null : Object.isFrozen(st.params),
      "state.params === returned bag": st?.params === P,
      "state.params.extra === caller nested": (st?.params as Record<string, unknown> | undefined)?.extra === nested,
    });
    r.dispose();
  }
}

async function main(): Promise<void> {
  await section0();
  console.log("");
  await d1();
}

void main();
