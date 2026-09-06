// Триаж-батч: forwardState-шов, предикаты состояния, systemCommit·context,
// buildStateResolved, port().buildPath / port().resolveForward, getNavigator.
//
// Каждая секция: (1) позитивный контроль — тот же код на заведомо легальном
// входе, (2) доказательство, что вход ДОШЁЛ (счётчик вызовов / чтений),
// (3) механизм — идентичность контейнера, число чтений ядра, удержание.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/triage-forward-seam-predicates/probe-triage.ts
import { createRouter, getNavigator } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;

const out = (s: string, d: unknown): void => {
  console.log(`${s} ${JSON.stringify(d)}`);
};
const errText = (e: unknown): string =>
  e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
const attempt = <T>(run: () => T): T | string => {
  try {
    return run();
  } catch (e) {
    return `THREW ${errText(e)}`;
  }
};

const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "a", path: "/a/:id?tab" },
  { name: "fwd", path: "/fwd/:id", forwardTo: "a", defaultParams: { id: "9" } },
];

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES() as never, {} as never);

// ─── S1. forwardState: pass-through по идентичности без интерцепторов ───────
{
  const r = mk();
  const api = getPluginApi(r);
  const params: Bag = { id: "7" };
  const search: Bag = { tab: "x" };
  const res = api.forwardState("a", params as never, search as never) as {
    params: Bag;
    search: Bag;
  };
  const p2: Bag = { id: "7" };
  const res2 = api.forwardState("fwd", p2 as never) as { params: Bag };
  out("S1 forwardState·routeParams", {
    reached: res.params.id === "7",
    paramsIdentity: res.params === params,
    searchIdentity: res.search === search,
    control_forwardingRoute_identity: res2.params === p2,
    control_forwardingRoute_merged: res2.params,
  });
}

// ─── S2. счёт чтений ядра на мешке вызывающего (P1) ────────────────────────
{
  const r = mk();
  const api = getPluginApi(r);
  const { bag, reads } = countingBag({ id: "7" });
  const res = api.forwardState("a", bag as never) as { params: Bag };
  out("S2 forwardState reads (non-forwarding)", {
    reached: (res.params as unknown) === (bag as unknown),
    reads: { ...reads },
  });
  const { bag: b2, reads: r2 } = countingBag({ id: "7" });
  const res2 = api.forwardState("fwd", b2 as never) as { params: Bag };
  out("S2 control forwarding-route reads", {
    reached: res2.params.id !== undefined,
    identity: (res2.params as unknown) === (b2 as unknown),
    reads: { ...r2 },
  });
}

// ─── S3. интерцептор: аргументы next(...) уходят в ядро по ссылке ──────────
{
  const r = mk();
  const api = getPluginApi(r);
  const injected: Bag = { id: "42" };
  let sawFirstArgIdentity: boolean | undefined;
  const callerBag: Bag = { id: "7" };
  api.addInterceptor("forwardState", ((
    next: (n: string, p: Bag, s?: Bag) => { params: Bag },
    name: string,
    p: Bag,
  ) => {
    sawFirstArgIdentity = p === callerBag;

    return next(name, injected);
  }) as never);
  const res = api.forwardState("a", callerBag as never) as { params: Bag };
  out("S3 InterceptorFn·next·routeParams", {
    reached: sawFirstArgIdentity !== undefined,
    firstHopArgIsCallerObject: sawFirstArgIdentity,
    resultIsInterceptorObject: (res.params as unknown) === (injected as unknown),
    resultValue: res.params,
  });
}

// ─── S4. что публикуется в state.params через canonicalize ────────────────
{
  const r = mk();
  const api = getPluginApi(r);
  const injected: Bag = { id: "42" };
  api.addInterceptor("forwardState", ((
    next: (n: string, p: Bag, s?: Bag) => unknown,
    name: string,
  ) => next(name, injected)) as never);
  r.start("/home", () => {
    /* noop */
  });
  r.navigate("a", { id: "7" } as never, {} as never, () => {
    /* noop */
  });
  const state = r.getState() as unknown as { params: Bag };
  out("S4 landed state.params", {
    reached: state.params.id === "42",
    identityWithInterceptorObject:
      (state.params as unknown) === (injected as unknown),
    frozen: Object.isFrozen(state.params),
  });
}

