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
});
