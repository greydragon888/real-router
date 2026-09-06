// MATRIX — family «forwardState-шов · мешки мимо копии».
// Rows: the six doors of the family. Columns: mechanism/identity, experiment (a),
// P1, P2, P3, P4.
//
// One object-flow: the caller's `params` / `search` bags enter the seam
// (`Router.ts · forwardState` closure, reached from `api/getPluginApi.ts ·
// forwardState`, `internals.ts` registration, `wiring/wireNamespaces.ts ·
// createRouteResolver.resolveForward`), travel through the interceptor chain
// (`internals.ts · executeInterceptorChain`), through the dynamic `forwardTo`
// callback (`RoutesNamespace.ts · #resolveDynamicForward`) and back out through
// `#layerChainDefaults` (`helpers.ts · mergeDefined` + `normalizeChannel`).
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-forwardstate-шов-мешки-мимо-копии/matrix.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;

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

// ─── fixture ─────────────────────────────────────────────────────────────────
// `u`  — plain route, NO defaults: the seam's pass-through fast path.
// `f`  — static forward to `t`, with hop defaults: the copy path.
// `d`  — dynamic forwardTo (callback) to `t`.
// `t`  — terminal.
const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id" },
  { name: "q", path: "/q/:id?tab" },
  {
    name: "f",
    path: "/f/:id",
    forwardTo: "t",
    defaultParams: { z: "hop" },
    defaultSearch: { s: "hop" },
  },
  { name: "d", path: "/d/:id", forwardTo: (_g: unknown, p: Bag) => (p.id === "9" ? "home" : "u") },
  { name: "t", path: "/t/:id/:z?s" },
];

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES() as never, {} as never);

const passThrough = (r: ReturnType<typeof createRouter>): void => {
  getPluginApi(r).addInterceptor(
    "forwardState",
    ((next: never, n: never, p: never, s: never) =>
      (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s)) as never,
  );
};

// ─── H — positive controls of the instrument ─────────────────────────────────
async function sectionH(): Promise<void> {
  const r = mk();

  await r.start("/home");

  const api = getPluginApi(r);
  const internals = getInternals(r) as unknown as {
    forwardState: (n: string, p: Bag, s?: Bag) => { name: string; params: Bag; search: Bag };
    port: () => { resolveForward: (n: string, p: Bag, s?: Bag) => unknown };
  };

  out("H0 env", {
    href: r.buildPath("u", { id: "7" } as never),
    pluginApiForwardState: typeof api.forwardState,
    internalsForwardState: typeof internals.forwardState,
    portResolveForward: typeof internals.port().resolveForward,
    "same closure? internals.forwardState === port().resolveForward":
      (internals.forwardState as unknown) === (internals.port().resolveForward as unknown),
  });

  // H1 — which doors REACH the seam. Counter via a registered interceptor:
  // the interceptor only runs when the seam's chain executes.
  const counters: Record<string, number> = {};
  let label = "-";
  const r2 = mk();

  getPluginApi(r2).addInterceptor("forwardState", ((
    next: never,
    n: never,
    p: never,
    s: never,
  ) => {
    counters[label] = (counters[label] ?? 0) + 1;

    return (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s);
  }) as never);

  label = "start";
  await r2.start("/home");
  label = "navigate";
  await r2.navigate("u", { id: "7" } as never);
  label = "buildPath";
  r2.buildPath("u", { id: "8" } as never);
  label = "isActiveRoute";
  r2.isActiveRoute("u", { id: "7" } as never);
  label = "canNavigateTo";
  r2.canNavigateTo("u", { id: "7" } as never);
  label = "matchPath";
  getPluginApi(r2).matchPath("/u/9");
  label = "PluginApi.forwardState";
  getPluginApi(r2).forwardState("u", { id: "7" } as never);
  label = "RouterInternals.forwardState";
  (getInternals(r2) as never as { forwardState: (n: string, p: Bag) => unknown }).forwardState(
    "u",
    { id: "7" },
  );
  label = "port().resolveForward";
  (
    getInternals(r2) as never as { port: () => { resolveForward: (n: string, p: Bag) => unknown } }
  ).port().resolveForward("u", { id: "7" });

  out("H1 seam runs per door (interceptor invocations)", counters);
  r.dispose();
  r2.dispose();
}

