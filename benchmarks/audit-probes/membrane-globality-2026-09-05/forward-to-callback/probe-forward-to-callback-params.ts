// Family: ForwardToCallback·params — the bag core hands a route's DYNAMIC
// `forwardTo` callback (`types/router.ts · ForwardToCallback(getDependency,
// params)`), invoked from `RoutesNamespace.ts · #resolveDynamicForward`
// (`startFn(this.#deps.getDependency, params)` and `fn(...)` per hop), after
// which `#layerChainDefaults` reads the SAME `params` (`mergeDefined` +
// `normalizeChannel`). One section per entry door that reaches that call.
//
// Every cell carries (a) a proof the callback RAN (call counter delta), (b) a
// positive control through the same code (a STATIC hop — no callback), and (c)
// the mechanism: identity of the bag inside the callback vs the caller's object,
// reads per key on the caller's bag, and whether a write made INSIDE the
// callback rides into the published `state.params`.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/forward-to-callback/probe-forward-to-callback-params.ts
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;
type AnyRouter = ReturnType<typeof createRouter>;

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

// ─────────────────────────────────────────────────────────────────────────────
// Fixture. `seen` is reset per cell; the callbacks below write into it.
// ─────────────────────────────────────────────────────────────────────────────
interface Seen {
  calls: number;
  argc: number;
  third: unknown;
  getDependencyType: string;
  bag: unknown;
  m2SawH1: boolean | undefined;
  m2Bag: unknown;
  decBag: unknown;
  guardSawFwd: unknown;
  guardSawParams: unknown;
}

const fresh = (): Seen => ({
  calls: 0,
  argc: 0,
  third: undefined,
  getDependencyType: "",
  bag: undefined,
  m2SawH1: undefined,
  m2Bag: undefined,
  decBag: undefined,
  guardSawFwd: undefined,
  guardSawParams: undefined,
});

let seen: Seen = fresh();
let decoderBag: Bag | undefined;
const hopDefaults: Bag = { z: "1" };
const originalForwardTo = function (
  this: unknown,
  getDependency: unknown,
  params: Bag,
): string {
  // eslint-disable-next-line prefer-rest-params -- arity is the question
  seen.argc = arguments.length;
  // eslint-disable-next-line prefer-rest-params
  seen.third = arguments[2];
  seen.calls += 1;
  seen.getDependencyType = typeof getDependency;
  seen.bag = params;
  // ONE app-side read of `id`, so core's own reads are `reads.id - 1`.
  void params.id;
  params.__fwd__ = "1";

  return "b";
};

const ROUTES = (): unknown[] => [
  { name: "home", path: "/home" },
  { name: "a", path: "/a/:id", forwardTo: originalForwardTo },
  {
    name: "b",
    path: "/b/:id",
    canActivate: () => (toState: { params: Bag }) => {
      seen.guardSawFwd = toState.params.__fwd__;
      seen.guardSawParams = toState.params;

      return true;
    },
  },
  // CONTROL: a static hop, no callback — the same seam, no app code inside.
  { name: "s", path: "/s/:id", forwardTo: "b" },
  { name: "c", path: "/c/:id" },
  // DRIFT: the target is decided on the callback's read of `id`.
  {
    name: "d",
    path: "/d/:id",
    forwardTo: (_g: unknown, p: Bag) => {
      seen.calls += 1;

      return p.id === "7" ? "b" : "c";
    },
  },
  // TWO dynamic hops: hop 1 writes, hop 2 reads.
  {
    name: "m1",
    path: "/m1/:id",
    forwardTo: (_g: unknown, p: Bag) => {
      seen.calls += 1;
      p.h1 = "1";

      return "m2";
    },
  },
  {
    name: "m2",
    path: "/m2/:id",
    forwardTo: (_g: unknown, p: Bag) => {
      seen.calls += 1;
      seen.m2SawH1 = p.h1 === "1";
      seen.m2Bag = p;

      return "b";
    },
  },
  // URL direction: the decoder RETURNS an app-built bag; does the callback get it?
  {
    name: "dec",
    path: "/dec/:id",
    decodeParams: ({ params, search }: { params: Bag; search: Bag }) => {
      decoderBag = { ...params };

      return { params: decoderBag, search };
    },
    forwardTo: (_g: unknown, p: Bag) => {
      seen.calls += 1;
      seen.decBag = p;
      p.__fwd__ = "1";

      return "b";
    },
  },
  // A hop WITH defaults: `mergeDefined` allocates, so the caller's bag stops
  // flowing after the callback — the other arm of `#layerChainDefaults`.
  {
    name: "hop",
    path: "/hop/:id",
    defaultParams: hopDefaults,
    forwardTo: (_g: unknown, p: Bag) => {
      seen.calls += 1;
      seen.bag = p;
      void p.id;
      p.__fwd__ = "1";
      // The callback mutates ITS OWN route's default bag — is the default read
      // before or after the callback?
      hopDefaults.z = "after-callback";

      return "b";
    },
  },
];