// ─── S5. systemCommit·toState.context — копия контейнера ──────────────────
{
  const r = mk();
  const internals = getInternals(r) as unknown as {
    systemCommit: (t: unknown, f: unknown, o: unknown) => unknown;
  };
  r.start("/home", () => {
    /* noop */
  });
  const leaf = { live: 1 };
  const ctx: Bag = { ns: leaf };
  const foreign = {
    name: "a",
    path: "/a/7",
    params: { id: "7" },
    search: {},
    context: ctx,
  };
  const committed = attempt(
    () => internals.systemCommit(foreign, r.getState(), {}) as { context: Bag },
  );
  out("S5 systemCommit·toState.context", {
    reached: typeof committed !== "string",
    threw: typeof committed === "string" ? committed : undefined,
    contextCopied:
      typeof committed === "string" ? undefined : committed.context !== ctx,
    leafByRef:
      typeof committed === "string" ? undefined : committed.context.ns === leaf,
  });
}

// ─── S6. shouldUpdateNode — модульный кэш держит объекты вызывающего ──────
{
  const r = mk();
  const pred = r.shouldUpdateNode("") as unknown as (
    to: unknown,
    from?: unknown,
  ) => boolean;
  const to1 = { name: "a", params: { id: "1" }, search: {}, path: "/a/1" };
  const from1 = { name: "home", params: {}, search: {}, path: "/home" };
  let reads = 0;
  const toProxy = new Proxy(to1, {
    get(t, k, rec) {
      if (k === "name") reads += 1;

      return Reflect.get(t, k, rec);
    },
  });
  const first = attempt(() => pred(toProxy, from1));
  const readsAfterFirst = reads;
  const second = attempt(() => pred(toProxy, from1));
  const readsAfterSecond = reads;
  const to2 = { name: "a", params: { id: "1" }, search: {}, path: "/a/1" };
  const third = attempt(() => pred(to2, from1));
  out("S6 shouldUpdateNode identity cache", {
    reached: typeof first === "boolean",
    first,
    second,
    third,
    readsAfterFirst,
    readsAfterSecond,
    cacheHitOnSameObject: readsAfterSecond === readsAfterFirst,
  });
}

// ─── S7. areStatesEqual — читает и отбрасывает ────────────────────────────
{
  const r = mk();
  const { bag: p1, reads: r1 } = countingBag({ id: "7" });
  const s1 = { name: "a", params: p1, search: {}, path: "/a/7" };
  const s2 = { name: "a", params: { id: "7" }, search: {}, path: "/a/7" };
  const eq = attempt(() => r.areStatesEqual(s1 as never, s2 as never));
  const eqNeg = attempt(() =>
    r.areStatesEqual(s1 as never, { ...s2, params: { id: "8" } } as never),
  );
  out("S7 areStatesEqual", {
    reached: typeof eq === "boolean",
    positive: eq,
    negativeControl: eqNeg,
    readsOnCallerBag: { ...r1 },
  });
}

// ─── S8. buildStateResolved — мешок по ссылке в возврат ───────────────────
{
  const r = mk();
  const internals = getInternals(r) as unknown as {
    buildStateResolved: (n: string, p: Bag) => { params: Bag } | undefined;
  };
  const params: Bag = { id: "7" };
  const res = attempt(() => internals.buildStateResolved("a", params));
  const miss = attempt(() => internals.buildStateResolved("nope", params));
  out("S8 buildStateResolved·resolvedParams", {
    reached: typeof res === "object" && res !== undefined,
    identity:
      typeof res === "object" && res !== undefined
        ? res.params === params
        : undefined,
    controlUnknownRoute: miss === undefined ? "undefined" : String(miss),
  });
}

// ─── S9. port().buildPath / port().resolveForward ─────────────────────────
{
  const r = mk();
  const internals = getInternals(r) as unknown as {
    port: () => {
      buildPath: (n: string, p: Bag, s?: Bag) => string;
      resolveForward: (n: string, p: Bag, s?: Bag) => { params: Bag };
    };
  };
  const port = internals.port();
  const { bag, reads } = countingBag({ id: "7" });
  const href = attempt(() => port.buildPath("a", bag as Bag, { tab: "x" }));
  const params: Bag = { id: "7" };
  const fwd = attempt(() => port.resolveForward("a", params));
  const fwd2 = attempt(() => port.resolveForward("fwd", { id: "7" }));
  out("S9 port doors", {
    buildPathHref: href,
    buildPathReads: { ...reads },
    resolveForwardIdentity:
      typeof fwd === "object" ? fwd.params === params : String(fwd),
    control_forwardingRoute:
      typeof fwd2 === "object" ? fwd2.params : String(fwd2),
  });
}

// ─── S10. getNavigator — аргумент как ключ WeakMap ────────────────────────
{
  const r1 = mk();
  const r2 = mk();
  const n1 = getNavigator(r1 as never);
  const n1again = getNavigator(r1 as never);
  const n2 = getNavigator(r2 as never);
  out("S10 getNavigator·router", {
    sameRouterSameNavigator: n1 === n1again,
    differentRouterDifferentNavigator: n1 !== n2,
    frozen: Object.isFrozen(n1),
  });
}