// ─── A — mechanism / identity on each entry path ─────────────────────────────
async function sectionA(): Promise<void> {
  for (const armed of [false, true]) {
    const tag = armed ? "armed(interceptor)" : "bare";
    const r = mk();

    if (armed) {
      passThrough(r);
    }

    await r.start("/home");

    const api = getPluginApi(r);
    const internals = getInternals(r) as unknown as {
      forwardState: (n: string, p: Bag, s?: Bag) => { name: string; params: Bag; search: Bag };
      port: () => {
        resolveForward: (n: string, p: Bag, s?: Bag) => { name: string; params: Bag; search: Bag };
      };
    };

    // A1 — PluginApi.forwardState on the NON-forwarding route (fast path).
    const p1: Bag = { id: "7" };
    const s1: Bag = { tab: "x" };
    const o1 = api.forwardState("u", p1 as never, s1 as never);

    out(`A1 PluginApi.forwardState·routeParams|routeSearch, route "u" (${tag})`, {
      paramsIdentity: (o1.params as unknown) === p1,
      searchIdentity: (o1.search as unknown) === s1,
      name: o1.name,
    });

    // A2 — the SAME two slots on the FORWARDING route (control: input reached
    // the copy branch — #layerChainDefaults).
    const p2: Bag = { id: "7" };
    const s2: Bag = { tab: "x" };
    const o2 = api.forwardState("f", p2 as never, s2 as never);

    out(`A2 control_forwardingRoute, route "f" (${tag})`, {
      paramsIdentity: (o2.params as unknown) === p2,
      searchIdentity: (o2.search as unknown) === s2,
      name: o2.name,
      "hop default merged (z)": (o2.params as Bag).z,
      "hop default merged (s)": (o2.search as Bag).s,
    });

    // A3 — RouterInternals.forwardState, the same closure minus validator hops.
    const p3: Bag = { id: "7" };
    const s3: Bag = { tab: "x" };
    const o3 = internals.forwardState("u", p3, s3);

    out(`A3 RouterInternals.forwardState·routeParams|routeSearch (${tag})`, {
      paramsIdentity: (o3.params as unknown) === p3,
      searchIdentity: (o3.search as unknown) === s3,
    });

    // A4 — observer: port().resolveForward·return.
    const p4: Bag = { id: "7" };
    const s4: Bag = { tab: "x" };
    const o4 = internals.port().resolveForward("u", p4, s4);

    out(`A4 observer RouterInternals.port().resolveForward·return (${tag})`, {
      paramsIdentity: (o4.params as unknown) === p4,
      searchIdentity: (o4.search as unknown) === s4,
    });

    // A5 — core's READS of the caller bag through the fast path.
    const cb = countingBag<Bag>({ id: "7" });
    const cs = countingBag<Bag>({ tab: "x" });

    api.forwardState("u", cb.bag as never, cs.bag as never);
    out(`A5 reads on the caller's bags, route "u" (${tag})`, {
      paramsReads: { ...cb.reads },
      searchReads: { ...cs.reads },
    });

    // A6 — control: the same bags on the FORWARDING route (input reaches the
    // merge, so reads must appear).
    const cb2 = countingBag<Bag>({ id: "7" });
    const cs2 = countingBag<Bag>({ tab: "x" });

    api.forwardState("f", cb2.bag as never, cs2.bag as never);
    out(`A6 control_forwardingRoute reads (${tag})`, {
      paramsReads: { ...cb2.reads },
      searchReads: { ...cs2.reads },
    });

    r.dispose();
  }
}

