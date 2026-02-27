import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getDependenciesApi, getLifecycleApi } from "@real-router/core";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  type Router,
} from "./setup";

let router: Router;
let lifecycle: ReturnType<typeof getLifecycleApi>;

describe("core/route-lifecycle/addActivateGuard", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should block navigation if route cannot be activated", async () => {
    // Set up canActivate guard to block admin route
    lifecycle.addActivateGuard("admin", false);

    try {
      await router.navigate("admin");
    } catch (error: any) {
      expect(error?.code).toStrictEqual(errorCodes.CANNOT_ACTIVATE);
      expect(error?.segment).toStrictEqual("admin");
    }

    expect(router.isActiveRoute("home")).toBe(true);
  });

  it("should allow navigation if canActivate returns true", async () => {
    lifecycle.addActivateGuard("admin", true);

    try {
      await router.navigate("admin");
    } catch (error: any) {
      expect(error).toBe(undefined);
    }

    expect(router.getState()?.name).toBe("admin");
  });

  it("should override previous canActivate handler", async () => {
    lifecycle.addActivateGuard("admin", false);
    lifecycle.addActivateGuard("admin", true);

    try {
      await router.navigate("admin");
    } catch (error: any) {
      expect(error).toBe(undefined);
    }

    expect(router.getState()?.name).toBe("admin");
  });

  it("should return error when canActivate returns false", async () => {
    lifecycle.addActivateGuard("sign-in", () => () => false);

    let err: any;

    try {
      await router.navigate("sign-in");
    } catch (error: any) {
      err = error;
    }

    expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(router.getState()?.name).not.toBe("sign-in");
  });

  describe("validation and edge cases", () => {
    it("should register guards without throwing", async () => {
      lifecycle.addActivateGuard("admin", false);
      lifecycle.addActivateGuard("users", true);

      expect(router.canNavigateTo("admin")).toBe(false);
    });

    it("should allow empty string as valid route name (root node)", async () => {
      expect(() => {
        lifecycle.addActivateGuard("", true);
      }).not.toThrowError();

      // Verify guard is active by testing navigation behavior
      // Empty string guard affects all routes (root level)
      lifecycle.addActivateGuard("", false);
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });

    it("should throw TypeError for null route name", async () => {
      expect(() => {
        // @ts-expect-error: testing null
        lifecycle.addActivateGuard(null, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing null
        lifecycle.addActivateGuard(null, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should throw TypeError for undefined route name", async () => {
      expect(() => {
        // @ts-expect-error: testing undefined
        lifecycle.addActivateGuard(undefined, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing undefined
        lifecycle.addActivateGuard(undefined, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should throw TypeError for non-string route name types", async () => {
      // Number
      expect(() => {
        // @ts-expect-error: testing number
        lifecycle.addActivateGuard(123, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing number
        lifecycle.addActivateGuard(123, true);
      }).toThrowError(/Route name must be a string/);

      // Object
      expect(() => {
        // @ts-expect-error: testing object
        lifecycle.addActivateGuard({}, true);
      }).toThrowError(TypeError);

      // Array
      expect(() => {
        // @ts-expect-error: testing array
        lifecycle.addActivateGuard(["route"], true);
      }).toThrowError(TypeError);

      // Symbol
      expect(() => {
        // @ts-expect-error: testing symbol
        lifecycle.addActivateGuard(Symbol("route"), true);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid handler types", async () => {
      expect(() => {
        // @ts-expect-error: testing null
        lifecycle.addActivateGuard("route1", null);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing undefined
        lifecycle.addActivateGuard("route2", undefined);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing number
        lifecycle.addActivateGuard("route3", 123);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing string
        lifecycle.addActivateGuard("route4", "true");
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing object
        lifecycle.addActivateGuard("route5", {});
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing NaN
        lifecycle.addActivateGuard("route6", Number.NaN);
      }).toThrowError(TypeError);
    });

    it("should include descriptive error message for invalid handler", async () => {
      expect(() => {
        // @ts-expect-error: testing null
        lifecycle.addActivateGuard("route", null);
      }).toThrowError(
        /Handler must be a boolean or factory function.*got null/,
      );

      expect(() => {
        // @ts-expect-error: testing number
        lifecycle.addActivateGuard("route", 123);
      }).toThrowError(
        /Handler must be a boolean or factory function.*got number/,
      );

      expect(() => {
        // @ts-expect-error: testing string
        lifecycle.addActivateGuard("route", "true");
      }).toThrowError(
        /Handler must be a boolean or factory function.*got string/,
      );
    });

    it("should include descriptive error message when factory returns non-function", async () => {
      expect(() => {
        // @ts-expect-error: testing factory returning null
        lifecycle.addActivateGuard("route", () => null);
      }).toThrowError(/Factory must return a function.*got null/);

      expect(() => {
        // @ts-expect-error: testing factory returning string
        lifecycle.addActivateGuard("route", () => "not a function");
      }).toThrowError(/Factory must return a function.*got string/);
    });

    it("should throw TypeError if factory returns non-function", async () => {
      // Factory returning null
      expect(() => {
        // @ts-expect-error: testing factory returning null
        lifecycle.addActivateGuard("route1", () => null);
      }).toThrowError(TypeError);

      // Factory returning undefined
      expect(() => {
        // @ts-expect-error: testing factory returning undefined
        lifecycle.addActivateGuard("route2", () => undefined);
      }).toThrowError(TypeError);

      // Factory returning object
      expect(() => {
        // @ts-expect-error: testing factory returning object
        lifecycle.addActivateGuard("route3", () => ({}));
      }).toThrowError(TypeError);

      // Factory returning number
      expect(() => {
        // @ts-expect-error: testing factory returning number
        lifecycle.addActivateGuard("route4", () => 42);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid route names", async () => {
      // Only whitespace (empty string is valid root node)
      expect(() => {
        lifecycle.addActivateGuard("   ", true);
      }).toThrowError(TypeError);

      // Invalid characters
      expect(() => {
        lifecycle.addActivateGuard("route/name", true);
      }).toThrowError(TypeError);

      // Leading dot
      expect(() => {
        lifecycle.addActivateGuard(".route", true);
      }).toThrowError(TypeError);

      // Trailing dot
      expect(() => {
        lifecycle.addActivateGuard("route.", true);
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        lifecycle.addActivateGuard("route..name", true);
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", async () => {
      const longButValidName = "a".repeat(10_000);

      expect(() => {
        lifecycle.addActivateGuard(longButValidName, true);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        lifecycle.addActivateGuard(tooLongName, true);
      }).toThrowError(TypeError);
    });

    it("should allow system routes with @@ prefix", async () => {
      expect(() => {
        lifecycle.addActivateGuard("@@router/UNKNOWN_ROUTE", false);
      }).not.toThrowError();

      // System routes can be registered - verified by no throw above
      // Actual guard execution depends on route tree containing such routes
    });

    it("should register guard for nonexistent route without error", async () => {
      // Guard can be registered for routes not in the tree
      // The guard simply won't be called during navigation
      expect(() => {
        lifecycle.addActivateGuard("nonexistent.route.path", true);
      }).not.toThrowError();

      // Registration succeeds (no throw), guard won't affect navigation
      // since route doesn't exist in tree
    });

    it("should pass router and getDependency to factory", async () => {
      let receivedRouter: unknown;
      let receivedGetDependency: unknown;

      const deps = getDependenciesApi(router);

      (deps as any).set("testValue", "hello");

      lifecycle.addActivateGuard("testRoute", (r, getDep) => {
        receivedRouter = r;
        receivedGetDependency = getDep;

        return () => true;
      });

      expect(receivedRouter).toBe(router);
      expect(typeof receivedGetDependency).toBe("function");
      // @ts-expect-error: testing function call
      expect(receivedGetDependency("testValue")).toBe("hello");
    });

    it("should allow factory to access dependencies via getDependency", async () => {
      const apiService = { fetch: () => {} };

      const deps = getDependenciesApi(router);

      (deps as any).set("testApi", apiService);

      let accessedDependency: unknown;

      lifecycle.addActivateGuard("testRoute", (_router, getDependency) => {
        // @ts-expect-error: testing with custom dependency
        accessedDependency = getDependency("testApi");

        return () => true;
      });

      expect(accessedDependency).toBe(apiService);
    });
  });

  describe("atomicity and consistency", () => {
    it("should rollback factory registration if compilation fails", async () => {
      const factoryThatThrows = () => {
        throw new Error("Factory initialization failed");
      };

      expect(() => {
        lifecycle.addActivateGuard("problematic", factoryThatThrows);
      }).toThrowError("Factory initialization failed");

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        lifecycle.addActivateGuard("problematic", true);
      }).not.toThrowError();

      // Verify new guard works
      let err: any;

      try {
        await router.navigate("problematic");
      } catch (error: any) {
        err = error;
      }

      // Route may not exist in tree, but registration succeeded
      expect(err?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
    });

    it("should rollback if factory returns non-function", async () => {
      expect(() => {
        // @ts-expect-error: testing factory returning null
        lifecycle.addActivateGuard("invalid", () => null);
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        lifecycle.addActivateGuard("invalid", false);
      }).not.toThrowError();
    });

    it("should maintain consistency after failed registration", async () => {
      const factoryThatThrows = () => {
        throw new Error("Test error");
      };

      // Register some valid guards first
      lifecycle.addActivateGuard("admin", true);
      lifecycle.addActivateGuard("index", false);

      // Try to register failing guard
      expect(() => {
        lifecycle.addActivateGuard("items", factoryThatThrows);
      }).toThrowError();

      // Verify valid guards still work correctly
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      }
      try {
        await router.navigate("index");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      // Verify failed guard can be re-registered (was rolled back)
      expect(() => {
        lifecycle.addActivateGuard("items", true);
      }).not.toThrowError();
    });
  });

  describe("self-modification protection", () => {
    it("should throw Error if factory tries to overwrite itself via canActivate", async () => {
      expect(() => {
        lifecycle.addActivateGuard("selfModify", (r) => {
          // Try to overwrite during own registration
          getLifecycleApi(r).addActivateGuard("selfModify", true);

          return () => true;
        });
      }).toThrowError(Error);
      expect(() => {
        lifecycle.addActivateGuard("selfModify2", (r) => {
          getLifecycleApi(r).addActivateGuard("selfModify2", false);

          return () => true;
        });
      }).toThrowError(
        /Cannot modify route "selfModify2" during its own registration/,
      );
    });

    it("should allow factory to register OTHER routes during compilation", async () => {
      let route2Registered = false;

      lifecycle.addActivateGuard("admin", (r) => {
        // Registering a DIFFERENT route is allowed
        getLifecycleApi(r).addActivateGuard("index", false); // blocking guard
        route2Registered = true;

        return () => true;
      });

      expect(route2Registered).toBe(true);

      // Verify both guards work via navigation behavior
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      }
      try {
        await router.navigate("index");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });

    it("should maintain consistency after blocked self-modification", async () => {
      // First, register a valid guard
      lifecycle.addActivateGuard("admin", false);

      // Try to register a guard that attempts self-modification
      expect(() => {
        lifecycle.addActivateGuard("index", (r) => {
          getLifecycleApi(r).addActivateGuard("index", false);

          return () => true;
        });
      }).toThrowError();

      // Verify existing guard still works
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      // Verify problematic guard was rolled back (can be re-registered)
      expect(() => {
        lifecycle.addActivateGuard("index", true);
      }).not.toThrowError();
    });

    it("should cleanup registering set even if factory throws", async () => {
      // First attempt - factory throws
      expect(() => {
        lifecycle.addActivateGuard("throwingRoute", () => {
          throw new Error("Factory error");
        });
      }).toThrowError("Factory error");

      // Second attempt - should not claim route is being registered
      expect(() => {
        lifecycle.addActivateGuard("throwingRoute", true);
      }).not.toThrowError();

      // Guard was successfully registered on second attempt
      // (registration state was cleaned up after first failure)
    });
  });

  describe("overwriting guards", () => {
    it("should log warning when overwriting existing guard", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      lifecycle.addActivateGuard("route", true);

      // First registration - no warning
      expect(warnSpy).not.toHaveBeenCalled();

      // Second registration - should warn
      lifecycle.addActivateGuard("route", false);

      // Logger format: logger.warn(context, message)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.canActivate",
        expect.stringContaining("Overwriting"),
      );

      warnSpy.mockRestore();
    });

    it("should replace old guard with new one", async () => {
      lifecycle.addActivateGuard("admin", true);

      // First guard allows navigation
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error).toBeUndefined();
      }
      lifecycle.addActivateGuard("admin", false);

      // Navigate away first to test re-entering
      await router.navigate("index");

      // New guard blocks navigation
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });
  });

  describe("edge cases - name types", () => {
    it("should reject String Object (only primitive strings allowed)", async () => {
      // String Object is typeof "object", not "string"
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const stringObj = new String("route");

      expect(() => {
        // @ts-expect-error: testing String object
        lifecycle.addActivateGuard(stringObj, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing String object
        lifecycle.addActivateGuard(stringObj, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should reject object with toString method", async () => {
      const objWithToString = {
        toString() {
          return "route";
        },
      };

      expect(() => {
        // @ts-expect-error: testing object with toString
        lifecycle.addActivateGuard(objWithToString, true);
      }).toThrowError(TypeError);
    });

    it("should reject route names with null bytes (security)", async () => {
      // Null bytes are invalid - security concern (null byte injection)
      expect(() => {
        lifecycle.addActivateGuard("route\0hidden", true);
      }).toThrowError(TypeError);

      expect(() => {
        lifecycle.addActivateGuard("route\0hidden", true);
      }).toThrowError(/Invalid route name/);
    });

    it("should reject Unicode and emoji in route names (ASCII only)", async () => {
      // Validator only allows ASCII alphanumeric, underscore, hyphen
      expect(() => {
        lifecycle.addActivateGuard("route🚀", true);
      }).toThrowError(TypeError);

      expect(() => {
        lifecycle.addActivateGuard("маршрут", true);
      }).toThrowError(TypeError);

      expect(() => {
        lifecycle.addActivateGuard("路由", true);
      }).toThrowError(TypeError);
    });

    it("should reject zero-width characters (homoglyph attack protection)", async () => {
      // Zero-width space (U+200B) - rejected for security
      expect(() => {
        lifecycle.addActivateGuard("admin\u200B", true);
      }).toThrowError(TypeError);

      // Zero-width non-joiner (U+200C)
      expect(() => {
        lifecycle.addActivateGuard("admin\u200C", true);
      }).toThrowError(TypeError);
    });

    it("should handle prototype pollution keys safely (Map protection)", async () => {
      // Map is not vulnerable to prototype pollution
      // Registration should succeed without errors
      expect(() => {
        lifecycle.addActivateGuard("__proto__", true);
      }).not.toThrowError();

      expect(() => {
        lifecycle.addActivateGuard("constructor", true);
      }).not.toThrowError();

      expect(() => {
        lifecycle.addActivateGuard("hasOwnProperty", true);
      }).not.toThrowError();

      // All registered correctly - can overwrite them without "no handler" warning
      // (overwrite triggers warning only if handler exists, so no error = was registered)
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      lifecycle.addActivateGuard("__proto__", false);
      lifecycle.addActivateGuard("constructor", false);
      lifecycle.addActivateGuard("hasOwnProperty", false);

      // Should have logged overwrite warnings (meaning guards were registered)
      expect(warnSpy).toHaveBeenCalledTimes(3);

      warnSpy.mockRestore();
    });
  });

  describe("edge cases - handler types", () => {
    it("should reject Boolean Object (only primitive booleans allowed)", async () => {
      // Boolean Object is typeof "object", not "boolean"
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const boolObj = new Boolean(true);

      expect(() => {
        // @ts-expect-error: testing Boolean object
        lifecycle.addActivateGuard("route", boolObj);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing Boolean object
        lifecycle.addActivateGuard("route", boolObj);
      }).toThrowError(/Handler must be a boolean or factory function/);
    });

    it("should reject async function used directly as handler (not as factory)", async () => {
      // async function returns Promise, not ActivationFn
      const asyncHandler = async () => true;

      expect(() => {
        // @ts-expect-error: testing async as direct handler
        lifecycle.addActivateGuard("route", asyncHandler);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing async as direct handler
        lifecycle.addActivateGuard("route", asyncHandler);
      }).toThrowError(/Factory must return a function.*got Promise/);
    });

    it("should reject generator function as factory", async () => {
      // Generator function returns Generator object, not function
      function* generatorFactory() {
        yield () => true;
      }

      expect(() => {
        // @ts-expect-error: testing generator
        lifecycle.addActivateGuard("route", generatorFactory);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing generator
        lifecycle.addActivateGuard("route", generatorFactory);
      }).toThrowError(/Factory must return a function/);
    });

    it("should accept Proxy function (transparent to typeof)", async () => {
      const realFactory = () => () => true;

      const proxyFactory = new Proxy(realFactory, {
        apply(target, thisArg, args) {
          return Reflect.apply(target, thisArg, args);
        },
      });

      expect(() => {
        lifecycle.addActivateGuard("proxyRoute", proxyFactory);
      }).not.toThrowError();

      // Verify guard works via navigation
      try {
        await router.navigate("proxyRoute");
      } catch (error: any) {
        expect(error?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });

    it("should accept bound function", async () => {
      const factory = function (this: { allowed: boolean }) {
        return () => this.allowed;
      }.bind({ allowed: true });

      expect(() => {
        lifecycle.addActivateGuard("boundRoute", factory);
      }).not.toThrowError();

      // Verify bound function's `this.allowed` (true) works via navigation
      try {
        await router.navigate("boundRoute");
      } catch (error: any) {
        expect(error?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });

    it("should accept factory returning async activation function", async () => {
      // Factory returns async function (valid - async ActivationFn is supported)
      const factory = () => async () => true;

      expect(() => {
        lifecycle.addActivateGuard("asyncActivation", factory);
      }).not.toThrowError();

      // Async guards are supported - registration succeeds
    });
  });

  describe("edge cases - recursive registration", () => {
    it("should allow factory to register multiple other routes during compilation", async () => {
      const registeredRoutes: string[] = [];

      lifecycle.addActivateGuard("parent", (r) => {
        // Register child routes during parent compilation
        getLifecycleApi(r).addActivateGuard("parent.child1", true);
        registeredRoutes.push("parent.child1");

        getLifecycleApi(r).addActivateGuard("parent.child2", false);
        registeredRoutes.push("parent.child2");

        getLifecycleApi(r).addActivateGuard("parent.child3", () => () => true);
        registeredRoutes.push("parent.child3");

        return () => true;
      });

      expect(registeredRoutes).toStrictEqual([
        "parent.child1",
        "parent.child2",
        "parent.child3",
      ]);

      // Verify all guards work by checking overwrite warnings
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      lifecycle.addActivateGuard("parent", false);
      lifecycle.addActivateGuard("parent.child1", false);
      lifecycle.addActivateGuard("parent.child2", true);
      lifecycle.addActivateGuard("parent.child3", false);

      // All 4 overwrites should trigger warnings
      expect(warnSpy).toHaveBeenCalledTimes(4);

      warnSpy.mockRestore();
    });

    it("should allow nested factory registration (factory within factory)", async () => {
      lifecycle.addActivateGuard("admin", (r) => {
        getLifecycleApi(r).addActivateGuard("index", (r2) => {
          getLifecycleApi(r2).addActivateGuard("home", false); // blocking guard

          return () => true;
        });

        return () => true;
      });

      // Verify home guard works via navigation
      try {
        await router.navigate("index");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });
  });
});
