/* eslint-disable sonarjs/no-undefined-argument -- this file intentionally tests
 * navigate() edge cases with explicit `undefined` opts argument (Issues #53/#58).
 * Removing trailing `undefined` would defeat the test's purpose. */

import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

// NOTE: the callback-style navigation API (`navigate(name, params, opts, done)`)
// was removed — `navigate()` is Promise-only now. These tests historically
// guarded that API (Issues #53/#58); they are kept because they still exercise
// the polymorphic ARGUMENT FORMS (`undefined` / `null` / `{}` / populated opts)
// and post-error resilience. Titles describe the Promise behavior, not callbacks.

let router: Router;

describe("router.navigate() - edge cases (argument forms & error resilience)", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("error resilience — router stays operational", () => {
    it("stays operational after a normal navigation", async () => {
      await router.navigate("users");

      // Router should continue working
      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("users");
    });

    it("stays operational after a route-not-found rejection", async () => {
      await expect(router.navigate("nonexistent")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    it("stays operational after a same-states rejection", async () => {
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      // Navigate to same route without force/reload → SAME_STATES rejection.
      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.SAME_STATES,
      });

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    it("rejects with ROUTER_NOT_STARTED after stop()", async () => {
      router.stop();

      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.ROUTER_NOT_STARTED,
      });

      // Router should not have crashed
      expect(router.isActive()).toBe(false);
    });
  });

  describe("edge cases - section 12 analysis", () => {
    describe("repeated navigation", () => {
      it("should handle navigate called repeatedly without stack overflow", async () => {
        let depth = 0;
        const maxDepth = 10;

        const recursiveNavigate = async (): Promise<void> => {
          depth++;

          if (depth < maxDepth) {
            await router.navigate("orders");
            if (depth < maxDepth) {
              await router.navigate("users");
              await recursiveNavigate();
            }
          }
        };

        // Start the recursive chain
        await router.navigate("users");
        await recursiveNavigate();

        // Should complete without stack overflow
        expect(depth).toBeGreaterThan(0);
        expect(router.isActive()).toBe(true);
      });

      it("should allow a follow-up navigation after one completes", async () => {
        // A second navigation issued AFTER the first has settled commits
        // normally (this is the supported "navigation after navigation" path —
        // the reentrant SYNCHRONOUS form from a listener is banned, see
        // reentrant-ban.test.ts). The old test self-invoked two `vi.fn()` mocks
        // and asserted they were called with what it had just passed — a
        // tautology that exercised no router behavior.
        const state1 = await router.navigate("users");

        expect(state1.name).toBe("users");

        const state2 = await router.navigate("orders");

        expect(state2.name).toBe("orders");
        expect(router.getState()?.name).toBe("orders");
      });
    });
  });

  describe("Issue #53: opts argument is honored in every form", () => {
    // Issue #53 (historical, callback era): when navigate() was called as
    //   router.navigate('route', { id: 1 }, undefined, callback)
    // the trailing callback was dropped because parsing only looked for it
    // inside `if (optsOrDone)`. The callback API is gone; these now assert the
    // polymorphic OPTS forms (undefined / null / {} / populated) all resolve.

    describe("opts in every form resolves", () => {
      it("resolves when opts is undefined: navigate(name, params, undefined)", async () => {
        const state = await router.navigate(
          "users",
          { id: 1 },
          undefined,
          undefined,
        );

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("resolves when opts is null: navigate(name, params, null)", async () => {
        const state = await router.navigate(
          "users",
          { id: 1 },
          undefined,
          null as any,
        );

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("resolves when opts is empty object: navigate(name, params, {})", async () => {
        const state = await router.navigate("users", { id: 1 }, undefined, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("honors opts when populated: navigate(name, params, { replace: true })", async () => {
        const state = await router.navigate("users", { id: 1 }, undefined, {
          replace: true,
        });

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
        // The populated opts must actually take effect, not just be accepted.
        expect(state.transition?.replace).toBe(true);
      });
    });

    describe("resolution / rejection carries the right value", () => {
      it("rejects with ROUTE_NOT_FOUND when route missing and opts undefined", async () => {
        await expect(
          router.navigate("nonexistent", {}, undefined, undefined),
        ).rejects.toMatchObject({
          code: errorCodes.ROUTE_NOT_FOUND,
        });
      });

      it("resolves with the committed state on success with undefined opts", async () => {
        const state = await router.navigate(
          "users.view",
          { id: "123" },
          undefined,
          undefined,
        );

        expect(state).toBeDefined();
        expect(state.name).toBe("users.view");
        expect(state.params).toStrictEqual({ id: "123" });
      });
    });

    describe("Options should be applied correctly", () => {
      it("should apply opts when provided after params", async () => {
        const successListener = vi.fn();

        const unsubscribe = getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          successListener,
        );

        await router.navigate("users", {}, undefined, { replace: true });

        // Verify options were passed through to the transition
        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        expect(opts?.replace).toBe(true);

        unsubscribe();
      });

      it("should use default empty opts when undefined is passed", async () => {
        const successListener = vi.fn();

        const unsubscribe = getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          successListener,
        );

        await router.navigate("users", {}, undefined, undefined);

        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        // Options should exist but be empty (no replace, no reload, etc.)
        // We use toBeFalsy() because values can be undefined (falsy) instead of false
        // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
        expect(opts?.replace).toBeFalsy();
        // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
        expect(opts?.reload).toBeFalsy();

        unsubscribe();
      });
    });

    describe("Polymorphic argument forms still work", () => {
      it("should work: navigate(name)", async () => {
        const state = await router.navigate("users");

        expect(state.name).toBe("users");
      });

      it("should work: navigate(name) — single-arg form", async () => {
        const state = await router.navigate("users");

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("should work: navigate(name, params)", async () => {
        await router.navigate("users.view", { id: "456" });

        expect(router.getState()?.name).toBe("users.view");
        expect(router.getState()?.params).toStrictEqual({ id: "456" });
      });

      it("should work: navigate(name, params) — with nested id", async () => {
        const state = await router.navigate("users.view", { id: "789" });

        expect(state).toBeDefined();
        expect(state.name).toBe("users.view");
        expect(state.params).toStrictEqual({ id: "789" });
      });

      it("should work: navigate(name, params, opts)", async () => {
        const successListener = vi.fn();

        const unsubscribe = getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          successListener,
        );

        await router.navigate("users", {}, undefined, { replace: true });

        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        expect(opts?.replace).toBe(true);

        unsubscribe();
      });
    });
  });

  describe("Issue #58: undefined opts does not drop the navigation (verifies 12.1 fix)", () => {
    /**
     * Issue #58 / 12.1 (historical, callback era): a falsy `optsOrDone` used to
     * drop the trailing callback. The callback API is gone; these verify the
     * `navigate(name, params, undefined)` form still resolves/rejects correctly.
     */

    it("resolves when opts is undefined", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start("/home");

      // This form: navigate(name, params, undefined)
      const state = await freshRouter.navigate(
        "users",
        { id: "1" },
        undefined,
        undefined,
      );

      expect(state).toBeDefined();
      expect(state.name).toBe("users");

      freshRouter.stop();
    });

    it("resolves when opts is null", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start("/home");

      // @ts-expect-error - testing null opts
      const state = await freshRouter.navigate("users", {}, undefined, null);

      expect(state).toBeDefined();

      freshRouter.stop();
    });

    it("rejects with ROUTE_NOT_FOUND when navigation fails", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start("/home");

      // Navigate to non-existent route
      await expect(
        freshRouter.navigate("nonexistent", {}, undefined, undefined),
      ).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      freshRouter.stop();
    });

    it("should handle all argument forms correctly", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start("/home");

      // Form 1: navigate(name)
      await freshRouter.navigate("users");

      // Form 2: navigate(name, params)
      await freshRouter.navigate("users.view", { id: "0" });

      // Form 3: navigate(name, params)
      await freshRouter.navigate("users.view", { id: "1" });

      // Form 4: navigate(name, params)
      await freshRouter.navigate("users.view", { id: "2" });

      // Form 5: navigate(name, params, opts)
      await freshRouter.navigate("users", {}, undefined, { reload: true });

      // Form 6: navigate(name, params, opts)
      await freshRouter.navigate("users", {}, undefined, { reload: true });

      // Form 7: navigate(name, params, undefined) - the historical bug case
      await freshRouter.navigate(
        "users.view",
        { id: "3" },
        undefined,
        undefined,
      );

      expect(freshRouter.getState()?.name).toBe("users.view");

      freshRouter.stop();
    });
  });
});
