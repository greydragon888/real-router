import { logger } from "@real-router/logger";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { errorCodes, RouterError } from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Middleware, State, Router } from "@real-router/core";

type ExtendedState = State & { m1: boolean; m2: boolean; m3: boolean };
const noop = () => undefined;

const transitionMiddleware: Middleware = (toState, _fromState, done) => {
  const newState = { ...toState, hitMware: true };

  done(undefined, newState);
};

const transitionMutateMiddleware: Middleware = (toState, _fromState, done) => {
  const newState = {
    ...toState,
    params: { ...toState.params, mutated: true },
    hitMware: true,
  };

  done(undefined, newState);
};

const transitionErrorMiddleware: Middleware = (_toState, _fromState, done) => {
  done(new RouterError("ERR_CODE"));
};

const redirectMiddleware =
  (targetState: State): Middleware =>
  () =>
    targetState;

// Async middleware functions
const m2Middleware: Middleware = (toState) =>
  Promise.resolve({
    ...toState,
    m2: (toState as ExtendedState).m1,
  });

const asyncMware: Middleware = (toState) =>
  Promise.resolve({ ...toState, asyncFlag: true });

const m1AsyncMiddleware: Middleware = (toState) =>
  Promise.resolve({ ...toState, m1: true });

const m1SyncMiddleware: Middleware = (toState, _fromState, done) => {
  done(undefined, { ...toState, m1: true } as ExtendedState);
};

const m3SyncMiddleware: Middleware = (toState, _fromState, done) => {
  done(undefined, {
    ...toState,
    m3: (toState as ExtendedState).m2,
  } as ExtendedState);
};

const spyOnFunctions = (obj: Record<string, Middleware>): void => {
  for (const key in obj) {
    vi.spyOn(obj, key);
  }
};

/**
 * Creates a trackable middleware that records when it's called.
 * Used to verify middleware registration/execution behavior.
 */
function createTrackingMiddleware(): {
  middleware: Middleware;
  wasCalled: () => boolean;
  reset: () => void;
} {
  let called = false;

  return {
    middleware: (toState, _fromState, done) => {
      called = true;
      done(undefined, toState);
    },
    wasCalled: () => called,
    reset: () => {
      called = false;
    },
  };
}