// ─── B — EXPERIMENT (a): pre-copied container vs the original ────────────────
// Shallow copy: new container, SAME leaf references. Everything observable is
// compared between the two arms.
async function sectionB(): Promise<void> {
  const leafObj = { deep: "L" };
  const observe = async (
    copied: boolean,
  ): Promise<Record<string, unknown>> => {
    const r = mk();

    await r.start("/home");

    const api = getPluginApi(r);
    const internals = getInternals(r) as unknown as {
      forwardState: (n: string, p: Bag, s?: Bag) => { name: string; params: Bag; search: Bag };
      port: () => {
        resolveForward: (n: string, p: Bag, s?: Bag) => { name: string; params: Bag; search: Bag };
      };
    };
    const origP: Bag = { id: "7", leaf: leafObj };
    const origS: Bag = { tab: "x" };
    const inP = copied ? { ...origP } : origP;
    const inS = copied ? { ...origS } : origS;

    const seenEvents: string[] = [];

    r.subscribe((s: never) => {
      seenEvents.push(`sub:${(s as unknown as { route: { path: string } }).route.path}`);
    });

    const fw = api.forwardState("u", inP as never, inS as never);
    const fwInternals = internals.forwardState("u", inP, inS);
    const fwPort = internals.port().resolveForward("u", inP, inS);
    const href = r.buildPath("u", inP as never, inS as never);
    const canNav = r.canNavigateTo("u", inP as never, inS as never);
    const st = await r.navigate("u", inP as never, inS as never);
    const active = r.isActiveRoute("u", inP as never);
    const gotState = r.getState() as unknown as {
      params: Bag;
      search: Bag;
      path: string;
      meta: unknown;
      context: unknown;
    };

    const result = {
      "forwardState.name": fw.name,
      "forwardState.params": { ...(fw.params as Bag) },
      "forwardState.search": { ...(fw.search as Bag) },
      "internals.forwardState.params": { ...(fwInternals.params as Bag) },
      "port.resolveForward.params": { ...(fwPort.params as Bag) },
      href,
      canNav,
      "navigate.name": st.name,
      "state.params": { ...gotState.params },
      "state.search": { ...gotState.search },
      "state.path": gotState.path,
      "state.meta": JSON.parse(JSON.stringify(gotState.meta ?? null)) as unknown,
      "state.context": JSON.parse(JSON.stringify(gotState.context ?? null)) as unknown,
      isActiveRoute: active,
      events: seenEvents,
      // leaf identity must survive a CONTAINER copy
      "state.params.leaf === leafObj": (gotState.params.leaf as unknown) === leafObj,
      "forwardState.params.leaf === leafObj": ((fw.params as Bag).leaf as unknown) === leafObj,
      // backward visibility, arm 1: mutate the ORIGINAL after the door ran
      _origAfter: origP,
      _state: gotState,
      _fw: fw,
      _router: r,
    };

    return result;
  };

  const A = await observe(false);
  const B = await observe(true);

  const cmpKeys = Object.keys(A).filter((k) => !k.startsWith("_"));
  const diffs: Record<string, unknown> = {};

  for (const k of cmpKeys) {
    const a = JSON.stringify(A[k]);
    const b = JSON.stringify(B[k]);

    if (a !== b) {
      diffs[k] = { original: A[k], preCopied: B[k] };
    }
  }

  out("B1 experiment (a) — observable diff between ORIGINAL and PRE-COPIED container", {
    comparedObservables: cmpKeys.length,
    differing: Object.keys(diffs).length,
    diffs,
  });

  // B2 — backward visibility. Mutate the caller's original AFTER the door ran:
  // does core see it? Mutate what core handed back: does the original see it?
  {
    const r = mk();

    await r.start("/home");

    const api = getPluginApi(r);
    const orig: Bag = { id: "7" };
    const fw = api.forwardState("u", orig as never, { tab: "x" } as never);
    const st = await r.navigate("u", orig as never);

    orig.id = "MUTATED";

    const handed = fw.params as Bag;
    let wroteIntoHandout = "";

    try {
      handed.injected = "1";
      wroteIntoHandout = "ok";
    } catch (e) {
      wroteIntoHandout = errText(e);
    }

    out("B2 backward visibility", {
      "handout params === caller's bag (fast path)": handed === orig,
      "core state.params after mutating the original":
        (r.getState() as unknown as { params: Bag }).params.id,
      "state.params === caller's bag": (r.getState() as unknown as { params: Bag }).params === orig,
      "state.params frozen": Object.isFrozen((r.getState() as unknown as { params: Bag }).params),
      "write into the handed-out bag": wroteIntoHandout,
      "the original now carries the write": orig.injected,
      "navigate landed": st.path,
    });
    r.dispose();
  }
  (A._router as { dispose: () => void }).dispose();
  (B._router as { dispose: () => void }).dispose();
}

