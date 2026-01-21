import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State, RouterError } from "@real-router/core";

let router: Router;

describe("router.navigate() - edge cases callback", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("callback error handling", () => {
    it("should not crash when callback throws sync error", () => {
      router.navigate("users", () => {
        throw new Error("User callback error");
      });

      // Router should continue working
      expect(router.isStarted()).toBe(true);
      expect(router.getState()?.name).toBe("users");
    });

    it("should not crash when callback throws on route not found", () => {
      router.navigate("nonexistent", () => {
        throw new Error("Callback error on not found");
      });

      // Router should still be operational
      expect(router.isStarted()).toBe(true);
    });

    it("should not crash when callback throws on same states error", () => {
      router.navigate("users");

      expect(router.getState()?.name).toBe("users");

      // Navigate to same route without force/reload
      router.navigate("users", () => {
        throw new Error("Callback error on same states");
      });

      // Router should still be operational
      expect(router.isStarted()).toBe(true);
    });

    it("should not crash when callback throws with skipTransition", () => {
      router.navigate("users", {}, { skipTransition: true }, () => {
        throw new Error("Callback error on skipTransition");
      });

      // Router should still be operational
      expect(router.isStarted()).toBe(true);
    });

    it("should not crash when router not started and callback throws", () => {
      router.stop();

      router.navigate("users", () => {
        throw new Error("Callback error on not started");
      });

      // Router should not have crashed
      expect(router.isStarted()).toBe(false);
    });
  });

  describe("edge cases - section 12 analysis", () => {
    describe("recursive navigate from callback", () => {
      it("should handle navigate called from callback without stack overflow", () => {
        let depth = 0;
        const maxDepth = 10;

        const recursiveNavigate = () => {
          depth++;

          if (depth < maxDepth) {
            router.navigate("orders", {}, {}, () => {
              if (depth < maxDepth) {
                router.navigate("users", {}, {}, recursiveNavigate);
              }
            });
          }
        };

        // Start the recursive chain
        router.navigate("users", {}, {}, recursiveNavigate);

        // Should complete without stack overflow
        expect(depth).toBeGreaterThan(0);
        expect(router.isStarted()).toBe(true);
      });

      it("should allow navigation from success callback", () => {
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();

        router.navigate("users", {}, {}, (err, state) => {
          firstCallback(err, state);

          // Navigate again from callback
          router.navigate("orders", {}, {}, secondCallback);
        });

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

    // -------------------------------------------------------------------------
    // 12.5.1: skipTransition does NOT cancel active async navigation
    // -------------------------------------------------------------------------

    describe("skipTransition interaction with async navigation", () => {
      it("should NOT cancel active async navigation when skipTransition is used", async () => {
        const asyncCallback = vi.fn();
        const skipCallback = vi.fn();

        // Create an async guard that delays
        const asyncGuard = vi.fn(
          () =>
            new Promise<boolean>((resolve) => {
              setTimeout(() => {
                resolve(true);
              }, 50);
            }),
        );

        router.canActivate("orders", () => asyncGuard);

        // Start async navigation
        router.navigate("orders", {}, {}, asyncCallback);

        // Immediately call skipTransition (should NOT cancel the async navigation)
        router.navigate("profile", {}, { skipTransition: true }, skipCallback);

        // skipTransition callback should be called immediately with preview state
        expect(skipCallback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "profile" }),
        );

        // Router state should NOT have changed (skipTransition doesn't update state)
        // Note: Router starts at "home" route (default from createTestRouter)
        expect(router.getState()?.name).toBe("home");

        // Wait for async navigation to complete
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });

        // Async navigation should have completed successfully (NOT cancelled)
        expect(asyncCallback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "orders" }),
        );

        // Router state should now be "orders"
        expect(router.getState()?.name).toBe("orders");
      });

      it("should allow multiple skipTransition calls without affecting async navigation", async () => {
        const asyncCallback = vi.fn();
        const skip1 = vi.fn();
        const skip2 = vi.fn();
        const skip3 = vi.fn();

        const asyncGuard = vi.fn(
          () =>
            new Promise<boolean>((resolve) => {
              setTimeout(() => {
                resolve(true);
              }, 50);
            }),
        );

        router.canActivate("settings", () => asyncGuard);

        // Start async navigation
        router.navigate("settings", {}, {}, asyncCallback);

        // Multiple skipTransition calls
        router.navigate("users", {}, { skipTransition: true }, skip1);
        router.navigate("profile", {}, { skipTransition: true }, skip2);
        router.navigate("orders", {}, { skipTransition: true }, skip3);

        // All skipTransition callbacks should receive their preview states
        expect(skip1).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
        expect(skip2).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "profile" }),
        );
        expect(skip3).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "orders" }),
        );

        // Wait for async navigation
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });

        // Original async navigation should complete
        expect(asyncCallback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "settings" }),
        );
        expect(router.getState()?.name).toBe("settings");
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
        const callback = vi.fn();

        await new Promise<void>((resolve) => {
          router.navigate(
            "users",
            { id: 1 },
            undefined as any,
            (err, state) => {
              callback(err, state);
              resolve();
            },
          );
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(undefined, expect.anything());
      });

      it("should call callback when opts is null: navigate(name, params, null, callback)", async () => {
        const callback = vi.fn();

        await new Promise<void>((resolve) => {
          router.navigate("users", { id: 1 }, null as any, (err, state) => {
            callback(err, state);
            resolve();
          });
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(undefined, expect.anything());
      });

      it("should call callback when opts is empty object: navigate(name, params, {}, callback)", async () => {
        const callback = vi.fn();

        await new Promise<void>((resolve) => {
          router.navigate("users", { id: 1 }, {}, (err, state) => {
            callback(err, state);
            resolve();
          });
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(undefined, expect.anything());
      });

      it("should call callback when opts has values: navigate(name, params, opts, callback)", async () => {
        const callback = vi.fn();

        await new Promise<void>((resolve) => {
          router.navigate(
            "users",
            { id: 1 },
            { replace: true },
            (err, state) => {
              callback(err, state);
              resolve();
            },
          );
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(undefined, expect.anything());
      });
    });

    describe("Callback receives correct arguments", () => {
      it("should pass error to callback when route not found with undefined opts", async () => {
        const callback = vi.fn();

        await new Promise<void>((resolve) => {
          router.navigate(
            "nonexistent",
            {},
            undefined as any,
            (err: RouterError | undefined, state) => {
              callback(err, state);
              resolve();
            },
          );
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0]).toBeDefined();
        expect(callback.mock.calls[0][0]?.code).toBe(
          errorCodes.ROUTE_NOT_FOUND,
        );
        expect(callback.mock.calls[0][1]).toBeUndefined();
      });

      it("should pass state to callback on successful navigation with undefined opts", async () => {
        const result = await new Promise<{ err: any; state: any }>(
          (resolve) => {
            router.navigate(
              "users.view",
              { id: "123" },
              undefined as any,
              (err, state) => {
                resolve({ err, state });
              },
            );
          },
        );

        expect(result.err).toBeUndefined();
        expect(result.state).toBeDefined();
        expect(result.state?.name).toBe("users.view");
        expect(result.state?.params).toStrictEqual({ id: "123" });
      });
    });

    describe("Options should be applied correctly", () => {
      it("should apply opts when provided after params", async () => {
        const successListener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, successListener);

        await new Promise<void>((resolve) => {
          router.navigate("users", {}, { replace: true }, () => {
            resolve();
          });
        });

        // Verify options were passed through to the transition
        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        expect(opts?.replace).toBe(true);

        router.removeEventListener(events.TRANSITION_SUCCESS, successListener);
      });

      it("should use default empty opts when undefined is passed", async () => {
        const successListener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, successListener);

        await new Promise<void>((resolve) => {
          router.navigate("users", {}, undefined as any, () => {
            resolve();
          });
        });

        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        // Options should exist but be empty (no replace, no reload, etc.)
        // We use toBeFalsy() because values can be undefined (falsy) instead of false
        // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
        expect(opts?.replace).toBeFalsy();
        // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
        expect(opts?.reload).toBeFalsy();

        router.removeEventListener(events.TRANSITION_SUCCESS, successListener);
      });
    });

    describe("Polymorphic argument forms still work", () => {
      it("should work: navigate(name)", async () => {
        const result = await new Promise<State | undefined>((resolve) => {
          router.navigate("users", (_err, state) => {
            resolve(state);
          });
        });

        expect(result?.name).toBe("users");
      });

      it("should work: navigate(name, callback)", async () => {
        const callback = vi.fn();

        await new Promise<void>((resolve) => {
          router.navigate("users", (err, state) => {
            callback(err, state);
            resolve();
          });
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ name: "users" }),
        );
      });

      it("should work: navigate(name, params)", async () => {
        router.navigate("users.view", { id: "456" });

        // Wait for async navigation
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(router.getState()?.name).toBe("users.view");
        expect(router.getState()?.params).toStrictEqual({ id: "456" });
      });

      it("should work: navigate(name, params, callback)", async () => {
        const callback = vi.fn();

        await new Promise<void>((resolve) => {
          router.navigate("users.view", { id: "789" }, (err, state) => {
            callback(err, state);
            resolve();
          });
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            name: "users.view",
            params: { id: "789" },
          }),
        );
      });

      it("should work: navigate(name, params, opts)", async () => {
        const successListener = vi.fn();

        router.addEventListener(events.TRANSITION_SUCCESS, successListener);

        router.navigate("users", {}, { replace: true });

        // Wait for async navigation
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(successListener).toHaveBeenCalled();

        const opts = successListener.mock.calls[0][2];

        expect(opts?.replace).toBe(true);

        router.removeEventListener(events.TRANSITION_SUCCESS, successListener);
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

    it("should call callback when opts is undefined", () => {
      const freshRouter = createTestRouter();
      const callback = vi.fn();

      freshRouter.start();

      // This form: navigate(name, params, undefined, callback)
      // @ts-expect-error - testing undefined opts handling
      freshRouter.navigate("users", { id: "1" }, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Object));

      freshRouter.stop();
    });

    it("should call callback when opts is null", () => {
      const freshRouter = createTestRouter();
      const callback = vi.fn();

      freshRouter.start();

      // @ts-expect-error - testing null opts
      freshRouter.navigate("users", {}, null, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      freshRouter.stop();
    });

    it("should call callback with error when navigation fails", () => {
      const freshRouter = createTestRouter();
      const callback = vi.fn();

      freshRouter.start();

      // Navigate to non-existent route
      // @ts-expect-error - testing undefined opts handling
      freshRouter.navigate("nonexistent", {}, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ code: errorCodes.ROUTE_NOT_FOUND }),
      );

      freshRouter.stop();
    });

    it("should handle all argument forms correctly", () => {
      const freshRouter = createTestRouter();

      freshRouter.start();

      // Form 1: navigate(name)
      freshRouter.navigate("users");
      // No callback to verify, just shouldn't throw

      // Form 2: navigate(name, callback)
      const cb2 = vi.fn();

      freshRouter.navigate("users", cb2);

      expect(cb2).toHaveBeenCalled();

      // Form 3: navigate(name, params)
      freshRouter.navigate("users.view", { id: "1" });
      // No callback to verify

      // Form 4: navigate(name, params, callback)
      const cb4 = vi.fn();

      freshRouter.navigate("users.view", { id: "2" }, cb4);

      expect(cb4).toHaveBeenCalled();

      // Form 5: navigate(name, params, opts)
      freshRouter.navigate("users", {}, { reload: true });
      // No callback to verify

      // Form 6: navigate(name, params, opts, callback)
      const cb6 = vi.fn();

      freshRouter.navigate("users", {}, { reload: true }, cb6);

      expect(cb6).toHaveBeenCalled();

      // Form 7: navigate(name, params, undefined, callback) - the bug case
      const cb7 = vi.fn();

      // @ts-expect-error - testing undefined opts handling
      freshRouter.navigate("users.view", { id: "3" }, undefined, cb7);

      expect(cb7).toHaveBeenCalled();

      freshRouter.stop();
    });
  });
});
