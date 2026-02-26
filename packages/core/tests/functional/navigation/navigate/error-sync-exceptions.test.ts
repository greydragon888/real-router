import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, LifecycleApi } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - error sync exceptions", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("error handling in guards and middleware", () => {
    describe("error in canDeactivate", () => {
      it("should handle synchronous error in canDeactivate guard", async () => {
        const errorMessage = "Deactivate guard error";
        const errorDeactivateGuard = vi.fn().mockImplementation(() => {
          throw new Error(errorMessage);
        });

        lifecycle.addDeactivateGuard(
          "orders.pending",
          () => errorDeactivateGuard,
        );

        // Navigate to initial state
        await router.navigate("orders.pending", {}, {});

        errorDeactivateGuard.mockClear();

        // Navigate away - should fail with error
        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error) {
          expect(error).toBeDefined();
          expect((error as any)?.message).toBe(errorMessage);
        }

        expect(errorDeactivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should stop transition on canDeactivate error", async () => {
        const errorGuard = vi.fn().mockImplementation(() => {
          throw new Error("First guard error");
        });
        const nextGuard = vi.fn().mockReturnValue(true);

        // Attach guards in order they will be called: child first, then parent
        lifecycle.addDeactivateGuard("orders.pending", () => nextGuard); // Called first
        lifecycle.addDeactivateGuard("orders", () => errorGuard); // Called second, throws error

        await router.navigate("orders.pending", {}, {});

        errorGuard.mockClear();
        nextGuard.mockClear();

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error) {
          expect(error).toBeDefined();
          expect((error as any)?.message).toBe("First guard error");
        }

        // Both guards should be called, but error stops transition
        expect(nextGuard).toHaveBeenCalledTimes(1); // Child guard called first
        expect(errorGuard).toHaveBeenCalledTimes(1); // Parent guard called second, throws
      });
    });

    describe("error in canActivate", () => {
      it("should handle synchronous error in canActivate guard", async () => {
        const errorMessage = "Activate guard error";
        const errorActivateGuard = vi.fn().mockImplementation(() => {
          throw new Error(errorMessage);
        });

        lifecycle.addActivateGuard("profile", () => errorActivateGuard);

        try {
          await router.navigate("profile");

          expect.fail("Should have thrown error");
        } catch (error) {
          expect(error).toBeDefined();
          expect((error as any)?.message).toBe(errorMessage);
        }

        expect(errorActivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should stop activation on canActivate error", async () => {
        const errorGuard = vi.fn().mockImplementation(() => {
          throw new Error("Activation error");
        });
        const nextGuard = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard("settings", () => errorGuard);
        lifecycle.addActivateGuard("settings.account", () => nextGuard);

        try {
          await router.navigate("settings.account");

          expect.fail("Should have thrown error");
        } catch (error) {
          expect(error).toBeDefined();
          expect((error as any)?.message).toBe("Activation error");
        }

        expect(errorGuard).toHaveBeenCalledTimes(1);
        // Next guard should not be called due to error
        expect(nextGuard).not.toHaveBeenCalled();
      });
    });

    describe("error in middleware", () => {
      it("should handle synchronous error in middleware", async () => {
        const errorMiddleware = vi.fn().mockImplementation(() => {
          throw new Error("Middleware error");
        });

        router.usePlugin(() => ({ onTransitionSuccess: errorMiddleware }));

        const state = await router.navigate("orders.pending");

        expect(state).toBeDefined();
        expect(state.name).toBe("orders.pending");
        expect(errorMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should call all middleware even when one throws (fire-and-forget chain continues)", async () => {
        const errorMiddleware = vi.fn().mockImplementation(() => {
          throw new Error("First middleware error");
        });
        const nextMiddleware = vi.fn().mockReturnValue(true);

        router.usePlugin(() => ({ onTransitionSuccess: errorMiddleware }));
        router.usePlugin(() => ({ onTransitionSuccess: nextMiddleware }));

        const state = await router.navigate("profile");

        expect(state).toBeDefined();
        expect(state.name).toBe("profile");
        expect(errorMiddleware).toHaveBeenCalledTimes(1);
        expect(nextMiddleware).toHaveBeenCalledTimes(1);
      });

      it("should handle middleware error even with guards present", async () => {
        const activateGuard = vi.fn().mockReturnValue(true);
        const errorMiddleware = vi.fn().mockImplementation(() => {
          throw new Error("Middleware failed");
        });

        lifecycle.addActivateGuard("orders", () => activateGuard);
        router.usePlugin(() => ({ onTransitionSuccess: errorMiddleware }));

        const state = await router.navigate("orders");

        expect(state).toBeDefined();
        expect(state.name).toBe("orders");
        expect(activateGuard).toHaveBeenCalledTimes(1);
        expect(errorMiddleware).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Issue #33: Unhandled Synchronous Exceptions", () => {
    // Test 1: canActivate throws synchronous exception
    it("should catch synchronous exception from canActivate", async () => {
      // Factory returns function that throws
      const throwingHookFactory = () => () => {
        throw new Error("canActivate failed synchronously");
      };

      lifecycle.addActivateGuard("users", throwingHookFactory);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any)?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect((error as any)?.message).toBe(
          "canActivate failed synchronously",
        );
        expect((error as any)?.stack).toBeDefined();
      }
    });

    // Test 2: canDeactivate throws synchronous exception
    it("should catch synchronous exception from canDeactivate", async () => {
      await router.navigate("users");

      // Factory returns function that throws
      const throwingHookFactory = () => () => {
        throw new Error("canDeactivate failed synchronously");
      };

      lifecycle.addDeactivateGuard("users", throwingHookFactory);

      try {
        await router.navigate("index");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any)?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect((error as any)?.message).toBe(
          "canDeactivate failed synchronously",
        );
      }
    });

    it("should catch synchronous exception from middleware", async () => {
      const throwingMiddlewareFactory = () => () => {
        throw new Error("Middleware failed synchronously");
      };

      router.usePlugin(() => ({
        onTransitionSuccess: throwingMiddlewareFactory(),
      }));

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });

    // Test 4: Segment name is preserved in error metadata for lifecycle hooks
    it("should preserve segment name in error metadata for canActivate", async () => {
      const throwingHookFactory = () => () => {
        throw new Error("Hook error");
      };

      lifecycle.addActivateGuard("users", throwingHookFactory);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any).segment).toBe("users");
      }
    });

    // Test 5: Error.cause is preserved (ES2022+)
    it("should preserve Error.cause in metadata", async () => {
      const rootCause = new Error("Root cause");
      const throwingHookFactory = () => () => {
        const error = new Error("Hook error with cause");

        (error as any).cause = rootCause;

        throw error;
      };

      lifecycle.addActivateGuard("users", throwingHookFactory);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any).cause).toBe(rootCause);
        expect((error as any).message).toBe("Hook error with cause");
      }
    });

    // Test 6: Navigation stops on error
    it("should prevent navigation when canActivate throws", async () => {
      const initialState = router.getState();

      const throwingHookFactory = () => () => {
        throw new Error("Navigation blocked");
      };

      lifecycle.addActivateGuard("users", throwingHookFactory);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
        // Router state should not change
        expect(router.getState()).toStrictEqual(initialState);
      }
    });

    // Test 7: Handling plain object instead of Error (canActivate)
    it("should handle plain object thrown from canActivate", async () => {
      const throwingHookFactory = () => () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { custom: "error", code: 42 };
      };

      lifecycle.addActivateGuard("users", throwingHookFactory);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any)?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect((error as any).custom).toBe("error");
        expect((error as any).segment).toBe("users");
      }
    });

    it("should handle plain object thrown from middleware", async () => {
      const throwingMiddlewareFactory = () => () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { custom: "middleware error", data: 123 };
      };

      router.usePlugin(() => ({
        onTransitionSuccess: throwingMiddlewareFactory(),
      }));

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });

    // Test 9: Handling string instead of Error (canDeactivate)
    it("should handle string thrown from canDeactivate", async () => {
      await router.navigate("users");

      const throwingHookFactory = () => () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "String error message";
      };

      lifecycle.addDeactivateGuard("users", throwingHookFactory);

      try {
        await router.navigate("index");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any)?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
        expect((error as any).segment).toBe("users");
      }
    });

    it("should handle number thrown from middleware", async () => {
      const throwingMiddlewareFactory = () => () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 42;
      };

      router.usePlugin(() => ({
        onTransitionSuccess: throwingMiddlewareFactory(),
      }));

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });

    it("should preserve Error.cause in metadata for middleware", async () => {
      const rootCause = new Error("Root cause in middleware");
      const throwingMiddlewareFactory = () => () => {
        const error = new Error("Middleware error with cause");

        (error as any).cause = rootCause;

        throw error;
      };

      router.usePlugin(() => ({
        onTransitionSuccess: throwingMiddlewareFactory(),
      }));

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });
  });
});