// ─── C — InterceptorFn·return: is the returned object read BACK by core? ─────
async function sectionC(): Promise<void> {
  // C1 — the interceptor returns its OWN bags. Identity out of the door, reads
  // core performs on them, and what lands in state.
  {
    const r = mk();
    const api = getPluginApi(r);
    const mineReads = countingBag<Bag>({ id: "7" });
    const mineSearchReads = countingBag<Bag>({ tab: "x" });
    let ran = 0;

    await r.start("/home");

    // ⚠ registered AFTER start(): start() runs the seam too (H1), and an
    // interceptor rewriting the target there lands `u` before the cell's own
    // navigate, which then answers SAME_STATES.
    api.addInterceptor("forwardState", ((next: never, n: never, p: never, s: never) => {
      ran += 1;
      (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s);

      return { name: "u", params: mineReads.bag, search: mineSearchReads.bag };
    }) as never);

    const before = { ...mineReads.reads };
    const o = api.forwardState("u", { id: "0" } as never, {} as never);
    const st = (await attempt(() =>
      r.navigate("u", { id: "0" } as never),
    )) as never as { params: Bag; path: string };

    out("C1 InterceptorFn<forwardState>·return", {
      interceptorRan: ran,
      "door result.params === the interceptor's object": (o.params as unknown) === mineReads.bag,
      "door result.search === the interceptor's object":
        (o.search as unknown) === mineSearchReads.bag,
      "reads core performed on the RETURNED params (cumulative)": { ...mineReads.reads },
      "reads before the door call": before,
      "state.params": { ...(st.params as unknown as Bag) },
      "state.params === the interceptor's object": (st.params as unknown) === mineReads.bag,
      "state.params frozen": Object.isFrozen(st.params),
      "interceptor's own object frozen": Object.isFrozen(mineReads.bag),
      "state.path": st.path,
    });
    r.dispose();
  }

  // C2 — control: NO interceptor. Same door, so the reads above are the chain's.
  {
    const r = mk();
    const api = getPluginApi(r);

    await r.start("/home");

    const cb = countingBag<Bag>({ id: "7" });
    const o = api.forwardState("u", cb.bag as never, {} as never);

    out("C2 control — no interceptor on the same door", {
      "result.params === caller's bag": (o.params as unknown) === cb.bag,
      reads: { ...cb.reads },
    });
    r.dispose();
  }

  // C3 — round-trip: mutate what the interceptor returned AFTER the door
  // answered. Does core's committed state move?
  {
    const r = mk();
    const api = getPluginApi(r);
    const mine: Bag = { id: "7" };

    await r.start("/home");

    api.addInterceptor("forwardState", ((next: never, n: never, p: never, s: never) => {
      (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s);

      return { name: "u", params: mine, search: {} };
    }) as never);

    const st = (await attempt(() =>
      r.navigate("u", { id: "0" } as never),
    )) as never as { params: Bag; path: string };

    mine.id = "AFTER";

    out("C3 round-trip on the interceptor's returned bag", {
      "state.params.id after mutating the returned bag":
        (r.getState() as unknown as { params: Bag }).params.id,
      "state.path": st.path,
      "state.params === the returned bag": (st.params as unknown) === mine,
    });
    r.dispose();
  }
}

