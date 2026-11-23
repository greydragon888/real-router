import { beforeEach, describe, expect, it } from "vitest";

import { createRouter, errorCodes, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core/types";

/**
 * The guards moved onto the `RouterInternals` adapters (#2259).
 *
 * `getInternals` ships from `@real-router/core/validation`, so a door reachable
 * both ways refuses the same values from either side. These cells assert the
 * INTERNAL side; `@real-router/validation-plugin`'s parity ledger asserts that
 * the two sides agree.
 *
 * ⚠ **`forwardState` is absent on purpose.** Its guards stay on the facade
 * because core reaches that seam itself — `matchPath` resolves a forward through
 * it — and `routes/matchPath.test.ts` pins the internal intermediate as
 * deliberately not validated.
 */
let router: Router;

describe("the internals adapters run the guards (#2259)", () => {
  beforeEach(async () => {
    router = createRouter([
      { name: "u", path: "/u/:id?q" },
      { name: "p", path: "/p" },
    ]);
    await router.start("/p");
  });

  describe("always-on, with no plugin installed", () => {
    it("addEventListener refuses an event name the router does not emit", () => {
      expect(() =>
        getInternals(router).addEventListener(
          "nope" as never,
          (() => undefined) as never,
        ),
      ).toThrow(TypeError);
    });

    it("addEventListener refuses a listener that is not a function", () => {
      // ⚠ A VALID event name, deliberately: with an invalid one the name guard
      // throws first and this cell passes without ever reaching the listener
      // check. Measured — it did, until the constant replaced a guessed string.
      expect(() =>
        getInternals(router).addEventListener(
          events.TRANSITION_SUCCESS,
          42 as never,
        ),
      ).toThrow(TypeError);
    });

    it("navigateToNotFound refuses a path that is not a string", () => {
      // ⚠ The MESSAGE, not just the throw: emptying it survived mutation while
      // a bare `toThrow(TypeError)` stayed green, and the message is what names
      // the door for a plugin author reading a stack.
      expect(() =>
        getInternals(router).navigateToNotFound(42 as never),
      ).toThrow(/\[router\.navigateToNotFound\] path must be a string/);
    });

    it("navigateToNotFound accepts the OMITTED argument, as its facade does", () => {
      // ⚠ The discriminator for the cell above: a stricter test would refuse
      // this, which is a divergence in the other direction rather than parity.
      expect(() =>
        getInternals(router).navigateToNotFound(undefined as never),
      ).not.toThrow();
    });

    it("makeState reads the caller's bag ONCE, so a drifting slot cannot hide", () => {
      // ⚠ Not the mis-channelled shape: the primitive refuses that one itself,
      // so a cell built on it passes with the adapter's guard removed and pins
      // nothing. This is the shape the move actually closed (#2249) — a slot
      // that answers `undefined` first and a declared query name second.
      let reads = 0;
      const drifting = {
        id: "7",
        get q() {
          reads += 1;

          return reads >= 2 ? "LATE" : undefined;
        },
      };

      expect(() =>
        getInternals(router).makeState(
          "u",
          drifting as never,
          {} as never,
          "/u/7",
        ),
      ).toThrow(TypeError);
    });

    it("navigateToState refuses a disposed router before touching the state", () => {
      const ctx = getInternals(router);
      const state = ctx.makeState("u", { id: "7" }, {}, "/u/7");

      router.dispose();

      // ⚠ THROWS rather than rejecting: the guard stands above the promise, so
      // this door's disposed failure has a different shape from its others.
      expect(() => ctx.navigateToState(state)).toThrow(
        expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }),
      );
    });
  });

  describe("on the check channel, through the internal door (#2388)", () => {
    it("setRootPath asks its entry position", () => {
      const seen: unknown[][] = [];

      getPluginApi(router).addCheck("setRootPath:entry", (...args) => {
        seen.push(args);
      });

      getInternals(router).setRootPath("/base");

      expect(seen).toStrictEqual([["/base"]]);
    });

    it("navigateToState asks its entry position, with the options as the caller passed them", async () => {
      const seen: unknown[][] = [];
      const ctx = getInternals(router);
      const state = ctx.makeState("u", { id: "7" }, {}, "/u/7");

      getPluginApi(router).addCheck("navigateToState:entry", (...args) => {
        seen.push(args);
      });

      await ctx.navigateToState(state, { reload: true }).catch(() => undefined);
      await ctx.navigateToState(state).catch(() => undefined);

      expect(seen).toStrictEqual([
        [state, { reload: true }],
        [state, undefined],
      ]);
    });

    it("matchPath asks its entry position", () => {
      const seen: unknown[][] = [];
      const ctx = getInternals(router);

      getPluginApi(router).addCheck("matchPath:entry", (...args) => {
        seen.push(args);
      });

      ctx.matchPath("/p", ctx.getOptions());

      expect(seen).toStrictEqual([["/p"]]);
    });

    it("makeState asks `makeState:state` with the bag core adopted, not the caller's", () => {
      const seen: unknown[][] = [];
      const caller = { id: "7" };

      getPluginApi(router).addCheck("makeState:state", (...args) => {
        seen.push(args);
      });

      getInternals(router).makeState("u", caller, {}, "/u/7");

      // ⚑ ONE read of the caller's bag, and the judged value is the shipped one
      // (#2134) — so what the check saw is core's copy, never the original.
      expect(seen).toStrictEqual([["u", { id: "7" }, {}, "/u/7"]]);
      expect(seen[0]?.[1]).not.toBe(caller);
    });
  });
});
