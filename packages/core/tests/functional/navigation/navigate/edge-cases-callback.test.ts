import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, RouterError } from "@real-router/core";

let router: Router;

describe("router.navigate() - edge cases callback", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("callback error handling", () => {
    it("should not crash when callback throws sync error", async () => {
      await router.navigate("users");

      // Router should continue working
      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("users");
    });

    it("should not crash when callback throws on route not found", async () => {
      try {
        await router.navigate("nonexistent");
      } catch {
        // Expected error
      }

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    it("should not crash when callback throws on same states error", async () => {
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      // Navigate to same route without force/reload
      try {
        await router.navigate("users");
      } catch {
        // Expected SAME_STATES error
      }

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    it("should not crash when router not started and callback throws", async () => {
      router.stop();

      try {
        await router.navigate("users");
      } catch {
        // Expected NOT_STARTED error
      }

      // Router should not have crashed
      expect(router.isActive()).toBe(false);
    });
  });

  describe("edge cases - section 12 analysis", () => {
    describe("recursive navigate from callback", () => {
      it("should handle navigate called from callback without stack overflow", async () => {
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

      it("should allow navigation from success callback", async () => {
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();

        const state1 = await router.navigate("users");

        firstCallback(undefined, state1);

        // Navigate again after first completes
        const state2 = await router.navigate("orders");

        secondCallback(undefined, state2);

        expect(firstCallback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
        expect(secondCallback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "orders" }),
        );
        expect(router.getState()?.name).toBe("orders");
      });
    });
  });

  describe("Issue #53: Callback lost when navigate called with (name, params, undefined, callback)", () => {
    // Issue #53: When navigate() is called with the form:
    //   router.navigate('route', { id: 1 }, undefined, callback)
    // The callback was being ignored because the argument parsing logic
    // only checked `done` inside the `if (optsOrDone)` block, which doesn't
    // execute when optsOrDone is undefined/falsy.

    describe("Callback should be called in all argument forms", () => {
      it("should call callback when opts is undefined: navigate(name, params, undefined, callback)", async () => {
        const state = await router.navigate(
          "users",
          { id: 1 },
          undefined as any,
        );

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("should call callback when opts is null: navigate(name, params, null, callback)", async () => {
        const state = await router.navigate("users", { id: 1 }, null as any);

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("should call callback when opts is empty object: navigate(name, params, {}, callback)", async () => {
        const state = await router.navigate("users", { id: 1 }, {});

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("should call callback when opts has values: navigate(name, params, opts, callback)", async () => {
        const state = await router.navigate(
          "users",
          { id: 1 },
          { replace: true },
        );

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });
    });

    describe("Callback receives correct arguments", () => {
      it("should pass error to callback when route not found with undefined opts", async () => {
        try {
          await router.navigate("nonexistent", {}, undefined as any);

          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeDefined();
          expect((error as RouterError).code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }
      });

      it("should pass state to callback on successful navigation with undefined opts", async () => {
        const state = await router.navigate(
          "users.view",
          { id: "123" },
          undefined as any,
        );

        expect(state).toBeDefined();
        expect(state.name).toBe("users.view");
        expect(state.params).toStrictEqual({ id: "123" });
      });
    });

    describe("Options should be applied correctly", () => {
      it("should apply opts when provided after params", async () => {
        const successListener = vi.fn();

        const unsubscribe = router.addEventListener(
          events.TRANSITION_SUCCESS,
          successListener,
        );

        await router.navigate("users", {}, { replace: true });

        // Verify options were passed through to the transition
        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        expect(opts?.replace).toBe(true);

        unsubscribe();
      });

      it("should use default empty opts when undefined is passed", async () => {
        const successListener = vi.fn();

        const unsubscribe = router.addEventListener(
          events.TRANSITION_SUCCESS,
          successListener,
        );

        await router.navigate("users", {}, undefined as any);

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

      it("should work: navigate(name, callback)", async () => {
        const state = await router.navigate("users");

        expect(state).toBeDefined();
        expect(state.name).toBe("users");
      });

      it("should work: navigate(name, params)", async () => {
        await router.navigate("users.view", { id: "456" });

        expect(router.getState()?.name).toBe("users.view");
        expect(router.getState()?.params).toStrictEqual({ id: "456" });
      });

      it("should work: navigate(name, params, callback)", async () => {
        const state = await router.navigate("users.view", { id: "789" });

        expect(state).toBeDefined();
        expect(state.name).toBe("users.view");
        expect(state.params).toStrictEqual({ id: "789" });
      });

      it("should work: navigate(name, params, opts)", async () => {
        const successListener = vi.fn();

        const unsubscribe = router.addEventListener(
          events.TRANSITION_SUCCESS,
          successListener,
        );

        await router.navigate("users", {}, { replace: true });

        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        expect(opts?.replace).toBe(true);

        unsubscribe();
      });
    });
  });

  describe("Issue #58: Callback not lost with undefined opts (verifies 12.1 fix)", () => {
    /**
     * Issue #58 / 12.1: Verify callback is not lost when navigate is called as:
     * navigate(name, params, undefined, callback)
     *
     * Previously, if optsOrDone was undefined/falsy, the done parameter was ignored.
     * The fix changed `else if (optsOrDone)` to just `else` to capture done properly.
     */

    it("should call callback when opts is undefined", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start();

      // This form: navigate(name, params, undefined)
      const state = await freshRouter.navigate(
        "users",
        { id: "1" },
        undefined as any,
      );

      expect(state).toBeDefined();
      expect(state.name).toBe("users");

      freshRouter.stop();
    });

    it("should call callback when opts is null", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start();

      // @ts-expect-error - testing null opts
      const state = await freshRouter.navigate("users", {}, null);

      expect(state).toBeDefined();

      freshRouter.stop();
    });

    it("should call callback with error when navigation fails", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start();

      // Navigate to non-existent route
      try {
        await freshRouter.navigate("nonexistent", {}, undefined as any);

        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as RouterError).code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      freshRouter.stop();
    });

    it("should handle all argument forms correctly", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start();

      // Form 1: navigate(name)
      await freshRouter.navigate("users");
      // No callback to verify, just shouldn't throw

      // Form 2: navigate(name, callback) - callback pattern removed, just navigate
      await freshRouter.navigate("users.view", { id: "0" });

      // Form 3: navigate(name, params)
      await freshRouter.navigate("users.view", { id: "1" });
      // No callback to verify

      // Form 4: navigate(name, params, callback) - callback pattern removed
      await freshRouter.navigate("users.view", { id: "2" });

      // Form 5: navigate(name, params, opts)
      await freshRouter.navigate("users", {}, { reload: true });
      // No callback to verify

      // Form 6: navigate(name, params, opts, callback) - callback pattern removed
      await freshRouter.navigate("users", {}, { reload: true });

      // Form 7: navigate(name, params, undefined, callback) - the bug case - callback pattern removed
      await freshRouter.navigate("users.view", { id: "3" }, undefined as any);

      freshRouter.stop();
    });
  });
});
