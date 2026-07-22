import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { constants, errorCodes } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.start() - edge cases", () => {
  beforeEach(() => {
    router = createTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  // Bare core does NOT validate param VALUES — value validation is opt-in via
  // @real-router/validation-plugin (#934/#942). A function / class instance /
  // plain object is ACCEPTED: it round-trips into the query string and is kept
  // BY REFERENCE in state.search (no structuredClone). Because these keys are
  // undeclared (not path `:param` slots on users.list), they are captured as
  // QUERY params — carried in state.search, not state.params (RFC-4 M2, #1548).
  // These pin the documented
  // carve-out. (The previous tests here CLAIMED bare core rejects these values —
  // via a self-catching `try { … expect.fail() } catch { expect(e).toBeDefined() }`
  // that swallowed its own AssertionError on a FALSE premise; bare core accepts
  // them, so the assertions never ran. See #1189.)
  describe("param-value acceptance (validation is opt-in, #934/#942)", () => {
    beforeEach(async () => {
      await router.start("/home");
    });

    it("accepts a function param value — resolves, kept by reference (no structuredClone)", async () => {
      const fn = (): void => {};

      // @ts-expect-error — intentionally exotic param value; bare core tolerates it
      const state = await router.navigate("users.list", { extra: fn });

      expect(state.name).toBe("users.list");
      expect(state.search?.extra).toBe(fn); // same reference, not cloned/coerced
    });

    it("accepts a class-instance param value — resolves, kept by reference", async () => {
      class Custom {
        value = 42;
      }
      const instance = new Custom();

      // @ts-expect-error — intentionally exotic param value
      const state = await router.navigate("users.list", { extra: instance });

      expect(state.name).toBe("users.list");
      expect(state.search?.extra).toBe(instance);
    });

    it("accepts a plain-object param value — resolves, kept by reference", async () => {
      const obj = { nested: { a: 1 } };

      const state = await router.navigate("users.list", { extra: obj });

      expect(state.name).toBe("users.list");
      expect(state.search?.extra).toBe(obj);
    });
  });

  describe("Async guard + stop()", () => {
    it("should cancel transition when stop() called during async guard", async () => {
      let resolveGuard: () => void;
      const guardPromise = new Promise<boolean>((resolve) => {
        resolveGuard = () => {
          resolve(true);
        };
      });

      lifecycle.addActivateGuard("users.list", () => async () => {
        await guardPromise;

        return true;
      });

      const startPromise = router.start("/users/list");

      // Stop during async guard
      router.stop();

      // Complete guard
      resolveGuard!();
      await guardPromise;

      // Wait for start to complete
      try {
        await startPromise;
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
      }
    });
  });

  describe("Interceptor window + stop() (#1185)", () => {
    it("should cancel the start when stop() is called during a parked start-interceptor", async () => {
      let release!: () => void;
      const parked = new Promise<void>((resolve) => {
        release = resolve;
      });

      getPluginApi(router).addInterceptor("start", async (next, path) => {
        await parked; // park the pipeline in the STARTING window (before next())

        return next(path);
      });

      const startPromise = router.start("/users/list");

      // FSM is STARTING here; the documented contract says stop() cancels the
      // transition — it must not be a silent no-op that proceeds to READY.
      await new Promise((resolve) => setTimeout(resolve, 5));
      router.stop();
      release();

      const outcome = await startPromise.then(
        () => "resolved",
        (error: unknown) => (error as { code?: string }).code ?? "unknown",
      );

      expect(outcome).toBe(errorCodes.TRANSITION_CANCELLED);
      expect(router.isActive()).toBe(false);
      expect(router.getState()).toBeUndefined();
    });
  });

  // Navigating to a route NAME that does not exist rejects with ROUTE_NOT_FOUND
  // when allowNotFound is disabled; the router stays active on its current state.
  // (Collapsed from two duplicate tests — "missing path field" and "missing
  // params field" — that shared the identical body `navigate("invalid.route")`
  // and neither constructed the field its title named. See #1189.)
  describe("unknown route name (allowNotFound: false)", () => {
    beforeEach(async () => {
      // Disable fallback to UNKNOWN_ROUTE to get ROUTE_NOT_FOUND errors
      router = createTestRouter({ allowNotFound: false });
      await router.start("/home");
    });

    it("rejects an unknown route NAME with ROUTE_NOT_FOUND (router stays active)", async () => {
      await expect(router.navigate("invalid.route")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      expect(router.isActive()).toBe(true);
    });
  });

  describe("UNKNOWN_ROUTE special case", () => {
    it("should work normally for UNKNOWN_ROUTE with custom path", async () => {
      const state = await router.start("/custom/unknown/path");

      expect(state).toBeDefined();
      expect(router.isActive()).toBe(true);
      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });
});
