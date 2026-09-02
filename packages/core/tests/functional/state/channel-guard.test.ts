import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params, Router, State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * The always-on channel guard (#1572), phase 0b-2 — positions P1 and P3.
 *
 * The predicate is one line: `params ∩ queryNames(name) ≠ ∅`. It is a DETECTOR,
 * never a normaliser — the key is not moved (moving it would be stage ②, which
 * the nav-pipeline design removes).
 *
 * The two positions cover DIFFERENT populations and, deliberately, react
 * differently for now:
 *
 * - **P1 — the caller's raw argument**, at the API boundary before interceptors.
 *   Catches the legacy single-bag caller. It currently `logger.warn`s and lets
 *   the call through unchanged: the form still WORKS today (channel separation
 *   moves the key one line later), it is pinned by a benchmark, a stress test, a
 *   property and INVARIANTS #2a, and turning it into a throw is a separate,
 *   deliberate break with its own test migration.
 * - **P3 — `navigateToState`**, on `state.params ∩ queryNames(state.name)`.
 *   This one REJECTS (mirroring the `ROUTE_NOT_FOUND` guard beside it), because
 *   there is no working form behind it: a hand-made State with the pre-M2
 *   layout commits silently corrupt — the key lands in `state.params` and never
 *   reaches the URL.
 *
 * ⚠ The three P1 positions are not equivalent. On `navigate` and
 * `buildNavigationState` the single-bag form still produces the RIGHT state
 * (the `forwardState` seam separates the channels downstream), so the warning
 * announces a contract. On a DIRECT `makeState` there is no seam upstream, so
 * the key stays in `params`, never reaches the URL, and the warning reports an
 * already-inconsistent state — measured below.
 */
let router: Router;
let api: PluginApi;
let warnSpy: ReturnType<typeof vi.spyOn>;

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "q", path: "/q?page&lang" },
  { name: "plain", path: "/plain/:id" },
  { name: "coll", path: "/coll/:id?id" },
];

/**
 * The rejection code, or `undefined` when the navigation settled. Written as a
 * code probe rather than `.not.toThrow()` so an UNRELATED rejection (a
 * SAME_STATES no-op on a repeated commit) cannot be mistaken for the guard.
 */
async function rejectionCode(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  return promise
    .then(() => undefined)
    .catch((error: unknown) => (error as RouterError | undefined)?.code);
}