// ─── D — InterceptorFn·next arguments (the plugin's own objects INTO core) ───
async function sectionD(): Promise<void> {
  for (const armedRoute of ["u", "d"]) {
    const r = mk();
    const api = getPluginApi(r);
    const mine = countingBag<Bag>({ id: "7", inj: "x" });
    const mineS = countingBag<Bag>({ tab: "q" });
    let callbackSaw: unknown;
    let ran = 0;

    await r.start("/home");

    api.addInterceptor("forwardState", ((next: never, n: never) => {
      ran += 1;

      return (next as unknown as (a: never, b: never, c: never) => unknown)(
        n,
        mine.bag as never,
        mineS.bag as never,
      );
    }) as never);

    const st = await attempt(() => r.navigate(armedRoute as never, { id: "0" } as never));

    out(`D1 InterceptorFn·next·routeParams|routeSearch, route "${armedRoute}"`, {
      interceptorRan: ran,
      callbackSaw,
      "reads on the interceptor's params (core + the forwardTo callback)": { ...mine.reads },
      // route "d" has a dynamic forwardTo that reads `id` exactly once; "u" has none.
      "reads CORE performed on `id`": (mine.reads.id ?? 0) - (armedRoute === "d" ? 1 : 0),
      "reads core performed on the interceptor's search": { ...mineS.reads },
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
      "state.params === the interceptor's object":
        typeof st === "string" ? st : (st as { params: unknown }).params === mine.bag,
      "the interceptor's object frozen by core": Object.isFrozen(mine.bag),
      "state.params frozen": typeof st === "string" ? st : Object.isFrozen((st as { params: Bag }).params),
    });
    r.dispose();
  }
}

