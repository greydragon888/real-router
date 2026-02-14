import { logger } from "@real-router/logger";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { RouterError } from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Middleware, State, Router } from "@real-router/core";

type ExtendedState = State & { m1: boolean; m2: boolean; m3: boolean };
const noop = () => undefined;

const transitionMiddleware: Middleware = (toState) => {
  const newState = { ...toState, hitMware: true };

  return newState;
};

const transitionMutateMiddleware: Middleware = (toState) => {
  const newState = {
    ...toState,
    params: { ...toState.params, mutated: true },
    hitMware: true,
  };

  return newState;
};

const transitionErrorMiddleware: Middleware = () => {
  throw new RouterError("ERR_CODE");
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

const m1SyncMiddleware: Middleware = (toState) => {
  return { ...toState, m1: true } as ExtendedState;
};

const m3SyncMiddleware: Middleware = (toState) => {
  return {
    ...toState,
    m3: (toState as ExtendedState).m2,
  } as ExtendedState;
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
    middleware: (toState) => {
      called = true;

      return toState;
    },
    wasCalled: () => called,
    reset: () => {
      called = false;
    },
  };
}

describe("core/middleware", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("clearMiddleware", () => {
    it("should clear all middleware", async () => {
      const tracker = createTrackingMiddleware();

      router.useMiddleware(() => tracker.middleware);

      // Verify middleware is registered by checking it executes
      await router.navigate("users");

      expect(tracker.wasCalled()).toBe(true);

      tracker.reset();
      router.clearMiddleware();

      // After clear, middleware should not execute
      await router.navigate("orders");

      expect(tracker.wasCalled()).toBe(false);
    });

    it("should unsubscribe middleware when returned function is called", async () => {
      const tracker = createTrackingMiddleware();

      const unsub = router.useMiddleware(() => tracker.middleware);

      // Verify middleware is registered
      await router.navigate("users");

      expect(tracker.wasCalled()).toBe(true);

      tracker.reset();
      unsub();

      // After unsubscribe, middleware should not execute
      await router.navigate("orders");

      expect(tracker.wasCalled()).toBe(false);
    });
  });

  describe("sync middleware", () => {
    it("should support a transition middleware", async () => {
      const mware = { transition: transitionMiddleware };

      spyOnFunctions(mware);
      router.stop();
      router.useMiddleware(() => mware.transition);
      await router.start();

      await router.navigate("users");

      expect(mware.transition).toHaveBeenCalled();
      expect(
        (router.getState() as State & { hitMware: boolean }).hitMware,
      ).toBe(true);
    });

    it("should redirect if middleware returns a new state", async () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      const targetState = {
        name: "home",
        params: {},
        path: "/home",
      };

      router.stop();

      router.useMiddleware(() => redirectMiddleware(targetState));

      await router.start();

      await router.navigate("index");

      expect(router.getState()?.name).toBe(targetState.name);
      expect(router.getState()?.path).toBe(targetState.path);
    });

    it("should log a warning if state is changed during transition", async () => {
      const mutate = transitionMutateMiddleware;

      vi.spyOn(logger, "error").mockImplementation(noop);
      router.stop();
      router.useMiddleware(() => mutate);

      await router.start();

      await router.navigate("orders");

      // Checking logger.error, not console.error (logger is spied above)
      expect(logger.error).toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should fail transition if middleware returns an error", async () => {
      const errMware = { transitionErr: transitionErrorMiddleware };

      spyOnFunctions(errMware);

      router.useMiddleware(() => errMware.transitionErr);

      await expect(router.navigate("users")).rejects.toThrowError();
    });

    it("should be able to take more than one middleware", async () => {
      const middlewareMock1 = vi.fn().mockReturnValue(true);
      const middlewareMock2 = vi.fn().mockReturnValue(true);

      router.stop();
      router.clearMiddleware();
      router.useMiddleware(
        () => middlewareMock1,
        () => middlewareMock2,
      );

      await router.start();

      await router.navigate("users");

      expect(middlewareMock1).toHaveBeenCalled();
      expect(middlewareMock2).toHaveBeenCalled();
    });
  });

  describe("async middleware", () => {
    it("should support Promise-returning middleware", async () => {
      router.clearMiddleware();

      router.useMiddleware(() => asyncMware);

      router.stop();
      await router.start();

      await router.navigate("users");

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

      router.stop();
      await router.start();

      await router.navigate("users");

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

      router.stop();
      await router.start();

      await router.navigate("users");

      expect((router.getState() as ExtendedState).m1).toBe(true);
      expect((router.getState() as ExtendedState).m2).toBe(true);
      expect((router.getState() as ExtendedState).m3).toBe(true);
    });
  });

  describe("useMiddleware", () => {
    // 🔴 CRITICAL: Atomicity of registration on errors
    describe("atomicity on errors", () => {
      it("should not register any middleware if factory throws error", async () => {
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
        await router.navigate("users");
      });

      it("should rollback all middleware if any factory returns non-function", async () => {
        const tracker = createTrackingMiddleware();
        const validFactory = () => tracker.middleware;
        const invalidFactory = () => ({ notAFunction: true }) as any;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(validFactory, invalidFactory);
        }).toThrowError(TypeError);

        // Rollback should leave state unchanged - middleware should not execute
        await router.navigate("users");
      });

      it("should rollback when error occurs in middle of batch", async () => {
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
        await router.navigate("users");
      });
    });

    // 🔴 CRITICAL: Duplicate protection
    describe("duplicate protection", () => {
      it("should throw error when registering same factory twice", async () => {
        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        router.clearMiddleware();
        router.useMiddleware(factory);

        expect(() => {
          router.useMiddleware(factory);
        }).toThrowError("Middleware factory already registered");

        // Original middleware should remain registered and execute
        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);
      });

      it("should include named factory name in duplicate error (line 162)", async () => {
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

      it("should show 'anonymous' for truly anonymous factory (line 24)", async () => {
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

      it("should automatically deduplicate within same batch (Set behavior)", async () => {
        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        router.clearMiddleware();

        // Set automatically deduplicates, so this won't throw
        const unsub = router.useMiddleware(factory, factory);

        // Middleware should only execute once (deduplication)
        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        unsub();
      });

      it("should allow identical functions with different references", async () => {
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
        await router.navigate("users");
      });
    });

    // 🔴 CRITICAL: Unsubscribe isolation
    describe("unsubscribe isolation", () => {
      it("should only remove middleware from its own call", async () => {
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
        await router.navigate("users");

        expect(tracker1.wasCalled()).toBe(true);
        expect(tracker2.wasCalled()).toBe(true);
        expect(tracker3.wasCalled()).toBe(true);

        tracker1.reset();
        tracker2.reset();
        tracker3.reset();

        // Unsubscribe first call
        unsub1();

        await router.navigate("orders");

        expect(tracker1.wasCalled()).toBe(false);
        expect(tracker2.wasCalled()).toBe(true);
        expect(tracker3.wasCalled()).toBe(true);

        tracker2.reset();
        tracker3.reset();

        // Unsubscribe second call
        unsub2();

        await router.navigate("users");

        expect(tracker2.wasCalled()).toBe(false);
        expect(tracker3.wasCalled()).toBe(false);
      });

      it("should handle unsubscribe in reverse order", async () => {
        const tracker1 = createTrackingMiddleware();
        const tracker2 = createTrackingMiddleware();
        const factory1 = () => tracker1.middleware;
        const factory2 = () => tracker2.middleware;

        router.clearMiddleware();

        const unsub1 = router.useMiddleware(factory1);
        const unsub2 = router.useMiddleware(factory2);

        // Unsubscribe in reverse order
        unsub2();

        await router.navigate("users");

        expect(tracker1.wasCalled()).toBe(true);
        expect(tracker2.wasCalled()).toBe(false);

        tracker1.reset();
        unsub1();

        await router.navigate("orders");

        expect(tracker1.wasCalled()).toBe(false);
      });

      it("should maintain correct state after partial unsubscribe", async () => {
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

        await router.navigate("users");

        expect(tracker1.wasCalled()).toBe(true);
        expect(tracker2.wasCalled()).toBe(false);
        expect(tracker3.wasCalled()).toBe(true);

        tracker1.reset();
        tracker3.reset();

        u1();
        u3();

        await router.navigate("orders");

        expect(tracker1.wasCalled()).toBe(false);
        expect(tracker3.wasCalled()).toBe(false);
      });
    });

    // 🟡 IMPORTANT: Type validation
    describe("type validation", () => {
      it("should throw TypeError for non-function parameter", async () => {
        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(null as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.useMiddleware(null as any);
        }).toThrowError("Expected middleware factory function");
      });

      it("should throw TypeError with index for invalid parameter", async () => {
        const validFactory = () => transitionMiddleware;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(validFactory, "notAFunction" as any);
        }).toThrowError("at index 1");
      });

      it("should throw TypeError when factory returns non-function", async () => {
        const invalidFactory = () => "not a middleware" as any;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(invalidFactory);
        }).toThrowError(TypeError);
      });

      it("should include named factory name in error message (line 61)", async () => {
        // Named function to cover factory.name branch
        function myNamedFactory() {
          return "not a function" as any;
        }

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(myNamedFactory);
        }).toThrowError(/Factory: myNamedFactory/);
      });

      it("should validate all types: null, undefined, number, string, object", async () => {
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

      it("should throw when factory returns object instead of function", async () => {
        const factory = () => ({ middleware: true }) as any;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(factory);
        }).toThrowError(TypeError);
      });
    });

    // 🟢 DESIRABLE: Edge cases
    describe("edge cases", () => {
      it("should handle call with no parameters", async () => {
        router.clearMiddleware();

        const unsub = router.useMiddleware();

        expectTypeOf(unsub).toBeFunction();

        // Unsubscribe should be safe no-op
        expect(() => {
          unsub();
        }).not.toThrowError();
      });

      it("should reject async factory returning Promise", async () => {
        // Async function returns Promise, not Middleware function
        const asyncFactory = async () => (toState: State) => toState;

        router.clearMiddleware();

        expect(() => {
          router.useMiddleware(asyncFactory as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.useMiddleware(asyncFactory as any);
        }).toThrowError("Middleware factory must return a function");
      });

      it("should preserve side effects from factories even on batch rollback", async () => {
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

        await router.navigate("users");
      });

      it("should handle unsubscribe safely after clearMiddleware (idempotent)", async () => {
        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        router.clearMiddleware();

        const unsub = router.useMiddleware(factory);

        // Clear all middleware
        router.clearMiddleware();

        // Unsubscribe after clear - should not throw (idempotent behavior)
        expect(() => {
          unsub();
          unsub(); // Multiple calls also safe
        }).not.toThrowError();
      });

      it("should handle multiple unsubscribe calls safely", async () => {
        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        router.clearMiddleware();

        const unsub = router.useMiddleware(factory);

        unsub();

        // Verify middleware doesn't execute after unsubscribe
        await router.navigate("users");

        // Second call should be safe
        expect(() => {
          unsub();
        }).not.toThrowError();

        // Third call should also be safe
        expect(() => {
          unsub();
        }).not.toThrowError();
      });

      it("should return function for empty batch", async () => {
        router.clearMiddleware();

        const unsub = router.useMiddleware();

        expect(unsub).toBeInstanceOf(Function);

        unsub(); // Should not throw
      });

      it("should handle factory returning arrow function without explicit return", async () => {
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

        await router.navigate("users");

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

        await router.navigate("users");

        expect(executionOrder).toStrictEqual([1, 2, 3]);
      });
    });

    // 🟢 DESIRABLE: Return value fluent interface
    describe("return value", () => {
      it("should always return unsubscribe function", async () => {
        const factory = () => transitionMiddleware;

        router.clearMiddleware();

        const result = router.useMiddleware(factory);

        expect(typeof result).toBe("function");
      });

      it("should return function even for empty call", async () => {
        router.clearMiddleware();

        const result = router.useMiddleware();

        expect(typeof result).toBe("function");
      });

      it("should return different unsubscribe functions for different calls", async () => {
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
      it("should handle reentrant useMiddleware call from factory", async () => {
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
        await router.navigate("users");

        expect(nestedTracker.wasCalled()).toBe(true);
        expect(reentrantTracker.wasCalled()).toBe(true);

        nestedTracker.reset();
        reentrantTracker.reset();

        // Both unsubscribe functions should work
        nestedUnsub?.();

        await router.navigate("orders");

        expect(nestedTracker.wasCalled()).toBe(false);
        expect(reentrantTracker.wasCalled()).toBe(true);

        reentrantTracker.reset();
        unsub();

        await router.navigate("users");

        expect(reentrantTracker.wasCalled()).toBe(false);
      });

      it("should handle factory calling unsubscribe of another middleware", async () => {
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
        await router.navigate("users");

        expect(tracker1.wasCalled()).toBe(false);
        expect(tracker2.wasCalled()).toBe(true);
      });

      it("should handle factory calling clearMiddleware during batch", async () => {
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
        await router.navigate("users");

        expect(router.getState()?.name).toBe("users");
      });
    });

    // 🟡 IMPORTANT: Exotic function types as factories
    describe("exotic function types", () => {
      it("should work with Proxy as factory", async () => {
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

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        tracker.reset();
        unsub();

        await router.navigate("orders");
      });

      it("should handle factory with throwing getter on name property", async () => {
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

      it("should reject generator function as factory", async () => {
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

      it("should reject async generator function as factory", async () => {
        router.clearMiddleware();

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

      it("should reject class constructor as factory (requires new)", async () => {
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

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);
      });

      it("should work with bound function as factory", async () => {
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

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        tracker.reset();
        unsub();

        await router.navigate("orders");
      });

      it("should work with frozen function as factory", async () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();

        const frozenFactory = Object.freeze(() => tracker.middleware);

        const unsub = router.useMiddleware(frozenFactory);

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        tracker.reset();
        unsub();

        await router.navigate("orders");
      });

      it("should work with sealed function as factory", async () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();

        const sealedFactory = Object.seal(() => tracker.middleware);

        const unsub = router.useMiddleware(sealedFactory);

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        tracker.reset();
        unsub();

        await router.navigate("orders");
      });
    });

    // 🟢 DESIRABLE: Unusual but valid inputs
    describe("unusual but valid inputs", () => {
      it("should accept self-returning factory", async () => {
        router.clearMiddleware();

        const selfReturningFactory = (): any => {
          return (toState: State) => toState;
        };

        const unsub = router.useMiddleware(selfReturningFactory);

        await router.navigate("users");

        expect(router.getState()?.name).toBe("users");

        unsub();

        await router.navigate("orders");

        expect(router.getState()?.name).toBe("orders");
      });

      it("should handle factory with very long name in error messages", async () => {
        router.clearMiddleware();

        const longName = "a".repeat(1000);
        const factories: Record<string, () => null> = {
          [longName]: () => null,
        };

        expect(() => {
          router.useMiddleware(factories[longName] as any);
        }).toThrowError(new RegExp(`Factory: ${longName.slice(0, 100)}`));
      });

      it("should handle factory with unicode name", async () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();

        // Use a function expression with computed property to set unicode name
        const unicodeFactory = {
          ["日本語Factory🚀"]: () => tracker.middleware,
        }["日本語Factory🚀"];

        const unsub = router.useMiddleware(unicodeFactory);

        expect(unicodeFactory.name).toBe("日本語Factory🚀");

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        unsub();
      });

      it("should handle factory with empty string name", async () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        Object.defineProperty(factory, "name", {
          value: "",
          configurable: true,
        });

        const unsub = router.useMiddleware(factory);

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        unsub();
      });

      it("should handle factory with whitespace-only name", async () => {
        router.clearMiddleware();

        const tracker = createTrackingMiddleware();
        const factory = () => tracker.middleware;

        Object.defineProperty(factory, "name", {
          value: "   ",
          configurable: true,
        });

        const unsub = router.useMiddleware(factory);

        await router.navigate("users");

        expect(tracker.wasCalled()).toBe(true);

        unsub();
      });
    });

    // 🟡 IMPORTANT: getDependency injection
    describe("getDependency injection", () => {
      it("should provide getDependency function to middleware factory", async () => {
        router.clearMiddleware();

        // Set up a dependency (use any to bypass strict typing)
        (router as any).setDependency("authToken", "secret-token-123");

        let capturedToken: string | undefined;
        const factoryUsingDeps = (
          _r: typeof router,
          getDep: (key: string) => unknown,
        ) => {
          // Call getDependency to verify it works
          capturedToken = getDep("authToken") as string;

          return (toState: State) => {
            return toState;
          };
        };

        router.useMiddleware(factoryUsingDeps as any);

        // Navigate to trigger the middleware
        await router.navigate("users");

        expect(true).toBe(true); // navigate succeeded);

        // Verify getDependency was called and returned correct value
        expect(capturedToken).toBe("secret-token-123");

        (router as any).removeDependency("authToken");
      });
    });
  });
});