const mk = (options?: Bag): AnyRouter =>
  createRouter(ROUTES() as never, (options ?? {}) as never);

const passThrough = (router: AnyRouter): void => {
  getPluginApi(router).addInterceptor("forwardState", (next, n, p, s) =>
    next(n, p, s),
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section A — tool control: the callback runs, the static control does not,
// and the callback's declared arity is what the source says (2 args).
// ─────────────────────────────────────────────────────────────────────────────
async function sectionA(): Promise<void> {
  const router = mk();

  await router.start("/home");
  seen = fresh();

  const callerBag: Bag = { id: "7" };
  const state = await router.navigate("a", callerBag as never);

  out("A1 tool control — the callback runs on navigate", {
    calls: seen.calls,
    argc: seen.argc,
    thirdArgument: seen.third,
    getDependencyType: seen.getDependencyType,
    committedName: state.name,
    "ForwardToCallback·getDependency is core's function, not an app object":
      seen.getDependencyType === "function",
  });

  seen = fresh();

  const staticState = await router.navigate("s", { id: "8" } as never);

  out("A2 control — a STATIC hop runs no callback through the same seam", {
    calls: seen.calls,
    committedName: staticState.name,
    landedParams: staticState.params,
  });

  // The stored leaf: `routesStore.ts · registerForwardTo` keeps the function
  // by reference (`config.forwardFnMap[fullName] = route.forwardTo!`).
  const stored = getRoutesApi(router).get("a") as { forwardTo?: unknown };

  out("A3 leaf — Route.forwardTo is held by reference (function leaf)", {
    "get('a').forwardTo === originalForwardTo":
      stored.forwardTo === originalForwardTo,
    "get('hop').defaultParams === hopDefaults (caller's bag held, known door)":
      (getRoutesApi(router).get("hop") as { defaultParams?: unknown })
        .defaultParams === hopDefaults,
  });

  router.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — the door at every entry point, bare and with a pass-through
// interceptor on the seam (#1849 snapshot).
// ─────────────────────────────────────────────────────────────────────────────
interface Cell {
  calls: number;
  bagIsCallersObject: boolean;
  readsOnCallerBag: Record<string, number>;
  coreReadsOfId: number;
  callerBagMutated: boolean;
  landed: unknown;
  frozenCallerBagAfter: boolean;
}

const cell = (
  callerBag: Bag,
  reads: Readonly<Record<string, number>>,
  landed: unknown,
): Cell => ({
  calls: seen.calls,
  bagIsCallersObject: seen.bag === callerBag,
  readsOnCallerBag: { ...reads },
  // The callback reads `id` exactly once; everything else is core's.
  coreReadsOfId: (reads.id ?? 0) - 1,
  callerBagMutated: callerBag.__fwd__ === "1",
  landed,
  frozenCallerBagAfter: Object.isFrozen(callerBag),
});

async function sectionB(): Promise<void> {
  for (const armed of [false, true]) {
    const tag = armed ? "interceptor on the seam" : "bare";

    // B1 — Router.navigate (positional)
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      await router.start("/home");
      seen = fresh();

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const state = await router.navigate("a", bag as never);

      out(`B1 Router.navigate·routeParams (${tag})`, {
        ...cell(bag, reads, {
          name: state.name,
          "state.params.__fwd__": state.params.__fwd__,
          "guard saw __fwd__ on toState": seen.guardSawFwd,
          "state.params === guard's toState.params":
            state.params === seen.guardSawParams,
          "state.params === callerBag": state.params === (bag as never),
        }),
      });
      router.dispose();
    }

    // B2 — Router.navigate (descriptor form)
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      await router.start("/home");
      seen = fresh();

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const state = await router.navigate({ name: "a", params: bag } as never);

      out(`B2 Router.navigate·target.params (${tag})`, {
        ...cell(bag, reads, {
          name: state.name,
          "state.params.__fwd__": state.params.__fwd__,
        }),
      });
      router.dispose();
    }

    // B3 — Router.canNavigateTo
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      await router.start("/home");
      seen = fresh();

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const answer = router.canNavigateTo("a", bag as never);

      out(`B3 Router.canNavigateTo·params (${tag})`, {
        ...cell(bag, reads, {
          answer,
          "guard saw __fwd__ on toState": seen.guardSawFwd,
        }),
      });
      router.dispose();
    }

    // B4 — Router.isActiveRoute (second arm: the NAMESPACE primitive, no seam)
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      // ON the forward target, or the predicate never reaches the arm.
      await router.start("/b/7");
      seen = fresh();

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const answer = router.isActiveRoute("a", bag as never);

      out(`B4 Router.isActiveRoute·params (${tag})`, {
        ...cell(bag, reads, { answer }),
      });
      router.dispose();
    }

    // B5 — PluginApi.forwardState
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      seen = fresh();

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const result = getPluginApi(router).forwardState("a", bag as never);

      out(`B5 PluginApi.forwardState·routeParams (${tag})`, {
        ...cell(bag, reads, {
          name: result.name,
          "result.params.__fwd__": result.params.__fwd__,
          "result.params === callerBag": result.params === (bag as never),
          resultParamsFrozen: Object.isFrozen(result.params),
        }),
      });
      router.dispose();
    }

    // B6 — RouterInternals.forwardState and port().resolveForward (same closure?)
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      const ctx = getInternals(router);

      seen = fresh();

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const result = ctx.forwardState("a", bag as never);
      const viaInternals = cell(bag, reads, {
        name: result.name,
        "result.params.__fwd__": (result.params as Bag).__fwd__,
      });

      seen = fresh();

      const port = ctx.port();
      const bag2 = countingBag<Bag>({ id: "7", x: "1" });
      const r2 = port.resolveForward("a", bag2.bag as never);
      const viaPort = cell(bag2.bag, bag2.reads, {
        name: r2.name,
        "result.params.__fwd__": (r2.params as Bag).__fwd__,
      });

      out(`B6 RouterInternals.forwardState·routeParams (${tag})`, viaInternals);
      out(`B6b RouterInternals.port().resolveForward·params (${tag})`, viaPort);
      router.dispose();
    }

    // B7 — PluginApi.buildNavigationState
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      seen = fresh();

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const state = getPluginApi(router).buildNavigationState("a", bag as never);

      out(`B7 PluginApi.buildNavigationState·params (${tag})`, {
        ...cell(bag, reads, {
          name: state?.name,
          "state.params.__fwd__": state?.params.__fwd__,
        }),
      });
      router.dispose();
    }

    // B8 — matchPath: the matcher's bag (core-built) and the decoder's return
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      seen = fresh();

      const plain = getPluginApi(router).matchPath("/a/7");
      const plainCalls = seen.calls;
      const plainBag = seen.bag as Bag;

      seen = fresh();
      decoderBag = undefined;

      const viaDecoder = getPluginApi(router).matchPath("/dec/7");

      out(`B8 PluginApi.matchPath → callback (${tag})`, {
        matcherBuilt: {
          calls: plainCalls,
          name: plain?.name,
          "state.params.__fwd__": plain?.params.__fwd__,
          bagInCallbackFrozen: Object.isFrozen(plainBag),
          bagInCallbackProto:
            Object.getPrototypeOf(plainBag) === null
              ? "null"
              : "Object.prototype",
        },
        decoderReturn: {
          calls: seen.calls,
          name: viaDecoder?.name,
          "callback bag === decodeParams' returned params":
            seen.decBag === decoderBag,
          "decoder's bag mutated by the callback": decoderBag?.__fwd__ === "1",
          "state.params.__fwd__": viaDecoder?.params.__fwd__,
        },
      });

      seen = fresh();

      const ctx = getInternals(router);
      const viaInternals = ctx.matchPath("/dec/7", ctx.getOptions());

      out(`B8b RouterInternals.matchPath → callback (${tag})`, {
        calls: seen.calls,
        "callback bag === decodeParams' returned params":
          seen.decBag === decoderBag,
        "state.params.__fwd__": viaInternals?.params.__fwd__,
      });
      router.dispose();
    }

    // B9 — navigateToDefault: Options.defaultParams callback's return → the bag
    {
      const defaultBag: Bag = { id: "7", x: "1" };
      const router = mk({
        defaultRoute: "a",
        defaultParams: () => defaultBag,
      });

      if (armed) {
        passThrough(router);
      }

      await router.start("/home");
      seen = fresh();

      const state = await router.navigateToDefault();

      out(`B9 Options.defaultParams·callbackReturn → callback (${tag})`, {
        calls: seen.calls,
        "callback bag === the bag the option callback returned":
          seen.bag === defaultBag,
        "option's bag mutated by the forwardTo callback":
          defaultBag.__fwd__ === "1",
        name: state.name,
        "state.params.__fwd__": state.params.__fwd__,
      });
      router.dispose();
    }

    // B10 — a hop WITH defaults: the merge allocates after the callback
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      await router.start("/home");
      seen = fresh();
      hopDefaults.z = "1";

      const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
      const state = await router.navigate("hop", bag as never);

      out(`B10 Router.navigate·routeParams, hop WITH defaults (${tag})`, {
        ...cell(bag, reads, {
          name: state.name,
          "state.params.__fwd__": state.params.__fwd__,
          "state.params.z (default read AFTER the callback?)": state.params.z,
        }),
      });
      router.dispose();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section C — the #1849 class one hop deeper: the callback decides on read 1,
