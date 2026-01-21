import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.start() - edge cases", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("State with self-modifying getter", () => {
    it("should handle state with getter that changes on each read", () => {
      let readCount = 0;
      const evilState = {
        get name() {
          readCount++;
          // First read (isRouteName): "users.list"
          // Second read (buildPath): "invalid.route"

          return readCount === 1 ? "users.list" : "invalid.route";
        },
        params: {},
        path: "/users/list",
      };

      const callback = vi.fn();

      // With allowNotFound=true (default), even if buildPath fails,
      // router can start with UNKNOWN_ROUTE
      router.start(evilState, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      // Router handles gracefully - either starts or errors
      expect(router.isStarted()).toBe(true);
    });
  });

  describe("Proxy state objects", () => {
    it("should accept Proxy state (no structuredClone in invokeEventListeners)", () => {
      const proxyState = new Proxy(
        { name: "users.list", params: {}, path: "/users/list" },
        {
          get(target, prop) {
            return target[prop as keyof typeof target];
          },
        },
      );

      const callback = vi.fn();

      // Since state freezing moved to makeState (using Object.freeze, not structuredClone),
      // Proxy states now work when passed to router.start with a state object
      expect(() => {
        router.start(proxyState, callback);
      }).not.toThrowError();

      expect(callback).toHaveBeenCalledTimes(1);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });
  });

  describe("Circular reference in params", () => {
    it("should reject state with circular reference in params", () => {
      router.setOption("allowNotFound", false);

      const params: Record<string, unknown> = { id: "123" };

      params.self = params; // Circular reference

      const state = {
        name: "users.view",
        params,
        path: "/users/view/123",
      };

      const callback = vi.fn();

      // @ts-expect-error - testing circular reference in params
      router.start(state, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      // isParams() rejects circular references via isSerializable()
      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(router.isStarted()).toBe(false);
    });
  });

  describe("State with overridden valueOf/toString", () => {
    it("should not call valueOf/toString during isState validation", () => {
      // Note: structuredClone cannot clone function properties,
      // so we test that validation itself doesn't call valueOf/toString
      // by tracking if the state is valid before reaching structuredClone
      let valueOfCalled = false;
      let toStringCalled = false;

      const stateWithOverrides = {
        name: "users.list",
        params: {},
        path: "/users/list",
        // These override Object.prototype methods
        valueOf() {
          valueOfCalled = true;

          return this;
        },
        toString() {
          toStringCalled = true;

          return "[object State]";
        },
      };

      // This will throw DataCloneError due to function properties
      // but we're testing that valueOf/toString aren't called during isState validation
      try {
        router.start(stateWithOverrides, vi.fn());
      } catch {
        // Expected: DataCloneError from structuredClone
      }

      // Important: valueOf/toString should NOT be called during type checking
      // (typeof, isState, isParams) - they use typeof and property access
      expect(valueOfCalled).toBe(false);
      expect(toStringCalled).toBe(false);
    });
  });

  describe("State with extra fields", () => {
    it("should preserve extra fields in state object", () => {
      const extendedState = {
        name: "users.list",
        params: {},
        path: "/users/list",
        customField: "preserved",
        extraData: { nested: true },
      };

      const callback = vi.fn();

      router.start(extendedState, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
      // Extra fields are preserved (use type assertion for custom fields)
      expect((state as Record<string, unknown>).customField).toBe("preserved");
      expect((state as Record<string, unknown>).extraData).toStrictEqual({
        nested: true,
      });
    });
  });

  describe("Async middleware + stop()", () => {
    it("should cancel transition when stop() called during async middleware", async () => {
      let resolveMiddleware: () => void;
      const middlewarePromise = new Promise<boolean>((resolve) => {
        resolveMiddleware = () => {
          resolve(true);
        };
      });

      router.useMiddleware(() => async () => {
        await middlewarePromise;

        return true;
      });

      // Use plain object instead of Proxy (structuredClone limitation)
      const state = {
        name: "users.list",
        params: {},
        path: "/users/list",
      };

      const callback = vi.fn();

      router.start(state, callback);

      // Stop during async middleware
      router.stop();

      // Complete middleware
      resolveMiddleware!();
      await middlewarePromise;

      // Wait for callback
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
    });
  });

  describe("State with Symbol properties in params", () => {
    it("should preserve Symbol properties in params (no structuredClone)", () => {
      // Since state freezing now uses Object.freeze without structuredClone,
      // Symbol properties in params are preserved through the spread operator
      const sym = Symbol("secret");
      const stateWithSymbol = {
        name: "users.list",
        params: { [sym]: "hidden", id: "123" },
        path: "/users/list",
      };

      const callback = vi.fn();

      router.start(stateWithSymbol, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      // Symbol properties are ignored by isParams (for...in loop) but preserved in params
      // They're no longer lost since we don't use structuredClone for frozen states
      expect((state?.params as Record<symbol, unknown>)[sym]).toBe("hidden");
    });
  });

  describe("State validation with isState()", () => {
    beforeEach(() => {
      // Disable fallback to UNKNOWN_ROUTE to get ROUTE_NOT_FOUND errors
      router.setOption("allowNotFound", false);
    });

    it("should reject state with missing path field", () => {
      const stateNoPath = {
        name: "users.list",
        params: {},
        // path is missing
      };

      const callback = vi.fn();

      // @ts-expect-error - testing invalid state structure
      router.start(stateNoPath, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      // isState() rejects because typeof undefined !== "string"
      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(router.isStarted()).toBe(false);
    });

    it("should reject state with missing params field", () => {
      const stateNoParams = {
        name: "users.list",
        // params is missing
        path: "/users/list",
      };

      const callback = vi.fn();

      // @ts-expect-error - testing invalid state structure
      router.start(stateNoParams, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(router.isStarted()).toBe(false);
    });

    it("should reject state with function in params", () => {
      const stateWithFunction = {
        name: "users.list",
        params: { fn: () => {} },
        path: "/users/list",
      };

      const callback = vi.fn();

      // @ts-expect-error - testing invalid params with function
      router.start(stateWithFunction, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(router.isStarted()).toBe(false);
    });

    it("should reject state with class instance in params", () => {
      class CustomClass {
        value = 42;
      }
      const stateWithClass = {
        name: "users.list",
        params: { instance: new CustomClass() },
        path: "/users/list",
      };

      const callback = vi.fn();

      // @ts-expect-error - testing invalid params with class instance
      router.start(stateWithClass, callback);

      expect(callback).toHaveBeenCalledTimes(1);

      const [error] = callback.mock.calls[0];

      expect(error).toBeDefined();
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(router.isStarted()).toBe(false);
    });
  });

  describe("Async callback returning Promise", () => {
    /* eslint-disable @typescript-eslint/no-misused-promises -- testing edge case of Promise-returning callback */
    it("should work with async callback (rejected promise not caught)", () => {
      const asyncCallback = vi.fn(() => {
        return Promise.reject(new Error("Async error"));
      });

      // Should not throw synchronously
      expect(() => {
        router.start("/users/list", asyncCallback);
      }).not.toThrowError();

      expect(asyncCallback).toHaveBeenCalled();
      expect(router.isStarted()).toBe(true);
    });
    /* eslint-enable @typescript-eslint/no-misused-promises */
  });

  describe("Empty string as path", () => {
    it('should treat empty string "" as no path (use defaultRoute)', () => {
      // Note: Empty string "" is falsy in JS, so !first is true
      // in getStartRouterArguments, and the callback is replaced with noop
      // This is arguably a bug but current behavior - use explicit path instead
      router.start("");

      expect(router.isStarted()).toBe(true);
      // Empty string triggers fallback to defaultRoute
      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("UNKNOWN_ROUTE special case", () => {
    it("should work normally for UNKNOWN_ROUTE with custom path", () => {
      const unknownState = {
        name: constants.UNKNOWN_ROUTE,
        params: { path: "/custom/unknown/path" },
        path: "/custom/unknown/path",
      };
      const callback = vi.fn();

      // UNKNOWN_ROUTE has special handling in buildPath - should not throw
      expect(() => {
        router.start(unknownState, callback);
      }).not.toThrowError();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(router.isStarted()).toBe(true);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toBeDefined();
      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state?.params.path).toBe("/custom/unknown/path");
    });
  });
});
