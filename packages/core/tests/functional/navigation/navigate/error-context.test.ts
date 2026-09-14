import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - error context", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("error context preservation (analysis 10.4)", () => {
    it("should preserve error message when guard throws Error", async () => {
      const errorMessage = "Custom guard error message";

      lifecycle.addActivateGuard("users", () => () => {
        throw new Error(errorMessage);
      });

      await expect(router.navigate("users")).rejects.toMatchObject({
        message: errorMessage,
      });
    });

    it("should preserve error stack when guard throws Error", async () => {
      lifecycle.addActivateGuard("users", () => () => {
        throw new Error("Error with stack");
      });

      await expect(router.navigate("users")).rejects.toMatchObject({
        stack: expect.stringContaining("Error with stack"),
      });
    });

    it("should include segment info in canActivate error", async () => {
      lifecycle.addActivateGuard("users", () => () => {
        throw new Error("Guard error");
      });

      await expect(router.navigate("users")).rejects.toMatchObject({
        segment: "users",
      });
    });

    it("should include segment info in canDeactivate error", async () => {
      await router.navigate("users");

      lifecycle.addDeactivateGuard("users", () => () => {
        throw new Error("Guard error");
      });

      await expect(router.navigate("home")).rejects.toMatchObject({
        segment: "users",
      });
    });

    it("should preserve error message when Promise rejects with Error", async () => {
      const errorMessage = "Async rejection message";

      lifecycle.addActivateGuard(
        "users",
        () => () => Promise.reject(new Error(errorMessage)),
      );

      await expect(router.navigate("users")).rejects.toMatchObject({
        message: errorMessage,
      });
    });

    it("should handle Promise rejection with plain object", async () => {
      lifecycle.addActivateGuard(
        "users",
        () => () => Promise.reject({ reason: "auth_failed", userId: 123 }),
      );

      // Custom properties should be preserved (except reserved)
      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
        reason: "auth_failed",
        userId: 123,
      });
    });
  });

  describe("Issue #39: RouterError constructor conflicts with reserved properties", () => {
    // Test 1: Constructor should throw when "code" is passed in options
    it("should throw TypeError when 'code' property is passed in options", async () => {
      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.TRANSITION_ERR, { code: 500 });
      }).toThrow(TypeError);

      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.TRANSITION_ERR, { code: 500 });
      }).toThrow(/Cannot set reserved property "code"/);
    });

    // Test 2: Constructor should throw for "segment" if passed as custom field
    // Note: segment IS in destructuring, so this tests double-passing scenario
    it("should not allow overwriting segment via rest properties", async () => {
      // segment is destructured, so passing it normally works fine
      const err = new RouterError(errorCodes.TRANSITION_ERR, {
        segment: "users",
      });

      expect(err.segment).toBe("users");

      // But if somehow code ends up in rest (e.g., via spread), it should throw
      const badOptions = { segment: "normal", code: "OVERWRITE" };

      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.TRANSITION_ERR, badOptions);
      }).toThrow(TypeError);
    });

    // Test 3: setAdditionalFields already throws for reserved properties (consistency check)
    it("setAdditionalFields should throw for reserved properties", async () => {
      const err = new RouterError(errorCodes.TRANSITION_ERR);

      expect(() => {
        err.setAdditionalFields({ code: "OVERWRITE" });
      }).toThrow(/Cannot set reserved property "code"/);

      expect(() => {
        err.setAdditionalFields({ segment: "overwrite" });
      }).toThrow(/Cannot set reserved property "segment"/);

      expect(() => {
        err.setAdditionalFields({ path: "/overwrite" });
      }).toThrow(/Cannot set reserved property "path"/);
    });

    // Test 4: Non-reserved custom properties should work in constructor
    it("should allow custom non-reserved properties in constructor", async () => {
      const err = new RouterError(errorCodes.TRANSITION_ERR, {
        userId: "123",
        attemptedRoute: "/admin",
        customData: { foo: "bar" },
      });

      expect(err.code).toBe(errorCodes.TRANSITION_ERR);
      expect(err.userId).toBe("123");
      expect(err.attemptedRoute).toBe("/admin");
      expect(err.customData).toStrictEqual({ foo: "bar" });
    });

    // Test 5: Reserved method names should be silently ignored (not throw)
    it("should silently ignore reserved method names in constructor", async () => {
      const err = new RouterError(errorCodes.TRANSITION_ERR, {
        setCode: "malicious",
        toJSON: "override",
      });

      // Methods should NOT be overwritten
      expect(typeof err.setCode).toBe("function");
      expect(typeof err.toJSON).toBe("function");
    });

    // Test 6: First argument "code" should be preserved, not overwritten
    it("should preserve first argument code even if options contain code", async () => {
      // After fix: this should throw
      // Before fix: this would silently overwrite code to 500
      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.CANNOT_ACTIVATE, { code: 500 });
      }).toThrow(TypeError);
    });
  });

  // ROUTE_NOT_FOUND raised when a route vanishes between match and commit must
  // carry the offending `{ routeName }` (not just the code) — the two defensive
  // re-checks (navigateToState entry, completeTransition) each attach it.
  describe("ROUTE_NOT_FOUND metadata when a route vanishes mid-flight", () => {
    it("navigateToState for a state whose route was removed carries { routeName }", async () => {
      const local = createRouter([
        { name: "home", path: "/home" },
        { name: "temp", path: "/temp" },
      ]);

      await local.start("/home");

      const api = getPluginApi(local);
      const state = api.makeState("temp", {});

      getRoutesApi(local).remove("temp"); // gone before navigateToState commits

      const error = await api
        .navigateToState(state)
        .catch((error_: unknown) => error_);

      expect(error).toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
        routeName: "temp",
      });

      local.dispose();
    });

    it("completeTransition for a route removed by an in-flight guard carries { routeName }", async () => {
      const local = createRouter([
        { name: "home", path: "/home" },
        { name: "target", path: "/target" },
      ]);

      await local.start("/home");

      // An async activate guard removes the very route being entered — by commit
      // time it no longer exists, so completeTransition fails with { routeName }.
      getLifecycleApi(local).addActivateGuard("target", () => async () => {
        getRoutesApi(local).remove("target");

        return true;
      });

      const error = await local
        .navigate("target")
        .catch((error_: unknown) => error_);

      expect(error).toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
        routeName: "target",
      });

      local.dispose();
    });
  });

  /**
   * `routeName` names a ROUTE, or is absent — and where it is absent the MESSAGE
   * carries the reason (#1785).
   *
   * The two cells above pin the shape at the two doors that always had it. This
   * table is the other direction: every producer of the code, measured together,
   * so the field cannot be right at three sites and prose at three others
   * without one assertion saying so.
   *
   * ⚠ The cell records `message = code` versus `message explains`, not the
   * sentence itself. The invariant is that a caller who got no route name gets a
   * reason SOMEWHERE, and pinning the wording would make every rephrasing a test
   * edit while pinning nothing a consumer depends on.
   *
   * ⚑ `allowNotFound: false` on purpose: the default commits `UNKNOWN_ROUTE` for
   * an unknown name instead of rejecting, so the whole table would be vacuous
   * under it — three cells resolving and nothing to read the field off.
   *
   * ⚑ The derived half — that no site spells a literal into the slot — lives in
   * `tests/functional/route-not-found-naming-authority-1785.test.ts`, which walks
   * `src`. Neither half sees the other's defect: a producer that omits the field
   * passes the walk by construction, and the walk is what catches a literal at a
   * site no behavioural cell happens to reach.
   */
  describe("every ROUTE_NOT_FOUND producer, as one table (#1785)", () => {
    const BASE = [{ name: "home", path: "/home" }];

    /** `routeName · whether the message adds anything to the code`. */
    const observe = async (
      options: Record<string, unknown>,
      call: (r: Router) => Promise<unknown>,
    ): Promise<string> => {
      const local = createRouter([...BASE], {
        allowNotFound: false,
        ...options,
      });

      await local.start("/home");

      const error = (await call(local).catch(
        (error_: unknown) => error_,
      )) as RouterError;

      local.dispose();

      const named = (error.routeName as string | undefined) ?? "(absent)";
      const explains = error.message !== error.code;

      return `${named} · message ${explains ? "explains" : "= code"}`;
    };

    it("the whole table, in one assertion", async () => {
      const table = {
        "navigateToDefault · not configured": await observe({}, (r) =>
          r.navigateToDefault(),
        ),
        "navigateToDefault · callback resolves empty": await observe(
          { defaultRoute: () => "" },
          (r) => r.navigateToDefault(),
        ),
        "navigateToDefault · callback resolves a non-name": await observe(
          { defaultRoute: () => 42 as unknown as string },
          (r) => r.navigateToDefault(),
        ),
        "navigateToDefault · names a missing route": await observe(
          { defaultRoute: "ghost" },
          (r) => r.navigateToDefault(),
        ),
        "navigate · names a missing route": await observe({}, (r) =>
          r.navigate("ghost"),
        ),
        "navigateToState · names a missing route": await observe({}, (r) =>
          getPluginApi(r).navigateToState({
            name: "ghost",
            params: {},
            search: {},
            path: "/ghost",
          } as never),
        ),
      };

      expect(table).toStrictEqual({
        // No route was named, so there is nothing to put in the field — and the
        // reason lives in the message, which is where a consumer reads prose.
        "navigateToDefault · not configured": "(absent) · message explains",
        "navigateToDefault · callback resolves empty":
          "(absent) · message explains",
        "navigateToDefault · callback resolves a non-name":
          "(absent) · message explains",
        // A route WAS named. The field carries it, at all three doors.
        "navigateToDefault · names a missing route": "ghost · message = code",
        "navigate · names a missing route": "ghost · message = code",
        "navigateToState · names a missing route": "ghost · message = code",
      });
    });

    it("CONTROL — an un-awaited navigate to a missing route leaks nothing (#721)", async () => {
      // The named arc can no longer return the pre-suppressed cached rejection —
      // it has to allocate to carry the name — so this is the cell that says the
      // allocation did not cost fire-and-forget safety.
      const seen: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        seen.push(reason);
      };

      process.on("unhandledRejection", onUnhandled);

      const local = createRouter([...BASE], { allowNotFound: false });

      await local.start("/home");
      void local.navigate("ghost"); // deliberately not awaited — that IS the cell

      await new Promise((resolve) => setTimeout(resolve, 50));

      process.off("unhandledRejection", onUnhandled);
      local.dispose();

      expect(seen).toStrictEqual([]);
    });
  });
});