describe("channel guard (#1572)", () => {
  beforeEach(async () => {
    router = createRouter(ROUTES);
    api = getPluginApi(router);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await router.start("/home");
  });

  afterEach(() => {
    warnSpy.mockRestore();
    router.stop();
  });

  describe("P3 — navigateToState rejects a mis-channelled State", () => {
    /**
     * The failure SHAPE follows the guard three lines above it in the same
     * method: an unknown route rejects the returned promise and emits
     * `TRANSITION_ERROR` rather than throwing synchronously. `navigateToState`
     * returns `Promise<State>`, and its URL-plugin callers invoke it from
     * popstate handlers — a sync throw there would be a new failure shape for
     * an existing method.
     */
    it("rejects a hand-made State carrying a declared query key in params", async () => {
      // The pre-M2 layout: `page` in `params`, absent from the URL. Committing
      // it makes `getState()` disagree with `state.path` — silent corruption,
      // which is exactly the criterion for a core guard.
      const handMade = {
        name: "q",
        params: { page: "OLD-LAYOUT" },
        search: {},
        path: "/q",
        context: {},
      } as unknown as State;

      const errors: RouterError[] = [];

      router.usePlugin(() => ({
        onTransitionError: (_toState, _fromState, error) => {
          errors.push(error);
        },
      }));

      await expect(api.navigateToState(handMade)).rejects.toThrow(RouterError);

      const rejection = await api
        .navigateToState(handMade)
        .then(() => undefined)
        .catch((error: unknown) => error as RouterError);

      expect(rejection?.code).toBe(errorCodes.WRONG_CHANNEL);
      // Actionable: names the offending key AND the channel it belongs in.
      expect(rejection?.message).toContain("page");
      expect(rejection?.message).toContain("search");
      // Observable to plugins, exactly like the ROUTE_NOT_FOUND sibling.
      expect(errors.at(-1)?.code).toBe(errorCodes.WRONG_CHANNEL);
    });

    it("passes a State produced by core itself — the guard costs nothing", async () => {
      // `matchPath` output is channel-correct by construction, so the predicate
      // is empty on every healthy restore flow (popstate / memory / hydration).
      const matched = api.matchPath("/q?page=2");

      expect(matched).toBeDefined();
      await expect(
        rejectionCode(api.navigateToState(matched!)),
      ).resolves.not.toBe(errorCodes.WRONG_CHANNEL);
    });

    it("passes an UNKNOWN_ROUTE state", async () => {
      const unknown = router.navigateToNotFound("/nope");

      await expect(
        rejectionCode(api.navigateToState(unknown)),
      ).resolves.not.toBe(errorCodes.WRONG_CHANNEL);
    });

    it("is `undefined`-blind — a removal marker is not a mis-channel", async () => {
      // `undefined` means absence on both sides (#1550/#1551); rejecting it
      // would break the documented persistent-key removal form.
      const withMarker = {
        name: "q",
        params: { page: undefined },
        search: {},
        path: "/q",
        context: {},
      } as unknown as State;

      await expect(
        rejectionCode(api.navigateToState(withMarker)),
      ).resolves.not.toBe(errorCodes.WRONG_CHANNEL);
    });

    it("leaves a colliding path slot alone (#843/#1549 carve-out)", async () => {
      // `/coll/:id?id` — the name occupies a path slot, so `getQueryParams`
      // excludes it and `params.id` is legitimately path-owned.
      const collision = {
        name: "coll",
        params: { id: "V" },
        search: {},
        path: "/coll/V",
        context: {},
      } as unknown as State;

      await expect(
        rejectionCode(api.navigateToState(collision)),
      ).resolves.not.toBe(errorCodes.WRONG_CHANNEL);
    });
  });

  describe("P1 — producers THROW on the raw argument", () => {
    // A `TypeError`, SYNCHRONOUS even on `navigate` (which otherwise reports
    // failure through a rejected promise): this is an argument-shape defect at
    // the API boundary, caught before any interceptor or transition exists —
    // the same class as the `subscribe` / `start` guards. Rejecting instead
    // would let a `.catch()` written for navigation failures swallow it.
    it("throws when navigate() receives a declared query key in params", () => {
      // `expect(fn).toThrow()` only passes on a SYNCHRONOUS throw — a rejected
      // promise would sail past it. That is the assertion carrying the "sync
      // even on navigate" contract: a `.catch()` written for transition
      // failures must not swallow a programming error.
      expect(() =>
        router.navigate("q", { page: "2" }, undefined, { reload: true }),
      ).toThrow(TypeError);

      expect(() =>
        router.navigate("q", { page: "2" }, undefined, { reload: true }),
      ).toThrow(/declares `page` as a query param/);
    });

    it("throws when makeState() receives one", () => {
      expect(() => api.makeState("q", { page: "2" })).toThrow(
        /declares `page` as a query param/,
      );
    });

    it("throws when buildNavigationState() receives one", () => {
      expect(() => api.buildNavigationState("q", { page: "2" })).toThrow(
        /declares `page` as a query param/,
      );
    });

    it("names the method it was called through", () => {
      // One message builder, one wording — but the caller still needs to know
      // WHICH door they came through.
      expect(() => api.makeState("q", { page: "2" })).toThrow(
        /\[router\.makeState\]/,
      );
      expect(() => api.buildNavigationState("q", { page: "2" })).toThrow(
        /\[router\.buildNavigationState\]/,
      );
    });

    it("stays silent when the query value arrives in the right channel", async () => {
      await router.navigate("q", {}, { page: "2" }, { reload: true });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("stays silent on a route that declares no query params", async () => {
      await router.navigate("plain", { id: "7" }, undefined, { reload: true });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("is `undefined`-blind — the removal marker does not warn", async () => {
      await router.navigate("q", { page: undefined }, undefined, {
        reload: true,
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("leaves a colliding path slot alone (#843/#1549 carve-out)", () => {
      api.makeState("coll", { id: "V" });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("never becomes the thing that throws when the bag is accessor-backed", async () => {
      // The guard reads the bag EARLIER than any consumer would. A bag backed
      // by a getter (a Proxy, a framework's reactive object, a plugin fixture)
      // whose read throws must still surface from the code that actually needed
      // the value — a diagnostic must not move the origin of an existing
      // failure. Found by `persistent-params`, whose suite pins exactly that.
      const bag: Params = {};

      Object.defineProperty(bag, "page", {
        enumerable: true,
        get() {
          throw new Error("read by the consumer, not by the guard");
        },
      });

      const failure = await router
        .navigate("q", bag, undefined, { reload: true })
        .then(() => undefined)
        .catch((error: unknown) => (error as Error).message);

      expect(failure).toBe("read by the consumer, not by the guard");
      // …and the guard stayed silent rather than reporting a key it could not read.
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("the verdict must cover the value that SHIPS (#1927)", () => {
    // The guard reads the caller's bag to decide; `normalizeChannel` reads the
    // same bag again to build what becomes `state.params`. Between the two the
    // object belongs to the application — a Proxy, a framework's reactive object,
    // a plain getter. A bag that answers `undefined` while the guard looks (the
    // documented removal marker, correctly waved through) and a value afterwards
    // lands a declared query name in the PATH channel.
    //
    // `normalizeChannel`'s own docblock forbids exactly this pair — "ONE read per
    // key, and the result is built from it. A test-then-re-read pair here would be
    // a TOCTOU on an object the caller owns" — and the query channel had it until
    // #1812. The pair here spans two functions, so neither could see it.
    const blindFor = (key: string, reads: number, rest: Params): Params => {
      const bag: Record<string, unknown> = { ...rest };
      let seen = 0;

      Object.defineProperty(bag, key, {
        enumerable: true,
        configurable: true,
        get: () => (++seen <= reads ? undefined : "SHIPPED"),
      });

      return bag as Params;
    };

    it("makeState refuses a bag that answers undefined only while the guard looks", () => {
      expect(() => api.makeState("q", blindFor("page", 1, {}))).toThrow(
        /declares `page` as a query param/,
      );
    });

    it("navigate refuses it too — the seam is one more read, not a second mechanism", async () => {
      await expect(
        router.navigate("q", blindFor("page", 2, {}), undefined, {
          reload: true,
        }),
      ).rejects.toThrow(/declares `page` as a query param/);
    });

    it("CONTROL — a stable bag with the same key is refused, as it always was", () => {
      expect(() => api.makeState("q", { page: "9" })).toThrow(
        /declares `page` as a query param/,
      );
    });

    it("CONTROL — an undefined value stays the removal marker, not a mis-channel", () => {
      const state = api.makeState("q", { page: undefined });

      expect(Object.hasOwn(state.params, "page")).toBe(false);
      expect(state.path).toBe("/q");
    });

    it("buildNavigationState refuses it too — the third door P1 guards", () => {
      expect(() =>
        // Blind for BOTH guard reads (P1 and the seam) — measured, this door
        // reads three times — so only the shipped-bag check can refuse it.
        api.buildNavigationState("q", blindFor("page", 2, {})),
      ).toThrow(/declares `page` as a query param/);
    });

    it("matchPath refuses a decoder whose bag drifts after the boundary check", () => {
      // The decoder boundary checks `decoded.params` and `canonicalize`
      // normalises it — the same two reads, one door further out. A decoder is
      // application code by contract, so its output is exactly the kind of bag
      // that can answer twice.
      let seen = 0;
      const drifting = createRouter([
        {
          name: "d",
          path: "/d?page",
          decodeParams: () => {
            const bag: Record<string, unknown> = {};

            Object.defineProperty(bag, "page", {
              enumerable: true,
              configurable: true,
              // Blind for BOTH checks the boundary makes — measured, the decoder
              // bag is read three times — so only the shipped-bag check refuses it.
              get: () => (++seen <= 2 ? undefined : "SHIPPED"),
            });

            return { params: bag as Params, search: {} };
          },
        },
      ]);

      expect(() => getPluginApi(drifting).matchPath("/d")).toThrow(
        /declares `page` as a query param/,
      );
    });

    it("CONTROL — with no query names the normaliser IS read #1, so nothing is doubled", () => {
      // The guard short-circuits on `queryNames.length === 0`, so it never reads
      // the bag. `normalizeChannel` then gets the FIRST answer — `undefined` —
      // and drops the key. That is the whole point: on a route with no `?`
      // declarations there is no second read to disagree with, today or after the
      // fix, and the added check costs a length test.
      // `/plain/:id` needs the slot, so losing it surfaces as the matcher's own
      // "missing required param" — which is precisely the evidence: the value the
      // normaliser saw was read #1's `undefined`.
      expect(() => api.makeState("plain", blindFor("id", 1, {}))).toThrow(
        /Missing required param 'id'/,
      );
    });
  });
});

/**
 * #1822 — `navigate(name, null)` is supported runtime input, pinned by
 * `navigation/navigate/edge-cases-params.test.ts` ("treats null params as empty
 * params and resolves"). The guard's early return tested `params === undefined`
 * only, so `Object.hasOwn(null, key)` did `ToObject` and threw.
 *
 * ⚑ The route decides, and it has nothing to do with the argument: the
 * `queryNames.length === 0` short-circuit shields every route without a `?`
 * declaration, so the same call is fine or fatal depending on whether some
 * OTHER part of the route's path happens to declare a query name.
 *
 * ⚠ Three separate contracts break on that one line, and only the first is a
 * message-quality complaint:
 *
 * 1. every door hands back a bare `TypeError` with no code and no route name;
 * 2. `canNavigateTo` THROWS — the predicate whose whole rule is "detecting on
 *    the render path is fine, throwing there is not" (`channels/CLAUDE.md`);
 * 3. `navigateToState` throws SYNCHRONOUSLY where its own comment promises a
 *    rejection, because URL plugins call it from popstate handlers.
 *
 * Measured: `Object.hasOwn` throws for `null` and `undefined` and for nothing
 * else — not `0`, `""`, `false`, `NaN`, a string, a symbol or a BigInt — so
 * `undefined` having been handled leaves exactly one hole.
 */
describe("the channel guard tolerates a null params bag (#1822)", () => {
  let nullRouter: Router;
  let nullApi: PluginApi;

  beforeEach(async () => {
    nullRouter = createRouter(ROUTES);
    nullApi = getPluginApi(nullRouter);
    await nullRouter.start("/home");
  });

  afterEach(() => {
    nullRouter.stop();
  });

  /**
   * Every door that consults the guard, as a comparison rather than an expected
   * value: `null` must be indistinguishable from `undefined`, which is what
   * "treats null params as empty params" means. Stated this way the cell also
   * survives any future decision about what the empty answer IS.
   */
  const DOORS: {
    readonly name: string;
    readonly call: (params: Params | null | undefined) => unknown;
  }[] = [
    {
      name: "makeState",
      call: (params) => nullApi.makeState("q", params!).path,
    },
    {
      name: "buildNavigationState",
      call: (params) => nullApi.buildNavigationState("q", params!)?.path,
    },
    {
      name: "forwardState",
      call: (params) => nullApi.forwardState("q", params!).name,
    },
    {
      name: "canNavigateTo",
      call: (params) => nullRouter.canNavigateTo("q", params!),
    },
  ];

  // The count, outside the `each`: a table that shrinks to nothing registers no
  // cells and still exits green (`table-vacuity-authority`). Six doors consult
  // the guard; the two not listed here — `navigate` and `navigateToState` —
  // have their own cells below because their contract is a settlement, not a
  // return value.
  it("drives every door that returns its answer synchronously", () => {
    expect(DOORS).toHaveLength(4);
  });

  it.each(DOORS)(
    "$name answers the same for null as for undefined on a query-declaring route",
    ({ call }) => {
      expect(call(null)).toStrictEqual(call(undefined));
    },
  );

  it("navigate resolves with null params on a query-declaring route", async () => {
    // The control lives one route over: `plain` declares no `?` name, so its
    // `queryNames.length === 0` short-circuit shielded it all along — that
    // asymmetry is the defect, not the null itself.
    const withNull = await nullRouter.navigate("q", null as unknown as Params);

    expect(withNull.path).toBe("/q");
  });

  it("canNavigateTo ANSWERS rather than throwing — it runs on the render path", () => {
    // `channels/CLAUDE.md`: "Detecting on the render path is fine; throwing
    // there is not." The mis-channelled bag one line below is the control: the
    // predicate is expected to say `false`, never to throw, and `null` must not
    // be the input that changes that.
    expect(nullRouter.canNavigateTo("q", null as unknown as Params)).toBe(true);
    expect(nullRouter.canNavigateTo("q", { page: 1 })).toBe(false);
  });

  it("navigateToState REJECTS rather than throwing synchronously", async () => {
    const handMade = {
      name: "q",
      params: null,
      search: {},
      path: "/q",
      context: {},
    } as unknown as State;

    // ⚑ The SHAPE, and deliberately not the outcome. A synchronous throw is a
    // new failure shape for a method URL plugins call from popstate handlers,
    // and that is this issue's criterion (b) — the guard must not be the thing
    // that turns a settled promise into a sync crash.
    //
    // ⚠ Whether a `State` carrying `params: null` should then RESOLVE is a
    // different question and is left open here. The pinned support is for
    // `navigate(name, null)` — the polymorphic ARGUMENT slot — and nothing
    // declares `null` an accepted `State` channel. Measured after this fix:
    // it rejects, from `adoptForeignBag`, which tests `=== undefined` the same
    // way this guard did. Tracked separately rather than widened here.
    let settled: Promise<unknown> | undefined;

    expect(() => {
      settled = nullApi.navigateToState(handMade);
    }).not.toThrow();

    await Promise.allSettled([settled]);
  });

  it("a forwardState interceptor returning null params does not kill start()", async () => {
    const seamRouter = createRouter(ROUTES);
    const seamApi = getPluginApi(seamRouter);

    seamApi.addInterceptor("forwardState", () => ({
      name: "q",
      params: null as unknown as Params,
      search: {},
    }));

    await expect(seamRouter.start("/home")).resolves.toBeDefined();

    seamRouter.stop();
  });
});
