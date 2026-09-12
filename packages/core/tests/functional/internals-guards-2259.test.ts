import { beforeEach, describe, expect, it } from "vitest";

import { createRouter, events } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import { installSpyValidator } from "../helpers/spyValidator";

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
  });

  describe("validator-gated, through the internal door", () => {
    it("matchPath consults the validator", () => {
      const validator = installSpyValidator(router);
      const ctx = getInternals(router);

      ctx.matchPath("/p", ctx.getOptions());

      expect(validator.routes.validateMatchPathArgs).toHaveBeenCalledWith("/p");
    });

    it("setRootPath consults the validator", () => {
      const validator = installSpyValidator(router);

      getInternals(router).setRootPath("/base");

      expect(validator.routes.validateSetRootPathArgs).toHaveBeenCalledWith(
        "/base",
      );
    });

    it("navigateToState refuses a disposed router before touching the state", () => {
      // ⚠ Its own cell, because the validator cells below install a spy and
      // never dispose — `throwIfDisposed` survived mutation until this existed.
      const ctx = getInternals(router);
      const state = ctx.makeState("u", { id: "7" }, {}, "/u/7");

      router.dispose();

      // ⚠ THROWS rather than rejecting: the guard stands above the promise, so
      // this door's disposed failure has a different shape from its others.
      expect(() => ctx.navigateToState(state)).toThrow(/DISPOSED/);
    });

    it("navigateToState consults the validator, options included", async () => {
      const validator = installSpyValidator(router);
      const ctx = getInternals(router);
      const state = ctx.makeState("u", { id: "7" }, {}, "/u/7");

      await ctx.navigateToState(state, { reload: true }).catch(() => undefined);

      expect(
        validator.navigation.validateNavigateToStateArgs,
      ).toHaveBeenCalled();
      expect(
        validator.navigation.validateNavigationOptions,
      ).toHaveBeenCalledWith({ reload: true }, "navigateToState");
    });

    it("makeState consults the validator on the bag core adopted, not the caller's", () => {
      const validator = installSpyValidator(router);
      const caller = { id: "7" };

      getInternals(router).makeState("u", caller, {}, "/u/7");

      const seen = (
        validator.state.validateMakeStateArgs as unknown as {
          mock: { calls: unknown[][] };
        }
      ).mock.calls[0]?.[1];

      // ⚑ ONE read of the caller's bag, and the judged value is the shipped one
      // (#2134) — so what the validator saw is core's copy, never the original.
      expect(seen).toStrictEqual({ id: "7" });
      expect(seen).not.toBe(caller);

      // ⚠ The CALLER string too. Emptying it survived mutation: the validator
      // uses it to name the door in its message, and nothing asserted it.
      expect(validator.navigation.validateSearch).toHaveBeenCalledWith(
        {},
        "makeState",
      );
    });
  });
});