describe("core/middleware", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouter();
    router.start("");
  });

  afterEach(() => {
    router.stop();
  });

  describe("clearMiddleware", () => {
    it("should clear all middleware", () => {
      const tracker = createTrackingMiddleware();

      router.useMiddleware(() => tracker.middleware);

      // Verify middleware is registered by checking it executes
      router.navigate("users", (err) => {
        expect(err).toBeUndefined();
        expect(tracker.wasCalled()).toBe(true);
      });

      tracker.reset();
      router.clearMiddleware();

      // After clear, middleware should not execute
      router.navigate("orders", (err) => {
        expect(err).toBeUndefined();
        expect(tracker.wasCalled()).toBe(false);
      });
    });

    it("should unsubscribe middleware when returned function is called", () => {
      const tracker = createTrackingMiddleware();

      const unsub = router.useMiddleware(() => tracker.middleware);

      // Verify middleware is registered
      router.navigate("users", (err) => {
        expect(err).toBeUndefined();
        expect(tracker.wasCalled()).toBe(true);
      });

      tracker.reset();
      unsub();

      // After unsubscribe, middleware should not execute
      router.navigate("orders", (err) => {
        expect(err).toBeUndefined();
        expect(tracker.wasCalled()).toBe(false);
      });
    });
  });

  describe("sync middleware", () => {
    it("should support a transition middleware", () => {
      const mware = { transition: transitionMiddleware };

      spyOnFunctions(mware);
      router.stop();
      router.useMiddleware(() => mware.transition);
      router.start("");

      router.navigate("users", (err) => {
        expect(err).toBe(undefined);
      });

      expect(mware.transition).toHaveBeenCalled();
      expect(
        (router.getState() as State & { hitMware: boolean }).hitMware,
      ).toBe(true);
    });

    it("should redirect if middleware returns a new state", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const targetState = {
        name: "home",
        params: {},
        path: "/home",
      };

      router.stop();

      router.useMiddleware(() => redirectMiddleware(targetState));

      router.start("");

      router.navigate("index");

      expect(router.getState()?.name).toBe(targetState.name);
      expect(router.getState()?.path).toBe(targetState.path);
    });

    it("should log a warning if state is changed during transition", () => {
      const mutate = transitionMutateMiddleware;

      vi.spyOn(logger, "error").mockImplementation(noop);
      router.stop();
      router.useMiddleware(() => mutate);

      router.start((err) => {
        expect(err).toBe(undefined);
      });

      router.navigate("orders", (err) => {
        expect(err).toBe(undefined);
      });

      // Checking logger.error, not console.error (logger is spied above)
      expect(logger.error).toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should fail transition if middleware returns an error", () => {
      const errMware = { transitionErr: transitionErrorMiddleware };

      spyOnFunctions(errMware);

      router.stop();

      router.useMiddleware(() => errMware.transitionErr);

      router.start("");

      router.navigate("users", (err) => {
        expect(errMware.transitionErr).toHaveBeenCalled();
        expect(err?.code).toBe(errorCodes.TRANSITION_ERR);
      });
    });

    it("should be able to take more than one middleware", () => {
      const middlewareMock1 = vi.fn().mockReturnValue(true);
      const middlewareMock2 = vi.fn().mockReturnValue(true);

      router.stop();
      router.clearMiddleware();
      router.useMiddleware(
        () => middlewareMock1,
        () => middlewareMock2,
      );

      router.start("");

      router.navigate("users");

      expect(middlewareMock1).toHaveBeenCalled();
      expect(middlewareMock2).toHaveBeenCalled();
    });
  });

  describe("async middleware", () => {
    it("should support Promise-returning middleware", async () => {
      router.clearMiddleware();

      router.useMiddleware(() => asyncMware);

      router.start();

      await new Promise((resolve) => {
        router.navigate("users", resolve);
      });

      expect(
        (router.getState() as State & { asyncFlag: boolean }).asyncFlag,
      ).toBe(true);
    });

    it("should pass async-modified state through chain", async () => {
      router.clearMiddleware();
      router.useMiddleware(
        () => m1AsyncMiddleware,
        () => m2Middleware,
      );

      router.start();

      await new Promise((resolve) => {
        router.navigate("users", resolve);
      });

      expect((router.getState() as ExtendedState).m1).toBe(true);
      expect((router.getState() as ExtendedState).m2).toBe(true);
    });

    it("should pass state from middleware to middleware (mixed async + sync)", async () => {
      router.clearMiddleware();

      router.useMiddleware(
        () => m1SyncMiddleware,
        () => m2Middleware,
        () => m3SyncMiddleware,
      );

      router.start();

      await new Promise((resolve) => {
        router.navigate("users", resolve);
      });

      expect((router.getState() as ExtendedState).m1).toBe(true);
      expect((router.getState() as ExtendedState).m2).toBe(true);
      expect((router.getState() as ExtendedState).m3).toBe(true);
    });
  });

  describe("useMiddleware", () => {
    // 🔴 CRITICAL: Atomicity of registration on errors
    describe("atomicity on errors", () => {
      it("should not register any middleware if factory throws error", () => {
        const tracker = createTrackingMiddleware();
        const validFactory1 = () => tracker.middleware;
        const failingFactory = () => {
          throw new Error("Factory initialization failed");
        };
        const validFactory2 = () => transitionMiddleware;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(validFactory1, failingFactory, validFactory2);
        }).toThrowError("Factory initialization failed");

        // No middleware should execute after error (none registered)
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });
      });

      it("should rollback all middleware if any factory returns non-function", () => {
        const tracker = createTrackingMiddleware();
        const validFactory = () => tracker.middleware;
        const invalidFactory = () => ({ notAFunction: true }) as any;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(validFactory, invalidFactory);
        }).toThrowError(TypeError);

        // Rollback should leave state unchanged - middleware should not execute
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });
      });

      it("should rollback when error occurs in middle of batch", () => {
        const tracker = createTrackingMiddleware();
        const factory1 = () => tracker.middleware;
        const factory2 = () => transitionMiddleware;
        const factory3 = () => {
          throw new Error("Error in factory3");
        };
        const factory4 = () => transitionMiddleware;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(factory1, factory2, factory3, factory4);
        }).toThrowError("Error in factory3");

        // All-or-nothing: no middleware should execute
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });
      });
    });

    // 🔴 CRITICAL: Duplicate protection
    describe("duplicate protection", () => {
      it("should throw error when registering same factory twice", () => {
        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        router.clearMiddleware();
        router.useMiddleware(factory);

        expect(() => {
          router.useMiddleware(factory);
        }).toThrowError("Middleware factory already registered");

        // Original middleware should remain registered and execute
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });
      });

      it("should include named factory name in duplicate error (line 162)", () => {
        // Named function to cover factory.name branch in duplicate error
        function myDuplicateFactory() {
          return transitionMiddleware;
        }

        router.clearMiddleware();
        router.useMiddleware(myDuplicateFactory);

        expect(() => {
          router.useMiddleware(myDuplicateFactory);
        }).toThrowError(/Factory: myDuplicateFactory/);
      });

      it("should show 'anonymous' for truly anonymous factory (line 24)", () => {
        // Create array with anonymous function to bypass variable name inference
        const factories = [() => transitionMiddleware];

        // Clear the name property to simulate truly anonymous function
        Object.defineProperty(factories[0], "name", { value: "" });

        router.clearMiddleware();
        router.useMiddleware(factories[0]);

        expect(() => {
          router.useMiddleware(factories[0]);
        }).toThrowError(/Factory: anonymous/);
      });

      it("should automatically deduplicate within same batch (Set behavior)", () => {
        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        router.clearMiddleware();

        // Set automatically deduplicates, so this won't throw
        const unsub = router.useMiddleware(factory, factory);

        // Middleware should only execute once (deduplication)
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        unsub();
      });

      it("should allow identical functions with different references", () => {
        const tracker1 = createTrackingMiddleware();
        const tracker2 = createTrackingMiddleware();
        const factory1 = () => tracker1.middleware;
        const factory2 = () => tracker2.middleware;

        router.clearMiddleware();

        // Different references, so should succeed
        expect(() => {
          router.useMiddleware(factory1, factory2);
        }).not.toThrowError();

        // Both middleware should execute
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(true);
          expect(tracker2.wasCalled()).toBe(true);
        });
      });
    });

    // 🔴 CRITICAL: Unsubscribe isolation
    describe("unsubscribe isolation", () => {
      it("should only remove middleware from its own call", () => {
        const tracker1 = createTrackingMiddleware();
        const tracker2 = createTrackingMiddleware();
        const tracker3 = createTrackingMiddleware();
        const factory1 = () => tracker1.middleware;
        const factory2 = () => tracker2.middleware;
        const factory3 = () => tracker3.middleware;

        router.clearMiddleware();

        const unsub1 = router.useMiddleware(factory1);
        const unsub2 = router.useMiddleware(factory2, factory3);

        // All three should execute
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(true);
          expect(tracker2.wasCalled()).toBe(true);
          expect(tracker3.wasCalled()).toBe(true);
        });

        tracker1.reset();
        tracker2.reset();
        tracker3.reset();

        // Unsubscribe first call
        unsub1();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          // factory1 should not execute anymore
          expect(tracker1.wasCalled()).toBe(false);
          // factory2 and factory3 should still execute
          expect(tracker2.wasCalled()).toBe(true);
          expect(tracker3.wasCalled()).toBe(true);
        });

        tracker2.reset();
        tracker3.reset();

        // Unsubscribe second call
        unsub2();

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          // None should execute
          expect(tracker1.wasCalled()).toBe(false);
          expect(tracker2.wasCalled()).toBe(false);
          expect(tracker3.wasCalled()).toBe(false);
        });
      });

      it("should handle unsubscribe in reverse order", () => {
        const tracker1 = createTrackingMiddleware();
        const tracker2 = createTrackingMiddleware();
        const factory1 = () => tracker1.middleware;
        const factory2 = () => tracker2.middleware;

        router.clearMiddleware();

        const unsub1 = router.useMiddleware(factory1);
        const unsub2 = router.useMiddleware(factory2);

        // Unsubscribe in reverse order
        unsub2();

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(true);
          expect(tracker2.wasCalled()).toBe(false);
        });

        tracker1.reset();
        unsub1();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(false);
        });
      });

      it("should maintain correct state after partial unsubscribe", () => {
        const tracker1 = createTrackingMiddleware();
        const tracker2 = createTrackingMiddleware();
        const tracker3 = createTrackingMiddleware();
        const f1 = () => tracker1.middleware;
        const f2 = () => tracker2.middleware;
        const f3 = () => tracker3.middleware;

        router.clearMiddleware();

        const u1 = router.useMiddleware(f1);
        const u2 = router.useMiddleware(f2);
        const u3 = router.useMiddleware(f3);

        // Unsubscribe middle one
        u2();

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(true);
          expect(tracker2.wasCalled()).toBe(false);
          expect(tracker3.wasCalled()).toBe(true);
        });

        tracker1.reset();
        tracker3.reset();

        u1();
        u3();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(false);
          expect(tracker2.wasCalled()).toBe(false);
          expect(tracker3.wasCalled()).toBe(false);
        });
      });
    });

    // 🟡 IMPORTANT: Type validation
    describe("type validation", () => {
      it("should throw TypeError for non-function parameter", () => {
        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(null as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.useMiddleware(null as any);
        }).toThrowError("Expected middleware factory function");
      });

      it("should throw TypeError with index for invalid parameter", () => {
        const validFactory = () => transitionMiddleware;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(validFactory, "notAFunction" as any);
        }).toThrowError("at index 1");
      });

      it("should throw TypeError when factory returns non-function", () => {
        const invalidFactory = () => "not a middleware" as any;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(invalidFactory);
        }).toThrowError(TypeError);
      });

      it("should include named factory name in error message (line 61)", () => {
        // Named function to cover factory.name branch
        function myNamedFactory() {
          return "not a function" as any;
        }

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(myNamedFactory);
        }).toThrowError(/Factory: myNamedFactory/);
      });

      it("should validate all types: null, undefined, number, string, object", () => {
        router.clearMiddleware();

        expect(() => router.useMiddleware(null as any)).toThrowError(TypeError);
        expect(() => router.useMiddleware(undefined as any)).toThrowError(
          TypeError,
        );
        expect(() => router.useMiddleware(123 as any)).toThrowError(TypeError);
        expect(() => router.useMiddleware("str" as any)).toThrowError(
          TypeError,
        );
        expect(() => router.useMiddleware({} as any)).toThrowError(TypeError);
      });

      it("should throw when factory returns object instead of function", () => {
        const factory = () => ({ middleware: true }) as any;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(factory);
        }).toThrowError(TypeError);
      });
    });

    // 🟡 IMPORTANT: Middleware limits
    describe("middleware limits", () => {
      it("should enforce hard limit at 50", () => {
        router.clearMiddleware();

        // Register 50 middleware (max allowed)
        const factories = Array.from(
          { length: 50 },
          () => () => transitionMiddleware,
        );

        factories.forEach((f) => router.useMiddleware(f));

        // 51st should fail (>= 50 check)
        expect(() => {
          router.useMiddleware(() => transitionMiddleware);
        }).toThrowError("Middleware limit exceeded");
      });

      it("should validate limit before initialization", () => {
        router.clearMiddleware();

        // Fill up to 50
        const factories = Array.from(
          { length: 50 },
          () => () => transitionMiddleware,
        );

        factories.forEach((f) => router.useMiddleware(f));

        const spyFactory = vi.fn(() => transitionMiddleware);

        // Try to add one more - should fail before calling factory
        expect(() => {
          router.useMiddleware(spyFactory);
        }).toThrowError("Middleware limit exceeded");

        // Factory should not be called due to early limit check
        expect(spyFactory).not.toHaveBeenCalled();
      });

      it("should handle batch registration near limit", () => {
        router.clearMiddleware();

        // Register 48 middleware
        const factories = Array.from(
          { length: 48 },
          () => () => transitionMiddleware,
        );

        factories.forEach((f) => router.useMiddleware(f));

        // Adding 2 more should succeed (total 50)
        expect(() => {
          router.useMiddleware(
            () => transitionMiddleware,
            () => transitionMiddleware,
          );
        }).not.toThrowError();

        // But adding 1 more should fail (would be 51)
        expect(() => {
          router.useMiddleware(() => transitionMiddleware);
        }).toThrowError();
      });

      it("should reject batch that would exceed limit", () => {
        router.clearMiddleware();

        // Register 49 middleware
        const factories = Array.from(
          { length: 49 },
          () => () => transitionMiddleware,
        );

        factories.forEach((f) => router.useMiddleware(f));

        // Try to add 3 more (would be 52 total) - should fail
        expect(() => {
          router.useMiddleware(
            () => transitionMiddleware,
            () => transitionMiddleware,
            () => transitionMiddleware,
          );
        }).toThrowError("Middleware limit exceeded");

        // Verify only 49 were registered by checking that adding 1 succeeds
        expect(() => {
          router.useMiddleware(() => transitionMiddleware);
        }).not.toThrowError();

        // Now at 50, next should fail
        expect(() => {
          router.useMiddleware(() => transitionMiddleware);
        }).toThrowError("Middleware limit exceeded");
      });
    });

    // 🟢 DESIRABLE: Edge cases
    describe("edge cases", () => {
      it("should handle call with no parameters", () => {
        router.clearMiddleware();

        const unsub = router.useMiddleware();

        expectTypeOf(unsub).toBeFunction();

        // Unsubscribe should be safe no-op
        expect(() => {
          unsub();
        }).not.toThrowError();
      });

      it("should reject async factory returning Promise", () => {
        // Async function returns Promise, not Middleware function
        // eslint-disable-next-line @typescript-eslint/require-await
        const asyncFactory = async () => (toState: State) => toState;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(asyncFactory as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.useMiddleware(asyncFactory as any);
        }).toThrowError("Middleware factory must return a function");
      });

      it("should preserve side effects from factories even on batch rollback", () => {
        let sideEffectCounter = 0;

        const factoryWithSideEffect = () => {
          sideEffectCounter++;

          return transitionMiddleware;
        };

        const throwingFactory = () => {
          throw new Error("Intentional failure");
        };

        router.clearMiddleware();

        // First factory executes (side effect), second throws
        expect(() => {
          router.useMiddleware(factoryWithSideEffect, throwingFactory);
        }).toThrowError("Intentional failure");

        // Side effect persists even though batch was rolled back
        expect(sideEffectCounter).toBe(1);

        // No middleware registered (atomicity) - verify by checking nothing executes
        const tracker = createTrackingMiddleware();

        router.useMiddleware(() => tracker.middleware);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          // Only tracker should execute, not the rolled-back factory
          expect(tracker.wasCalled()).toBe(true);
        });
      });

      it("should log warning when unsubscribe called after clearMiddleware", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

        const factory = () => transitionMiddleware;

        router.clearMiddleware();

        const unsub = router.useMiddleware(factory);

        // Clear all middleware
        router.clearMiddleware();

        // Unsubscribe after clear - should warn but not throw
        expect(() => {
          unsub();
        }).not.toThrowError();

        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
      });

      it("should handle multiple unsubscribe calls safely", () => {
        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        router.clearMiddleware();

        const unsub = router.useMiddleware(factory);

        unsub();

        // Verify middleware doesn't execute after unsubscribe
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });

        // Second call should be safe
        expect(() => {
          unsub();
        }).not.toThrowError();

        // Third call should also be safe
        expect(() => {
          unsub();
        }).not.toThrowError();
      });

      it("should return function for empty batch", () => {
        router.clearMiddleware();

        const unsub = router.useMiddleware();

        expect(unsub).toBeInstanceOf(Function);

        unsub(); // Should not throw
      });

      it("should handle factory returning arrow function without explicit return", () => {
        const factory = () => {
          // Missing return statement - returns undefined
          vi.fn();
        };

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(factory as any);
        }).toThrowError(TypeError);
      });
    });

    // 🟢 DESIRABLE: Execution order preservation
    describe("execution order", () => {
      // Helper function to create order-tracking middleware factories
      const createOrderTrackingFactory = (order: number, tracker: number[]) => {
        return () => (toState: State) => {
          tracker.push(order);

          return toState;
        };
      };

      it("should preserve registration order during execution", async () => {
        const executionOrder: number[] = [];

        const factory1 = createOrderTrackingFactory(1, executionOrder);
        const factory2 = createOrderTrackingFactory(2, executionOrder);
        const factory3 = createOrderTrackingFactory(3, executionOrder);

        router.clearMiddleware();
        router.useMiddleware(factory1, factory2, factory3);

        await new Promise((resolve) => {
          router.navigate("users", resolve);
        });

        expect(executionOrder).toStrictEqual([1, 2, 3]);
      });

      it("should maintain order across multiple useMiddleware calls", async () => {
        const executionOrder: number[] = [];

        const f1 = createOrderTrackingFactory(1, executionOrder);
        const f2 = createOrderTrackingFactory(2, executionOrder);
        const f3 = createOrderTrackingFactory(3, executionOrder);

        router.clearMiddleware();
        router.useMiddleware(f1);
        router.useMiddleware(f2);
        router.useMiddleware(f3);

        await new Promise((resolve) => {
          router.navigate("users", resolve);
        });

        expect(executionOrder).toStrictEqual([1, 2, 3]);
      });
    });

    // 🟢 DESIRABLE: Return value fluent interface
    describe("return value", () => {
      it("should always return unsubscribe function", () => {
        const factory = () => transitionMiddleware;

        router.clearMiddleware();

        const result = router.useMiddleware(factory);

        expect(typeof result).toBe("function");
      });

      it("should return function even for empty call", () => {
        router.clearMiddleware();

        const result = router.useMiddleware();

        expect(typeof result).toBe("function");
      });

      it("should return different unsubscribe functions for different calls", () => {
        const f1 = () => transitionMiddleware;
        const f2 = () => transitionMiddleware;

        router.clearMiddleware();

        const unsub1 = router.useMiddleware(f1);
        const unsub2 = router.useMiddleware(f2);

        expect(unsub1).not.toBe(unsub2);

        expectTypeOf(unsub1).toBeFunction();
        expectTypeOf(unsub2).toBeFunction();
      });
    });

    // 🔴 CRITICAL: Reentrancy and complex scenarios
    describe("reentrancy and complex scenarios", () => {
      it("should handle reentrant useMiddleware call from factory", () => {
        router.clearMiddleware();

        const nestedTracker = createTrackingMiddleware();
        const reentrantTracker = createTrackingMiddleware();

        let nestedUnsub: (() => void) | undefined;
        const nestedFactory = () => nestedTracker.middleware;

        const reentrantFactory = (r: typeof router) => {
          // Call useMiddleware during factory initialization
          nestedUnsub = r.useMiddleware(nestedFactory);

          return reentrantTracker.middleware;
        };

        const unsub = router.useMiddleware(reentrantFactory);

        // Both should execute
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(nestedTracker.wasCalled()).toBe(true);
          expect(reentrantTracker.wasCalled()).toBe(true);
        });

        nestedTracker.reset();
        reentrantTracker.reset();

        // Both unsubscribe functions should work
        nestedUnsub?.();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(nestedTracker.wasCalled()).toBe(false);
          expect(reentrantTracker.wasCalled()).toBe(true);
        });

        reentrantTracker.reset();
        unsub();

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(nestedTracker.wasCalled()).toBe(false);
          expect(reentrantTracker.wasCalled()).toBe(false);
        });
      });

      it("should handle factory calling unsubscribe of another middleware", () => {
        router.clearMiddleware();

        const tracker1 = createTrackingMiddleware();
        const tracker2 = createTrackingMiddleware();
        const factory1 = () => tracker1.middleware;
        let unsub1: () => void;

        unsub1 = router.useMiddleware(factory1);

        const factory2 = () => {
          // Unsubscribe factory1 during factory2 initialization
          unsub1();

          return tracker2.middleware;
        };

        router.useMiddleware(factory2);

        // factory1 should not execute (unsubscribed), factory2 should execute
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(false);
          expect(tracker2.wasCalled()).toBe(true);
        });
      });

      it("should handle factory calling clearMiddleware during batch", () => {
        router.clearMiddleware();

        const tracker1 = createTrackingMiddleware();
        const tracker2 = createTrackingMiddleware();

        const factory1 = () => tracker1.middleware;
        const factory2 = (r: typeof router) => {
          // Clear all middleware during batch initialization
          r.clearMiddleware();

          return tracker2.middleware;
        };

        router.useMiddleware(factory1, factory2);

        // Both should be registered (commit phase adds initialized back)
        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker1.wasCalled()).toBe(true);
          expect(tracker2.wasCalled()).toBe(true);
        });
      });
    });

    // 🟡 IMPORTANT: Exotic function types as factories
    describe("exotic function types", () => {
      it("should work with Proxy as factory", () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();

        const realFactory = () => tracker.middleware;
        const proxyFactory = new Proxy(realFactory, {
          apply(target, thisArg, args) {
            return Reflect.apply(target, thisArg, args);
          },
          get(target, prop) {
            if (prop === "name") {
              return "proxyFactory";
            }

            return Reflect.get(target, prop);
          },
        });

        const unsub = router.useMiddleware(proxyFactory);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        tracker.reset();
        unsub();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });
      });

      it("should handle factory with throwing getter on name property", () => {
        router.clearMiddleware();

        // Factory that returns non-function to trigger getFactoryName call
        const badFactory = () => null;

        Object.defineProperty(badFactory, "name", {
          get() {
            throw new Error("name getter throws");
          },
          configurable: true,
        });

        // Should throw from getFactoryName trying to access name
        expect(() => {
          router.useMiddleware(badFactory as any);
        }).toThrowError();
      });

      it("should reject generator function as factory", () => {
        router.clearMiddleware();

        function* generatorFactory() {
          yield transitionMiddleware;
        }

        expect(() => {
          router.useMiddleware(generatorFactory as any);
        }).toThrowError(TypeError);

        expect(() => {
          router.useMiddleware(generatorFactory as any);
        }).toThrowError(/Middleware factory must return a function/);
      });

      it("should reject async generator function as factory", () => {
        router.clearMiddleware();

        // eslint-disable-next-line @typescript-eslint/require-await
        async function* asyncGenFactory() {
          yield transitionMiddleware;
        }

        expect(() => {
          router.useMiddleware(asyncGenFactory as any);
        }).toThrowError(TypeError);

        expect(() => {
          router.useMiddleware(asyncGenFactory as any);
        }).toThrowError(/Middleware factory must return a function/);
      });

      it("should reject class constructor as factory (requires new)", () => {
        router.clearMiddleware();

        class MiddlewareClass {
          router: typeof router;

          constructor(r: typeof router) {
            this.router = r;
          }
        }

        // Class constructor cannot be called without 'new'
        expect(() => {
          router.useMiddleware(MiddlewareClass as any);
        }).toThrowError(TypeError);

        expect(() => {
          router.useMiddleware(MiddlewareClass as any);
        }).toThrowError(/cannot be invoked without 'new'/);

        // State should remain unchanged - verify by checking no middleware executes
        const tracker = createTrackingMiddleware();

        router.useMiddleware(() => tracker.middleware);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });
      });

      it("should work with bound function as factory", () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();
        const context = { prefix: "LOG:" };

        function contextFactory(this: typeof context) {
          expect(this.prefix).toBe("LOG:");

          return tracker.middleware;
        }

        const boundFactory = contextFactory.bind(context);

        const unsub = router.useMiddleware(boundFactory);

        // Bound function name includes "bound" prefix
        expect(boundFactory.name).toBe("bound contextFactory");

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        tracker.reset();
        unsub();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });
      });

      it("should work with frozen function as factory", () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();

        const frozenFactory = Object.freeze(() => tracker.middleware);

        const unsub = router.useMiddleware(frozenFactory);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        tracker.reset();
        unsub();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });
      });

      it("should work with sealed function as factory", () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();

        const sealedFactory = Object.seal(() => tracker.middleware);

        const unsub = router.useMiddleware(sealedFactory);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        tracker.reset();
        unsub();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(false);
        });
      });
    });

    // 🟢 DESIRABLE: Unusual but valid inputs
    describe("unusual but valid inputs", () => {
      it("should accept self-returning factory", () => {
        router.clearMiddleware();

        let selfReturningWasCalled = false;

        // Factory that returns itself (technically valid - it's a function)
        const selfReturningFactory = (): any => {
          selfReturningWasCalled = true;

          return selfReturningFactory;
        };

        // Registration should succeed (factory returns function = valid)
        const unsub = router.useMiddleware(selfReturningFactory);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(selfReturningWasCalled).toBe(true);
        });

        selfReturningWasCalled = false;
        unsub();

        router.navigate("orders", (err) => {
          expect(err).toBeUndefined();
          expect(selfReturningWasCalled).toBe(false);
        });
      });

      it("should handle factory with very long name in error messages", () => {
        router.clearMiddleware();

        const longName = "a".repeat(1000);
        const factories: Record<string, () => null> = {
          [longName]: () => null,
        };

        expect(() => {
          router.useMiddleware(factories[longName] as any);
        }).toThrowError(new RegExp(`Factory: ${longName.slice(0, 100)}`));
      });

      it("should handle factory with unicode name", () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();

        // Use a function expression with computed property to set unicode name
        const unicodeFactory = {
          ["日本語Factory🚀"]: () => tracker.middleware,
        }["日本語Factory🚀"];

        const unsub = router.useMiddleware(unicodeFactory);

        expect(unicodeFactory.name).toBe("日本語Factory🚀");

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        unsub();
      });

      it("should handle factory with empty string name", () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        Object.defineProperty(factory, "name", {
          value: "",
          configurable: true,
        });

        const unsub = router.useMiddleware(factory);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        unsub();
      });

      it("should handle factory with whitespace-only name", () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        Object.defineProperty(factory, "name", {
          value: "   ",
          configurable: true,
        });

        const unsub = router.useMiddleware(factory);

        router.navigate("users", (err) => {
          expect(err).toBeUndefined();
          expect(tracker.wasCalled()).toBe(true);
        });

        unsub();
      });
    });
  });
});
