import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, UNKNOWN_ROUTE } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - edge cases input validation", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("Issue #60: navigate() options validation", () => {
    it("should accept valid NavigationOptions", () => {
      expect(() => {
        void router.navigate("users", {}, { replace: true, reload: false });
      }).not.toThrow();
    });

    it("should accept empty options object", () => {
      expect(() => {
        void router.navigate("users", {}, {});
      }).not.toThrow();
    });

    it("should accept undefined options (short form)", () => {
      expect(() => {
        void router.navigate("users", {});
      }).not.toThrow();
    });
  });

  describe("edge cases - invalid input types (analysis 10.1.3)", () => {
    it("should handle empty string as route name", async () => {
      // Must REJECT with ROUTE_NOT_FOUND — the previous try/catch asserted inside
      // the catch, so a regression that resolved `navigate("")` passed vacuously.
      await expect(router.navigate("")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    // #1180: a nullish route NAME rejects GRACEFULLY with ROUTE_NOT_FOUND on bare
    // core — no crash, no cryptic deep TypeError (the class of #939's
    // start(undefined) → codePointAt throw in path-matcher). Pinned so a refactor
    // of buildNavigateState / forwardState cannot regress this input class into a
    // deep throw and ship green. `.rejects` also guards the crash-regression: a
    // synchronous throw from navigate(null) would fail this assertion too.
    it("rejects navigate(null) with ROUTE_NOT_FOUND (graceful, not a cryptic throw)", async () => {
      // @ts-expect-error — null is not a valid route name; bare-core hardening pin
      await expect(router.navigate(null)).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      expect(router.isActive()).toBe(true);
    });

    it("rejects navigate(undefined) with ROUTE_NOT_FOUND (graceful, not a cryptic throw)", async () => {
      // @ts-expect-error — undefined is not a valid route name; bare-core pin
      await expect(router.navigate(undefined)).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      expect(router.isActive()).toBe(true);
    });
  });

  // ============================================================================
  // Boundary inputs — params / opts / route name (#17)
  //
  // Every assertion below reflects the ACTUAL, empirically-observed behavior of
  // the code (validation-plugin is NOT registered, so core's `validator?` hooks
  // are no-ops and inputs flow straight into buildNavigateState / the matcher).
  // Where the observed behavior is surprising it is called out in a comment.
  // ============================================================================

  describe("boundary inputs (#17)", () => {
    it("accepts params with unicode (non-ASCII) keys", async () => {
      const state = await router.navigate("items", {
        "ключ-тест": "значение",
        id: "1",
      });

      // Path-param `id` matched the route segment and stays in params; the
      // undeclared unicode key is a query param (RFC-4 M2 search channel) and
      // survives untouched there, then serializes as a (URL-encoded) query.
      expect(state.name).toBe("items");
      expect(state.params).toMatchObject({
        id: "1",
      });
      expect(state.search).toMatchObject({
        "ключ-тест": "значение",
      });
      expect(state.path).toContain("/items/1");
      expect(state.path).toContain(
        `${encodeURIComponent("ключ-тест")}=${encodeURIComponent("значение")}`,
      );

      expect(router.isActive()).toBe(true);
    });

    // #1182: NaN / Infinity as a PATH-param value flow through the full navigate
    // pipeline untouched — bare core does NOT validate param values (that is
    // opt-in via @real-router/validation-plugin; CLAUDE.md "Param-value type
    // validation stays opt-in"). Previously exercised only through buildPath()
    // unit tests — the committed state.params / state.path was unpinned.
    it("accepts NaN as a path-param value — params keep raw NaN, path stringifies to /items/NaN", async () => {
      const state = await router.navigate("items", { id: Number.NaN });

      expect(state.name).toBe("items");
      // Raw NaN preserved in params (typeof number) — not coerced, not dropped.
      expect(Number.isNaN(state.params.id)).toBe(true);
      // String(NaN) folded into the URL segment.
      expect(state.path).toBe("/items/NaN");

      expect(router.isActive()).toBe(true);
    });

    it("accepts Infinity / -Infinity as a path-param value — params keep raw value, path stringifies", async () => {
      const inf = await router.navigate("items", {
        id: Number.POSITIVE_INFINITY,
      });

      expect(inf.params.id).toBe(Number.POSITIVE_INFINITY);
      expect(inf.path).toBe("/items/Infinity");

      const negInf = await router.navigate("items", {
        id: Number.NEGATIVE_INFINITY,
      });

      expect(negInf.params.id).toBe(Number.NEGATIVE_INFINITY);
      expect(negInf.path).toBe("/items/-Infinity");
    });

    it("rejects a Symbol param VALUE with a TypeError (Symbol→string is illegal)", async () => {
      // CORE-WITHOUT-PLUGIN behavior: a Symbol-valued, non-path param is NOT
      // caught by a RouterError validation path — it reaches URL/query
      // serialization (String(symbol)) and throws a raw `TypeError: Cannot
      // convert a Symbol value to a string`. The rejection carries NO `code`; it
      // is a native TypeError. (@real-router/validation-plugin rejects it earlier
      // with an actionable message, #934 — this pins the bare-core asymmetry.)
      const sym = Symbol("boundary");

      let error: unknown;

      try {
        await router.navigate("items", {
          id: "1",
          weird: sym as any,
        });
      } catch (error_: unknown) {
        error = error_;
      }

      expect(error).toBeInstanceOf(TypeError);
      expect((error as TypeError).message).toMatch(/Symbol/i);
      // It is NOT a coded RouterError.
      expect((error as { code?: unknown }).code).toBeUndefined();

      // The throw happens before any state commit — the router is untouched and
      // still fully operational on the previous (start) route.
      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");

      const recovered = await router.navigate("users");

      expect(recovered.name).toBe("users");
    });

    it("core (no validation-plugin) accepts a Symbol PATH param — validator-opt-in; the plugin rejects it (#934)", async () => {
      // CORE-WITHOUT-PLUGIN behavior (validator-opt-in): unlike a Symbol query
      // value (TypeError above), a Symbol bound to the `:id` PATH segment does
      // NOT throw in bare core. The matcher template-literal-stringifies it into
      // the URL (`/items/Symbol(path-id)`) while `state.params.id` keeps the
      // ORIGINAL Symbol — a path that can never round-trip back. Core stays
      // platform-agnostic and tolerant by design; @real-router/validation-plugin
      // now REJECTS a Symbol path-param with an actionable message (#934). This
      // pins the bare-core behavior the plugin guards.
      const sym = Symbol("path-id");

      const state = await router.navigate("items", {
        id: sym as any,
      });

      expect(state.name).toBe("items");
      // The Symbol got stringified into the raw path via template literal...
      expect(state.path).toBe("/items/Symbol(path-id)");
      // ...yet params retains the un-coerced Symbol itself (not a string).
      expect(typeof state.params.id).toBe("symbol");
      expect(state.params.id).toBe(sym);

      expect(router.isActive()).toBe(true);
    });

    it("FINDING: a NON-ENUMERABLE `replace` option is still honored", async () => {
      // The pipeline reads `opts.replace` directly (property access), it does
      // NOT enumerate own keys — so a non-enumerable `replace` is applied just
      // like an enumerable one. Verified via state.transition.replace, which
      // core sets from NavigationOptions.
      const onTransitionSuccess = vi.fn();

      const r = createTestRouter();

      r.usePlugin(() => ({ onTransitionSuccess }));

      await r.start("/home");

      const opts = {};

      Object.defineProperty(opts, "replace", {
        enumerable: false,
        value: true,
      });

      const state = await r.navigate("users", {}, opts);

      expect(state.transition?.replace).toBe(true);
      expect(onTransitionSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users" }),
        expect.anything(),
        expect.objectContaining({ replace: true }),
      );

      r.stop();
    });

    it("rejects a whitespace-only route name with ROUTE_NOT_FOUND", async () => {
      let error: any;

      try {
        await router.navigate("  ");
      } catch (error_: any) {
        error = error_;
      }

      // Whitespace is not trimmed/special-cased — it is simply an unknown route.
      expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);

      // Router stays operational.
      expect(router.isActive()).toBe(true);

      const recovered = await router.navigate("users");

      expect(recovered.name).toBe("users");
    });

    it("rejects navigate(UNKNOWN_ROUTE) with ROUTE_NOT_FOUND (the sentinel is not a registered route)", async () => {
      // The UNKNOWN_ROUTE sentinel ("@@router/UNKNOWN_ROUTE") is an internal
      // state name produced by navigateToNotFound — it is NOT a route you can
      // navigate() to. buildNavigateState finds no such route, so navigate()
      // rejects with ROUTE_NOT_FOUND (same result with or without allowNotFound).
      let error: any;

      try {
        await router.navigate(UNKNOWN_ROUTE);
      } catch (error_: any) {
        error = error_;
      }

      expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);

      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");
    });

    it("rejects navigate(UNKNOWN_ROUTE) with ROUTE_NOT_FOUND even when allowNotFound is enabled", async () => {
      const r = createTestRouter({ allowNotFound: true });

      await r.start("/home");

      let error: any;

      try {
        await r.navigate(UNKNOWN_ROUTE);
      } catch (error_: any) {
        error = error_;
      }

      // allowNotFound governs unmatched *paths* (via navigateToNotFound), not
      // an attempt to navigate by the sentinel route NAME — still ROUTE_NOT_FOUND.
      expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(r.isActive()).toBe(true);

      r.stop();
    });
  });
});
