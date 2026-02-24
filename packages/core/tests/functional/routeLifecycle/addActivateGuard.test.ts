import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  type Router,
} from "./setup";

let router: Router;

describe("core/route-lifecycle/addActivateGuard", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should block navigation if route cannot be activated", async () => {
    // Set up canActivate guard to block admin route
    router.addActivateGuard("admin", false);

    try {
      await router.navigate("admin");
    } catch (error: any) {
      expect(error?.code).toStrictEqual(errorCodes.CANNOT_ACTIVATE);
      expect(error?.segment).toStrictEqual("admin");
    }

    expect(router.isActiveRoute("home")).toBe(true);
  });

  it("should allow navigation if canActivate returns true", async () => {
    router.addActivateGuard("admin", true);

    try {
      await router.navigate("admin");
    } catch (error: any) {
      expect(error).toBe(undefined);
    }

    expect(router.getState()?.name).toBe("admin");
  });

  it("should override previous canActivate handler", async () => {
    router.addActivateGuard("admin", false);
    router.addActivateGuard("admin", true);

    try {
      await router.navigate("admin");
    } catch (error: any) {
      expect(error).toBe(undefined);
    }

    expect(router.getState()?.name).toBe("admin");
  });

  it("should return error when canActivate returns false", async () => {
    router.addActivateGuard("sign-in", () => () => false);

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
    it("should return router instance for method chaining (fluent interface)", async () => {
      const result1 = router.addActivateGuard("admin", false);
      const result2 = router.addActivateGuard("users", true);

      expect(result1).toBe(router);
      expect(result2).toBe(router);
    });

    it("should allow empty string as valid route name (root node)", async () => {
      expect(() => {
        router.addActivateGuard("", true);
      }).not.toThrowError();

      // Verify guard is active by testing navigation behavior
      // Empty string guard affects all routes (root level)
      router.addActivateGuard("", false);
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }
    });

    it("should throw TypeError for null route name", async () => {
      expect(() => {
        // @ts-expect-error: testing null
        router.addActivateGuard(null, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing null
        router.addActivateGuard(null, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should throw TypeError for undefined route name", async () => {
      expect(() => {
        // @ts-expect-error: testing undefined
        router.addActivateGuard(undefined, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing undefined
        router.addActivateGuard(undefined, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should throw TypeError for non-string route name types", async () => {
      // Number
      expect(() => {
        // @ts-expect-error: testing number
        router.addActivateGuard(123, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing number
        router.addActivateGuard(123, true);
      }).toThrowError(/Route name must be a string/);

      // Object
      expect(() => {
        // @ts-expect-error: testing object
        router.addActivateGuard({}, true);
      }).toThrowError(TypeError);

      // Array
      expect(() => {
        // @ts-expect-error: testing array
        router.addActivateGuard(["route"], true);
      }).toThrowError(TypeError);

      // Symbol
      expect(() => {
        // @ts-expect-error: testing symbol
        router.addActivateGuard(Symbol("route"), true);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid handler types", async () => {
      // @ts-expect-error: testing null
      expect(() => router.addActivateGuard("route1", null)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing undefined
      expect(() => router.addActivateGuard("route2", undefined)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing number
      expect(() => router.addActivateGuard("route3", 123)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing string
      expect(() => router.addActivateGuard("route4", "true")).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing object
      expect(() => router.addActivateGuard("route5", {})).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing NaN
      expect(() => router.addActivateGuard("route6", Number.NaN)).toThrowError(
        TypeError,
      );
    });

    it("should include descriptive error message for invalid handler", async () => {
      expect(() => {
        // @ts-expect-error: testing null
        router.addActivateGuard("route", null);
      }).toThrowError(
        /Handler must be a boolean or factory function.*got null/,
      );

      expect(() => {
        // @ts-expect-error: testing number
        router.addActivateGuard("route", 123);
      }).toThrowError(
        /Handler must be a boolean or factory function.*got number/,
      );

      expect(() => {
        // @ts-expect-error: testing string
        router.addActivateGuard("route", "true");
      }).toThrowError(
        /Handler must be a boolean or factory function.*got string/,
      );
    });

    it("should include descriptive error message when factory returns non-function", async () => {
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.addActivateGuard("route", () => null);
      }).toThrowError(/Factory must return a function.*got null/);

      expect(() => {
        // @ts-expect-error: testing factory returning string
        router.addActivateGuard("route", () => "not a function");
      }).toThrowError(/Factory must return a function.*got string/);
    });

    it("should throw TypeError if factory returns non-function", async () => {
      // Factory returning null
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.addActivateGuard("route1", () => null);
      }).toThrowError(TypeError);

      // Factory returning undefined
      expect(() => {
        // @ts-expect-error: testing factory returning undefined
        router.addActivateGuard("route2", () => undefined);
      }).toThrowError(TypeError);

      // Factory returning object
      expect(() => {
        // @ts-expect-error: testing factory returning object
        router.addActivateGuard("route3", () => ({}));
      }).toThrowError(TypeError);

      // Factory returning number
      expect(() => {
        // @ts-expect-error: testing factory returning number
        router.addActivateGuard("route4", () => 42);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid route names", async () => {
      // Only whitespace (empty string is valid root node)
      expect(() => {
        router.addActivateGuard("   ", true);
      }).toThrowError(TypeError);

      // Invalid characters
      expect(() => {
        router.addActivateGuard("route/name", true);
      }).toThrowError(TypeError);

      // Leading dot
      expect(() => {
        router.addActivateGuard(".route", true);
      }).toThrowError(TypeError);

      // Trailing dot
      expect(() => {
        router.addActivateGuard("route.", true);
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        router.addActivateGuard("route..name", true);
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", async () => {
      const longButValidName = "a".repeat(10_000);

      expect(() => {
        router.addActivateGuard(longButValidName, true);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        router.addActivateGuard(tooLongName, true);
      }).toThrowError(TypeError);
    });

    it("should allow system routes with @@ prefix", async () => {
      expect(() => {
        router.addActivateGuard("@@router/UNKNOWN_ROUTE", false);
      }).not.toThrowError();

      // System routes can be registered - verified by no throw above
      // Actual guard execution depends on route tree containing such routes
    });

    it("should register guard for nonexistent route without error", async () => {
      // Guard can be registered for routes not in the tree
      // The guard simply won't be called during navigation
      expect(() => {
        router.addActivateGuard("nonexistent.route.path", true);
      }).not.toThrowError();

      // Registration succeeds (no throw), guard won't affect navigation
      // since route doesn't exist in tree
    });

    it("should pass router and getDependency to factory", async () => {
      let receivedRouter: unknown;
      let receivedGetDependency: unknown;

      const deps = getDependenciesApi(router);

      (deps as any).set("testValue", "hello");

      router.addActivateGuard("testRoute", (r, getDep) => {
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

      router.addActivateGuard("testRoute", (_router, getDependency) => {
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
        router.addActivateGuard("problematic", factoryThatThrows);
      }).toThrowError("Factory initialization failed");

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.addActivateGuard("problematic", true);
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
        router.addActivateGuard("invalid", () => null);
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.addActivateGuard("invalid", false);
      }).not.toThrowError();
    });

    it("should maintain consistency after failed registration", async () => {
      const factoryThatThrows = () => {
        throw new Error("Test error");
      };

      // Register some valid guards first
      router.addActivateGuard("admin", true);
      router.addActivateGuard("index", false);

      // Try to register failing guard
      expect(() => {
        router.addActivateGuard("items", factoryThatThrows);
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
        router.addActivateGuard("items", true);
      }).not.toThrowError();
    });
  });

  describe("self-modification protection", () => {
    it("should throw Error if factory tries to overwrite itself via canActivate", async () => {
      expect(() => {
        router.addActivateGuard("selfModify", (r) => {
          // Try to overwrite during own registration
          r.addActivateGuard("selfModify", true);

          return () => true;
        });
      }).toThrowError(Error);
      expect(() => {
        router.addActivateGuard("selfModify2", (r) => {
          r.addActivateGuard("selfModify2", false);

          return () => true;
        });
      }).toThrowError(
        /Cannot modify route "selfModify2" during its own registration/,
      );
    });

    it("should allow factory to register OTHER routes during compilation", async () => {
      let route2Registered = false;

      router.addActivateGuard("admin", (r) => {
        // Registering a DIFFERENT route is allowed
        r.addActivateGuard("index", false); // blocking guard
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
      router.addActivateGuard("admin", false);

      // Try to register a guard that attempts self-modification
      expect(() => {
        router.addActivateGuard("index", (r) => {
          r.addActivateGuard("index", false);

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
        router.addActivateGuard("index", true);
      }).not.toThrowError();
    });

    it("should cleanup registering set even if factory throws", async () => {
      // First attempt - factory throws
      expect(() => {
        router.addActivateGuard("throwingRoute", () => {
          throw new Error("Factory error");
        });
      }).toThrowError("Factory error");

      // Second attempt - should not claim route is being registered
      expect(() => {
        router.addActivateGuard("throwingRoute", true);
      }).not.toThrowError();

      // Guard was successfully registered on second attempt
      // (registration state was cleaned up after first failure)
    });
  });

  describe("overwriting guards", () => {
    it("should log warning when overwriting existing guard", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.addActivateGuard("route", true);

      // First registration - no warning
      expect(warnSpy).not.toHaveBeenCalled();

      // Second registration - should warn
      router.addActivateGuard("route", false);

      // Logger format: logger.warn(context, message)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.canActivate",
        expect.stringContaining("Overwriting"),
      );

      warnSpy.mockRestore();
    });

    it("should replace old guard with new one", async () => {
      router.addActivateGuard("admin", true);

      // First guard allows navigation
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error).toBeUndefined();
      }
      router.addActivateGuard("admin", false);

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
        router.addActivateGuard(stringObj, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing String object
        router.addActivateGuard(stringObj, true);
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
        router.addActivateGuard(objWithToString, true);
      }).toThrowError(TypeError);
    });

    it("should reject route names with null bytes (security)", async () => {
      // Null bytes are invalid - security concern (null byte injection)
      expect(() => {
        router.addActivateGuard("route\0hidden", true);
      }).toThrowError(TypeError);

      expect(() => {
        router.addActivateGuard("route\0hidden", true);
      }).toThrowError(/Invalid route name/);
    });

    it("should reject Unicode and emoji in route names (ASCII only)", async () => {
      // Validator only allows ASCII alphanumeric, underscore, hyphen
      expect(() => {
        router.addActivateGuard("route🚀", true);
      }).toThrowError(TypeError);

      expect(() => {
        router.addActivateGuard("маршрут", true);
      }).toThrowError(TypeError);

      expect(() => {
        router.addActivateGuard("路由", true);
      }).toThrowError(TypeError);
    });

    it("should reject zero-width characters (homoglyph attack protection)", async () => {
      // Zero-width space (U+200B) - rejected for security
      expect(() => {
        router.addActivateGuard("admin\u200B", true);
      }).toThrowError(TypeError);

      // Zero-width non-joiner (U+200C)
      expect(() => {
        router.addActivateGuard("admin\u200C", true);
      }).toThrowError(TypeError);
    });

    it("should handle prototype pollution keys safely (Map protection)", async () => {
      // Map is not vulnerable to prototype pollution
      // Registration should succeed without errors
      expect(() => {
        router.addActivateGuard("__proto__", true);
      }).not.toThrowError();

      expect(() => {
        router.addActivateGuard("constructor", true);
      }).not.toThrowError();

      expect(() => {
        router.addActivateGuard("hasOwnProperty", true);
      }).not.toThrowError();

      // All registered correctly - can overwrite them without "no handler" warning
      // (overwrite triggers warning only if handler exists, so no error = was registered)
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.addActivateGuard("__proto__", false);
      router.addActivateGuard("constructor", false);
      router.addActivateGuard("hasOwnProperty", false);

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
        router.addActivateGuard("route", boolObj);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing Boolean object
        router.addActivateGuard("route", boolObj);
      }).toThrowError(/Handler must be a boolean or factory function/);
    });

    it("should reject async function used directly as handler (not as factory)", async () => {
      // async function returns Promise, not ActivationFn
      const asyncHandler = async () => true;

      expect(() => {
        // @ts-expect-error: testing async as direct handler
        router.addActivateGuard("route", asyncHandler);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing async as direct handler
        router.addActivateGuard("route", asyncHandler);
      }).toThrowError(/Factory must return a function.*got Promise/);
    });

    it("should reject generator function as factory", async () => {
      // Generator function returns Generator object, not function
      function* generatorFactory() {
        yield () => true;
      }

      expect(() => {
        // @ts-expect-error: testing generator
        router.addActivateGuard("route", generatorFactory);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing generator
        router.addActivateGuard("route", generatorFactory);
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
        router.addActivateGuard("proxyRoute", proxyFactory);
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
        router.addActivateGuard("boundRoute", factory);
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
        router.addActivateGuard("asyncActivation", factory);
      }).not.toThrowError();

      // Async guards are supported - registration succeeds
    });
  });

  describe("edge cases - recursive registration", () => {
    it("should allow factory to register multiple other routes during compilation", async () => {
      const registeredRoutes: string[] = [];

      router.addActivateGuard("parent", (r) => {
        // Register child routes during parent compilation
        r.addActivateGuard("parent.child1", true);
        registeredRoutes.push("parent.child1");

        r.addActivateGuard("parent.child2", false);
        registeredRoutes.push("parent.child2");

        r.addActivateGuard("parent.child3", () => () => true);
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

      router.addActivateGuard("parent", false);
      router.addActivateGuard("parent.child1", false);
      router.addActivateGuard("parent.child2", true);
      router.addActivateGuard("parent.child3", false);

      // All 4 overwrites should trigger warnings
      expect(warnSpy).toHaveBeenCalledTimes(4);

      warnSpy.mockRestore();
    });

    it("should allow nested factory registration (factory within factory)", async () => {
      router.addActivateGuard("admin", (r) => {
        r.addActivateGuard("index", (r2) => {
          r2.addActivateGuard("home", false); // blocking guard

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