// core ships read 2. A drifting bag makes the split observable.
// ─────────────────────────────────────────────────────────────────────────────
async function sectionC(): Promise<void> {
  for (const armed of [false, true]) {
    const tag = armed ? "interceptor on the seam" : "bare";
    const router = mk();

    if (armed) {
      passThrough(router);
    }

    await router.start("/home");
    seen = fresh();

    const { bag, reads } = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const state = await router.navigate("d", bag as never);

    out(`C1 navigate("d", drifting id 7→8) (${tag})`, {
      calls: seen.calls,
      readsOnCallerBag: { ...reads },
      "target chosen by the callback (7 → b, 8 → c)": state.name,
      "state.params.id shipped": state.params.id,
      "state.path": state.path,
      "the callback's decision and the shipped params disagree":
        state.name === "b" && state.params.id === "8",
    });

    // The predicate on the render path: neither consistent value answers
    // `true`, the drifting one does.
    const r2 = mk();

    if (armed) {
      passThrough(r2);
    }

    await r2.start("/b/8");

    const consistent7 = r2.isActiveRoute("d", { id: "7" } as never);
    const consistent8 = r2.isActiveRoute("d", { id: "8" } as never);
    const drifting = driftingBag<Bag>({ id: "7" }, { id: "8" });
    const withDrift = r2.isActiveRoute("d", drifting.bag as never);

    out(`C2 isActiveRoute("d", …) on /b/8 (${tag})`, {
      consistent7,
      consistent8,
      withDrift,
      readsOnDriftingBag: { ...drifting.reads },
      "true where no consistent bag is true": withDrift && !consistent7 && !consistent8,
    });

    router.dispose();
    r2.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section D — semantics a boundary copy could break, exercised in BOTH
// configurations (bare = handle held; armed = the seam's snapshot copy IS the
// (a) configuration).
// ─────────────────────────────────────────────────────────────────────────────
async function sectionD(): Promise<void> {
  for (const armed of [false, true]) {
    const tag = armed ? "interceptor on the seam" : "bare";

    // D1 — hop-to-hop visibility of a write (m1 writes, m2 reads)
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      await router.start("/home");
      seen = fresh();

      const callerBag: Bag = { id: "7" };
      const state = await router.navigate("m1", callerBag as never);

      out(`D1 two dynamic hops, hop1 writes h1, hop2 reads it (${tag})`, {
        calls: seen.calls,
        hop2SawHop1Write: seen.m2SawH1,
        "hop2's bag === caller's bag": seen.m2Bag === callerBag,
        "caller's bag carries h1": callerBag.h1 === "1",
        name: state.name,
        "state.params.h1": state.params.h1,
      });
      router.dispose();
    }

    // D2 — a FROZEN caller bag: the callback's write throws under strict mode
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      await router.start("/home");
      seen = fresh();

      const frozen = Object.freeze({ id: "7" }) as Bag;
      const outcome = await attempt(async () => {
        const s = await router.navigate("a", frozen as never);

        return { name: s.name, "state.params.__fwd__": s.params.__fwd__ };
      });

      out(`D2 frozen caller bag, callback writes (${tag})`, {
        calls: seen.calls,
        "bag in callback is the frozen object": seen.bag === frozen,
        outcome,
      });
      router.dispose();
    }

    // D3 — a Proxy caller bag counting SET traps: does core's sequence let the
    // callback write into the caller's object on the render path?
    {
      const router = mk();

      if (armed) {
        passThrough(router);
      }

      await router.start("/b/7");
      seen = fresh();

      const sets: string[] = [];
      const target: Bag = { id: "7" };
      const proxied = new Proxy(target, {
        set(t, key, value, receiver): boolean {
          sets.push(String(key));

          return Reflect.set(t, key, value, receiver);
        },
      });
      const answer = router.isActiveRoute("a", proxied as never);

      out(`D3 isActiveRoute with a set-trapping Proxy bag (${tag})`, {
        calls: seen.calls,
        answer,
        setTrapsOnCallerBag: sets,
        "caller's target mutated": target.__fwd__ === "1",
      });
      router.dispose();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section E — the interceptor's OWN object handed to `next(...)`: the terminal
// receives it by reference (`internals.ts · executeInterceptorChain` passes
// `nextArgs` straight through; `prepareArgs` shapes only the FIRST hop's args).
// ─────────────────────────────────────────────────────────────────────────────
async function sectionE(): Promise<void> {
  const router = mk();
  let mine: Bag | undefined;
  let mineSearch: Bag | undefined;
  let mineReads: Readonly<Record<string, number>> = {};
  let mineSearchReads: Readonly<Record<string, number>> = {};

  getPluginApi(router).addInterceptor("forwardState", (next, n, p, s) => {
    // The interceptor's OWN objects, accessor-backed so the terminal's reads
    // on them are countable (the callback reads `id` once itself).
    const counted = countingBag<Bag>({ ...(p as Bag), inj: "x" });
    const countedSearch = countingBag<Bag>({ ...(s as Bag | undefined), q: "1" });

    mine = counted.bag;
    mineReads = counted.reads;
    mineSearch = countedSearch.bag;
    mineSearchReads = countedSearch.reads;

    return next(n, mine as never, mineSearch as never);
  });

  await router.start("/home");
  seen = fresh();

  const callerBag: Bag = { id: "7" };
  const state = await router.navigate("a", callerBag as never);

  out("E1 InterceptorFn<forwardState>·next·routeParams|routeSearch", {
    calls: seen.calls,
    "callback bag === the interceptor's own object": seen.bag === mine,
    "interceptor's object mutated by the callback": mine?.__fwd__ === "1",
    "caller's bag untouched": callerBag.__fwd__ === undefined,
    readsOnInterceptorParams: { ...mineReads },
    "core reads of id (callback read it once)": (mineReads.id ?? 0) - 1,
    readsOnInterceptorSearch: { ...mineSearchReads },
    name: state.name,
    "state.params": state.params,
    "state.search": state.search,
    "state.params === interceptor's object": state.params === (mine as never),
    "state.search === interceptor's search object":
      state.search === (mineSearch as never),
    frozen: {
      "state.params": Object.isFrozen(state.params),
      "state.search": Object.isFrozen(state.search),
      "interceptor's params object": Object.isFrozen(mine),
      "interceptor's search object": Object.isFrozen(mineSearch),
    },
  });
  router.dispose();

  // E2 — the same door on the STATIC hop (control: no callback, the terminal
  // reads the interceptor's object once per key and copies it out).
  {
    const r2 = mk();
    let staticMine: Bag | undefined;
    let staticReads: Readonly<Record<string, number>> = {};

    getPluginApi(r2).addInterceptor("forwardState", (next, n, p, s) => {
      const counted = countingBag<Bag>({ ...(p as Bag), inj: "x" });

      staticMine = counted.bag;
      staticReads = counted.reads;

      return next(n, staticMine as never, s);
    });

    await r2.start("/home");
    seen = fresh();

    const st = await r2.navigate("s", { id: "7" } as never);

    out("E2 control — next(...) on a STATIC hop (no callback)", {
      calls: seen.calls,
      readsOnInterceptorParams: { ...staticReads },
      name: st.name,
      "state.params": st.params,
      "state.params === interceptor's object": st.params === (staticMine as never),
      "interceptor's object frozen by core": Object.isFrozen(staticMine),
    });
    r2.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section F — non-doors of the family, each with its evidence cell.
// ─────────────────────────────────────────────────────────────────────────────
async function sectionF(): Promise<void> {
  // F1 — buildPath: the literal terminal resolves no forwardTo → callback never runs
  {
    const router = mk();

    seen = fresh();

    const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
    const href = router.buildPath("a", bag as never);
    const bareCalls = seen.calls;

    passThrough(router);
    seen = fresh();

    const href2 = router.buildPath("a", bag as never);

    out("F1 Router.buildPath·params — callback NOT invoked", {
      bare: { calls: bareCalls, href },
      armed: { calls: seen.calls, href: href2 },
      readsOnCallerBag: { ...reads },
      callerBagMutated: bag.__fwd__ === "1",
    });
    router.dispose();
  }

  // F2 — makeState (both doors): resolveForward:false → callback never runs
  {
    const router = mk();
    const ctx = getInternals(router);

    seen = fresh();

    const { bag, reads } = countingBag<Bag>({ id: "7", x: "1" });
    const s1 = getPluginApi(router).makeState("a", bag as never, {} as never, "/a/7");
    const s2 = ctx.makeState("a", bag as never, {} as never, "/a/7");

    out("F2 PluginApi.makeState / RouterInternals.makeState — callback NOT invoked", {
      calls: seen.calls,
      names: [s1.name, s2.name],
      readsOnCallerBag: { ...reads },
      callerBagMutated: bag.__fwd__ === "1",
    });
    router.dispose();
  }

  // F3 — the callback's RETURN is a primitive by contract: a String object is refused
  {
    const router = createRouter(
      [
        { name: "home", path: "/home" },
        {
          name: "w",
          path: "/w",
          forwardTo: () => new String("home") as unknown as string,
        },
      ] as never,
      {} as never,
    );

    await router.start("/home");

    const outcome = await attempt(() => router.navigate("w"));

    out("F3 ForwardToCallback·return — String OBJECT refused", { outcome });
    router.dispose();
  }

  // F4 — positive control for F1/F2 on the SAME router shape: navigate runs it
  {
    const router = mk();

    await router.start("/home");
    seen = fresh();
    await router.navigate("a", { id: "7" } as never);

    out("F4 positive control — navigate on the same fixture runs the callback", {
      calls: seen.calls,
    });
    router.dispose();
  }
}

async function main(): Promise<void> {
  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  await sectionE();
  await sectionF();
}

void main();