// ─── P1 — one read per key, and the outcome from the FIRST read ─────────────
async function sectionP1(): Promise<void> {
  // P1a — the door's fast path with a DRIFTING bag: does anything move?
  {
    const r = mk();
    const api = getPluginApi(r);

    await r.start("/home");

    // Per-DOOR reads: a fresh drifting bag each time, so the count below is one
    // traversal of the seam, not a cumulative total.
    const d1 = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const o = api.forwardState("u", d1.bag as never, {} as never);
    const readsAfterForwardState = { ...d1.reads };
    const oId = (o.params as Bag).id;

    const d2 = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const href = r.buildPath("u", d2.bag as never);
    const readsAfterBuildPath = { ...d2.reads };

    const d3 = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const st = await r.navigate("u", d3.bag as never);
    const readsAfterNavigate = { ...d3.reads };

    out("P1a drifting caller bag through the seam (route u, bare), per door", {
      "PluginApi.forwardState — core reads": readsAfterForwardState,
      "PluginApi.forwardState result.params.id (the handout IS the bag; this read is the APP's)":
        oId,
      "buildPath — core reads": readsAfterBuildPath,
      href,
      "navigate — core reads": readsAfterNavigate,
      "state.params.id": (st.params as unknown as Bag).id,
      "state.path": st.path,
    });
    r.dispose();
  }

  // P1b — positive control: a STABLE counting bag on the same route.
  {
    const r = mk();
    const api = getPluginApi(r);

    await r.start("/home");

    const c = countingBag<Bag>({ id: "7" });

    api.forwardState("u", c.bag as never, {} as never);

    const href = r.buildPath("u", c.bag as never);
    const st = await r.navigate("u", c.bag as never);

    out("P1b control — stable bag, same route", {
      reads: { ...c.reads },
      href,
      "state.path": st.path,
    });
    r.dispose();
  }

  // P1c — the FORWARDING route (the merge branch reads the bag).
  {
    const r = mk();

    await r.start("/home");

    const d = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const st = await attempt(() => r.navigate("f", d.bag as never));

    out("P1c drifting bag on the forwarding route f (merge branch)", {
      reads: { ...d.reads },
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  // P1d — a DECLARED query name in the params bag, drifting: the seam guard
  // reads it AND `normalizeChannel` reads it. Route "q" declares `?tab`.
  {
    const r = mk();
    const api = getPluginApi(r);

    await r.start("/home");

    const d = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const o = await attempt(() => api.forwardState("q", d.bag as never, {} as never));

    out("P1d declared-query route q, drifting params", {
      reads: { ...d.reads },
      result: typeof o === "string" ? o : { params: { ...(o as { params: Bag }).params } },
    });
    r.dispose();
  }

  // P1e — the INTERCEPTOR's returned bag, drifting: core reads it at the seam
  // guard and again below.
  {
    const r = mk();
    const api = getPluginApi(r);
    const d = driftingBag<Bag>({ id: "7" }, { id: "8" });

    await r.start("/home");

    api.addInterceptor("forwardState", ((next: never, n: never, p: never, s: never) => {
      (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s);

      return { name: "u", params: d.bag, search: {} };
    }) as never);

    const st = await attempt(() => r.navigate("u", { id: "0" } as never));

    out("P1e drifting bag RETURNED by an interceptor", {
      reads: { ...d.reads },
      "state.params.id": typeof st === "string" ? st : (st as { params: Bag }).params.id,
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  // P1f — the returned bag carries a name the target route DECLARES with `?`
  // (route "q" declares `?tab`). The seam guard reads declared names by name,
  // and `normalizeChannel` reads them again on the way to state — the shape the
  // census recorded as `readsPerKey {tab:2}`.
  {
    const r = mk();
    const api = getPluginApi(r);
    const d = driftingBag<Bag>({ id: "7", tab: "A" }, { tab: "B" });

    await r.start("/home");

    api.addInterceptor("forwardState", ((next: never, n: never, p: never, s: never) => {
      (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s);

      return { name: "q", params: d.bag, search: {} };
    }) as never);

    const st = await attempt(() => r.navigate("q", { id: "0" } as never));

    out("P1f declared query name in the RETURNED params, drifting", {
      reads: { ...d.reads },
      outcome: typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  // P1g — control for P1f: the same shape, STABLE. Proves the input reached the
  // guard (it refuses) rather than the drift itself producing the refusal.
  {
    const r = mk();
    const api = getPluginApi(r);
    const c = countingBag<Bag>({ id: "7", tab: "A" });

    await r.start("/home");

    api.addInterceptor("forwardState", ((next: never, n: never, p: never, s: never) => {
      (next as unknown as (a: never, b: never, c: never) => unknown)(n, p, s);

      return { name: "q", params: c.bag, search: {} };
    }) as never);

    const st = await attempt(() => r.navigate("q", { id: "0" } as never));

    out("P1g control — stable bag with a declared query name in params", {
      reads: { ...c.reads },
      outcome: typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }
}

// ─── P2 — a lying Proxy: ownKeys omits the key, gOPD claims it is own ───────
async function sectionP2(): Promise<void> {
  const lying = (source: Bag, hidden: string): Bag =>
    new Proxy(source, {
      ownKeys: (t) => Reflect.ownKeys(t).filter((k) => k !== hidden),
      getOwnPropertyDescriptor: (t, k) =>
        k === hidden
          ? { value: (t as Bag)[k as string], enumerable: true, configurable: true, writable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
    });

  // P2a — through the FORWARDING route (the branch that enumerates).
  {
    const r = mk();

    await r.start("/home");

    const bag = lying({ id: "7", secret: "S" }, "secret");
    const st = await attempt(() => r.navigate("f", bag as never));

    out("P2a lying proxy on the forwarding route f (enumerating branch)", {
      "Object.keys sees": Object.keys(bag),
      "hasOwn says": Object.hasOwn(bag, "secret"),
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  // P2b — control: the same bag WITHOUT the lie.
  {
    const r = mk();

    await r.start("/home");

    const st = await attempt(() => r.navigate("f", { id: "7", secret: "S" } as never));

    out("P2b control — honest bag, same route", {
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
    });
    r.dispose();
  }

  // P2c — the plain route (pass-through) — where does the key show up?
  {
    const r = mk();

    await r.start("/home");

    const bag = lying({ id: "7", secret: "S" }, "secret");
    const st = await attempt(() => r.navigate("u", bag as never));

    out("P2c lying proxy on the pass-through route u", {
      "state.params": typeof st === "string" ? st : { ...(st as { params: Bag }).params },
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }
}

// ─── P3 — inherited accessor + own "__proto__" ──────────────────────────────
async function sectionP3(): Promise<void> {
  // P3a — an inherited SETTER named like a key core writes into its own target.
  {
    const hits: string[] = [];

    Object.defineProperty(Object.prototype, "z", {
      configurable: true,
      get(): unknown {
        hits.push("get");

        return "INHERITED";
      },
      set(): void {
        hits.push("set");
      },
    });

    try {
      const r = mk();

      await r.start("/home");

      // route `f` has defaultParams { z: "hop" } — core WRITES `z` into its own
      // merged container, so an inherited setter is in the line of fire.
      const st = await attempt(() => r.navigate("f", { id: "7" } as never));

      out("P3a inherited accessor named `z` on Object.prototype", {
        "setter fired": hits.includes("set"),
        hits: hits.length,
        "state.params.z": typeof st === "string" ? st : (st as { params: Bag }).params.z,
        "state.path": typeof st === "string" ? st : (st as { path: string }).path,
        "hasOwn z on state.params":
          typeof st === "string" ? st : Object.hasOwn((st as { params: Bag }).params, "z"),
      });
      r.dispose();
    } finally {
      delete (Object.prototype as unknown as Bag).z;
    }
  }

  // P3b — control: the same navigation with no accessor installed.
  {
    const r = mk();

    await r.start("/home");

    const st = await attempt(() => r.navigate("f", { id: "7" } as never));

    out("P3b control — no accessor", {
      "state.params.z": typeof st === "string" ? st : (st as { params: Bag }).params.z,
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }

  // P3c — an OWN "__proto__" key from JSON.parse, through the seam.
  {
    const r = mk();
    const api = getPluginApi(r);

    await r.start("/home");

    const poison = JSON.parse('{"id":"7","__proto__":{"pwned":1}}') as Bag;
    const o = api.forwardState("u", poison as never, {} as never);
    const merged = { ...(o.params as Bag) };
    const st = await attempt(() => r.navigate("u", poison as never));

    out("P3c own __proto__ through the seam", {
      "caller bag has own __proto__": Object.hasOwn(poison, "__proto__"),
      "door result === caller bag": (o.params as unknown) === poison,
      "door result has own __proto__": Object.hasOwn(o.params as Bag, "__proto__"),
      "merging the door's result swaps the prototype":
        (merged as unknown as { pwned?: number }).pwned === 1,
      "state.params has own __proto__":
        typeof st === "string" ? st : Object.hasOwn((st as { params: Bag }).params, "__proto__"),
      "spreading state.params swaps the prototype":
        typeof st === "string"
          ? st
          : ({ ...(st as { params: Bag }).params } as { pwned?: number }).pwned === 1,
      "state.path": typeof st === "string" ? st : (st as { path: string }).path,
    });
    r.dispose();
  }
}

// ─── P4 — freeze depth ──────────────────────────────────────────────────────
async function sectionP4(): Promise<void> {
  const r = mk();

  await r.start("/home");

  const nested = { deep: "L" };
  const bag: Bag = { id: "7", nested };
  const api = getPluginApi(r);
  const fw = api.forwardState("u", bag as never, {} as never);
  const st = await r.navigate("u", bag as never);
  const stp = st.params as unknown as Bag;

  out("P4 freeze depth", {
    "caller's container frozen": Object.isFrozen(bag),
    "caller's NESTED container frozen": Object.isFrozen(nested),
    "door handout frozen": Object.isFrozen(fw.params),
    "state.params frozen (core-minted level)": Object.isFrozen(stp),
    "state.params.nested === caller's nested": (stp.nested as unknown) === nested,
    "state.params.nested frozen": Object.isFrozen(stp.nested as object),
    "state.search frozen": Object.isFrozen(st.search),
  });
  r.dispose();
}

void (async () => {
  await sectionH();
  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  await sectionP1();
  await sectionP2();
  await sectionP3();
  await sectionP4();
})();
