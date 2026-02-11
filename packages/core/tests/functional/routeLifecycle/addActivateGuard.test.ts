import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  type Router,
} from "./setup";

let router: Router;

describe("core/route-lifecycle/canActivate", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should block navigation if route cannot be activated", () => {
    // Set up canActivate guard to block admin route
    router.canActivate("admin", false);

    router.navigate("home");

    router.navigate("admin", (err) => {
      expect(err?.code).toStrictEqual(errorCodes.CANNOT_ACTIVATE);
      expect(err?.segment).toStrictEqual("admin");
    });

    expect(router.isActiveRoute("home")).toBe(true);
  });

  it("should allow navigation if canActivate returns true", () => {
    router.canActivate("admin", true);

    router.navigate("admin", (err) => {
      expect(err).toBe(undefined);
    });

    expect(router.getState()?.name).toBe("admin");
  });

  it("should override previous canActivate handler", () => {
    router.canActivate("admin", false);
    router.canActivate("admin", true);

    router.navigate("admin", (err) => {
      expect(err).toBe(undefined);
    });

    expect(router.getState()?.name).toBe("admin");
  });

  it("should block navigation if canActivate returns an Error", () => {
    // @ts-expect-error: for testing purposes
    router.canActivate("admin", () => () => new Error("Access denied"));

    router.navigate("admin", (err) => {
      expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(router.isActiveRoute("admin")).toBe(false);
    });
  });

  it("should return error when canActivate returns a different route (guards cannot redirect)", () => {
    router.canActivate("sign-in", () => () => ({
      name: "index",
      params: {},
      path: "/",
    }));

    router.navigate("sign-in", (err) => {
      // Guards cannot redirect - should return CANNOT_ACTIVATE error
      expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(err?.attemptedRedirect).toStrictEqual({
        name: "index",
        params: {},
        path: "/",
      });
    });

    // Should remain on previous state, not redirect to index
    expect(router.getState()?.name).not.toBe("index");
  });

  describe("validation and edge cases", () => {
    it("should return router instance for method chaining (fluent interface)", () => {
      const result1 = router.canActivate("admin", false);
      const result2 = router.canActivate("users", true);

      expect(result1).toBe(router);
      expect(result2).toBe(router);
    });

    it("should allow empty string as valid route name (root node)", () => {
      expect(() => {
        router.canActivate("", true);
      }).not.toThrowError();

      // Verify guard is active by testing navigation behavior
      // Empty string guard affects all routes (root level)
      router.canActivate("", false);
      router.navigate("home", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });

    it("should throw TypeError for null route name", () => {
      expect(() => {
        // @ts-expect-error: testing null
        router.canActivate(null, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing null
        router.canActivate(null, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should throw TypeError for undefined route name", () => {
      expect(() => {
        // @ts-expect-error: testing undefined
        router.canActivate(undefined, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing undefined
        router.canActivate(undefined, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should throw TypeError for non-string route name types", () => {
      // Number
      expect(() => {
        // @ts-expect-error: testing number
        router.canActivate(123, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing number
        router.canActivate(123, true);
      }).toThrowError(/Route name must be a string/);

      // Object
      expect(() => {
        // @ts-expect-error: testing object
        router.canActivate({}, true);
      }).toThrowError(TypeError);

      // Array
      expect(() => {
        // @ts-expect-error: testing array
        router.canActivate(["route"], true);
      }).toThrowError(TypeError);

      // Symbol
      expect(() => {
        // @ts-expect-error: testing symbol
        router.canActivate(Symbol("route"), true);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid handler types", () => {
      // @ts-expect-error: testing null
      expect(() => router.canActivate("route1", null)).toThrowError(TypeError);
      // @ts-expect-error: testing undefined
      expect(() => router.canActivate("route2", undefined)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing number
      expect(() => router.canActivate("route3", 123)).toThrowError(TypeError);
      // @ts-expect-error: testing string
      expect(() => router.canActivate("route4", "true")).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing object
      expect(() => router.canActivate("route5", {})).toThrowError(TypeError);
      // @ts-expect-error: testing NaN
      expect(() => router.canActivate("route6", Number.NaN)).toThrowError(
        TypeError,
      );
    });

    it("should include descriptive error message for invalid handler", () => {
      expect(() => {
        // @ts-expect-error: testing null
        router.canActivate("route", null);
      }).toThrowError(
        /Handler must be a boolean or factory function.*got null/,
      );

      expect(() => {
        // @ts-expect-error: testing number
        router.canActivate("route", 123);
      }).toThrowError(
        /Handler must be a boolean or factory function.*got number/,
      );

      expect(() => {
        // @ts-expect-error: testing string
        router.canActivate("route", "true");
      }).toThrowError(
        /Handler must be a boolean or factory function.*got string/,
      );
    });

    it("should include descriptive error message when factory returns non-function", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.canActivate("route", () => null);
      }).toThrowError(/Factory must return a function.*got null/);

      expect(() => {
        // @ts-expect-error: testing factory returning string
        router.canActivate("route", () => "not a function");
      }).toThrowError(/Factory must return a function.*got string/);
    });

    it("should throw TypeError if factory returns non-function", () => {
      // Factory returning null
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.canActivate("route1", () => null);
      }).toThrowError(TypeError);

      // Factory returning undefined
      expect(() => {
        // @ts-expect-error: testing factory returning undefined
        router.canActivate("route2", () => undefined);
      }).toThrowError(TypeError);

      // Factory returning object
      expect(() => {
        // @ts-expect-error: testing factory returning object
        router.canActivate("route3", () => ({}));
      }).toThrowError(TypeError);

      // Factory returning number
      expect(() => {
        // @ts-expect-error: testing factory returning number
        router.canActivate("route4", () => 42);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid route names", () => {
      // Only whitespace (empty string is valid root node)
      expect(() => {
        router.canActivate("   ", true);
      }).toThrowError(TypeError);

      // Invalid characters
      expect(() => {
        router.canActivate("route/name", true);
      }).toThrowError(TypeError);

      // Leading dot
      expect(() => {
        router.canActivate(".route", true);
      }).toThrowError(TypeError);

      // Trailing dot
      expect(() => {
        router.canActivate("route.", true);
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        router.canActivate("route..name", true);
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", () => {
      const longButValidName = "a".repeat(10_000);

      expect(() => {
        router.canActivate(longButValidName, true);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        router.canActivate(tooLongName, true);
      }).toThrowError(TypeError);
    });

    it("should allow system routes with @@ prefix", () => {
      expect(() => {
        router.canActivate("@@router/UNKNOWN_ROUTE", false);
      }).not.toThrowError();

      // System routes can be registered - verified by no throw above
      // Actual guard execution depends on route tree containing such routes
    });

    it("should register guard for nonexistent route without error", () => {
      // Guard can be registered for routes not in the tree
      // The guard simply won't be called during navigation
      expect(() => {
        router.canActivate("nonexistent.route.path", true);
      }).not.toThrowError();

      // Registration succeeds (no throw), guard won't affect navigation
      // since route doesn't exist in tree
    });

    it("should pass router and getDependency to factory", () => {
      let receivedRouter: unknown;
      let receivedGetDependency: unknown;

      // Set up a test dependency
      // @ts-expect-error: testing with custom dependency
      router.setDependency("testValue", "hello");

      router.canActivate("testRoute", (r, getDep) => {
        receivedRouter = r;
        receivedGetDependency = getDep;

        return () => true;
      });

      expect(receivedRouter).toBe(router);
      // Check behavior: getDependency should work correctly
      expect(typeof receivedGetDependency).toBe("function");
      // @ts-expect-error: testing function call
      expect(receivedGetDependency("testValue")).toBe("hello");
    });

    it("should allow factory to access dependencies via getDependency", () => {
      const apiService = { fetch: () => {} };

      // Set up dependency first
      // @ts-expect-error: testing with custom dependency
      router.setDependency("testApi", apiService);

      let accessedDependency: unknown;

      router.canActivate("testRoute", (_router, getDependency) => {
        // @ts-expect-error: testing with custom dependency
        accessedDependency = getDependency("testApi");

        return () => true;
      });

      expect(accessedDependency).toBe(apiService);
    });
  });

  describe("atomicity and consistency", () => {
    it("should rollback factory registration if compilation fails", () => {
      const factoryThatThrows = () => {
        throw new Error("Factory initialization failed");
      };

      expect(() => {
        router.canActivate("problematic", factoryThatThrows);
      }).toThrowError("Factory initialization failed");

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.canActivate("problematic", true);
      }).not.toThrowError();

      // Verify new guard works
      router.navigate("problematic", (err) => {
        // Route may not exist in tree, but registration succeeded
        expect(err?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });

    it("should rollback if factory returns non-function", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.canActivate("invalid", () => null);
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.canActivate("invalid", false);
      }).not.toThrowError();
    });

    it("should maintain consistency after failed registration", () => {
      const factoryThatThrows = () => {
        throw new Error("Test error");
      };

      // Register some valid guards first
      router.canActivate("valid1", true);
      router.canActivate("valid2", false);

      // Try to register failing guard
      expect(() => {
        router.canActivate("failing", factoryThatThrows);
      }).toThrowError();

      // Verify valid guards still work correctly
      router.navigate("valid1", (err) => {
        expect(err?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      });

      router.navigate("valid2", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });

      // Verify failed guard can be re-registered (was rolled back)
      expect(() => {
        router.canActivate("failing", true);
      }).not.toThrowError();
    });
  });

  describe("self-modification protection", () => {
    it("should throw Error if factory tries to overwrite itself via canActivate", () => {
      expect(() => {
        router.canActivate("selfModify", (r) => {
          // Try to overwrite during own registration
          r.canActivate("selfModify", true);

          return () => true;
        });
      }).toThrowError(Error);
      expect(() => {
        router.canActivate("selfModify2", (r) => {
          r.canActivate("selfModify2", false);

          return () => true;
        });
      }).toThrowError(
        /Cannot modify route "selfModify2" during its own registration/,
      );
    });

    it("should allow factory to register OTHER routes during compilation", () => {
      let route2Registered = false;

      router.canActivate("route1", (r) => {
        // Registering a DIFFERENT route is allowed
        r.canActivate("route2", false); // blocking guard
        route2Registered = true;

        return () => true;
      });

      expect(route2Registered).toBe(true);

      // Verify both guards work via navigation behavior
      router.navigate("route1", (err) => {
        expect(err?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      });

      router.navigate("route2", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });

    it("should maintain consistency after blocked self-modification", () => {
      // First, register a valid guard
      router.canActivate("existing", false);

      // Try to register a guard that attempts self-modification
      expect(() => {
        router.canActivate("problematic", (r) => {
          r.canActivate("problematic", false);

          return () => true;
        });
      }).toThrowError();

      // Verify existing guard still works
      router.navigate("existing", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });

      // Verify problematic guard was rolled back (can be re-registered)
      expect(() => {
        router.canActivate("problematic", true);
      }).not.toThrowError();
    });

    it("should cleanup registering set even if factory throws", () => {
      // First attempt - factory throws
      expect(() => {
        router.canActivate("throwingRoute", () => {
          throw new Error("Factory error");
        });
      }).toThrowError("Factory error");

      // Second attempt - should not claim route is being registered
      expect(() => {
        router.canActivate("throwingRoute", true);
      }).not.toThrowError();

      // Guard was successfully registered on second attempt
      // (registration state was cleaned up after first failure)
    });
  });

  describe("overwriting guards", () => {
    it("should log warning when overwriting existing guard", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.canActivate("route", true);

      // First registration - no warning
      expect(warnSpy).not.toHaveBeenCalled();

      // Second registration - should warn
      router.canActivate("route", false);

      // Logger format: logger.warn(context, message)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.canActivate",
        expect.stringContaining("Overwriting"),
      );

      warnSpy.mockRestore();
    });

    it("should replace old guard with new one", () => {
      router.canActivate("admin", true);

      // First guard allows navigation
      router.navigate("admin", (err) => {
        expect(err).toBeUndefined();
      });

      router.canActivate("admin", false);

      // Navigate away first to test re-entering
      router.navigate("home");

      // New guard blocks navigation
      router.navigate("admin", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });
  });

  describe("edge cases - name types", () => {
    it("should reject String Object (only primitive strings allowed)", () => {
      // String Object is typeof "object", not "string"
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const stringObj = new String("route");

      expect(() => {
        // @ts-expect-error: testing String object
        router.canActivate(stringObj, true);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing String object
        router.canActivate(stringObj, true);
      }).toThrowError(/Route name must be a string/);
    });

    it("should reject object with toString method", () => {
      const objWithToString = {
        toString() {
          return "route";
        },
      };

      expect(() => {
        // @ts-expect-error: testing object with toString
        router.canActivate(objWithToString, true);
      }).toThrowError(TypeError);
    });

    it("should reject route names with null bytes (security)", () => {
      // Null bytes are invalid - security concern (null byte injection)
      expect(() => {
        router.canActivate("route\0hidden", true);
      }).toThrowError(TypeError);

      expect(() => {
        router.canActivate("route\0hidden", true);
      }).toThrowError(/Invalid route name/);
    });

    it("should reject Unicode and emoji in route names (ASCII only)", () => {
      // Validator only allows ASCII alphanumeric, underscore, hyphen
      expect(() => {
        router.canActivate("route🚀", true);
      }).toThrowError(TypeError);

      expect(() => {
        router.canActivate("маршрут", true);
      }).toThrowError(TypeError);

      expect(() => {
        router.canActivate("路由", true);
      }).toThrowError(TypeError);
    });

    it("should reject zero-width characters (homoglyph attack protection)", () => {
      // Zero-width space (U+200B) - rejected for security
      expect(() => {
        router.canActivate("admin\u200B", true);
      }).toThrowError(TypeError);

      // Zero-width non-joiner (U+200C)
      expect(() => {
        router.canActivate("admin\u200C", true);
      }).toThrowError(TypeError);
    });

    it("should handle prototype pollution keys safely (Map protection)", () => {
      // Map is not vulnerable to prototype pollution
      // Registration should succeed without errors
      expect(() => {
        router.canActivate("__proto__", true);
      }).not.toThrowError();

      expect(() => {
        router.canActivate("constructor", true);
      }).not.toThrowError();

      expect(() => {
        router.canActivate("hasOwnProperty", true);
      }).not.toThrowError();

      // All registered correctly - can overwrite them without "no handler" warning
      // (overwrite triggers warning only if handler exists, so no error = was registered)
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.canActivate("__proto__", false);
      router.canActivate("constructor", false);
      router.canActivate("hasOwnProperty", false);

      // Should have logged overwrite warnings (meaning guards were registered)
      expect(warnSpy).toHaveBeenCalledTimes(3);

      warnSpy.mockRestore();
    });
  });

  describe("edge cases - handler types", () => {
    it("should reject Boolean Object (only primitive booleans allowed)", () => {
      // Boolean Object is typeof "object", not "boolean"
      // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
      const boolObj = new Boolean(true);

      expect(() => {
        // @ts-expect-error: testing Boolean object
        router.canActivate("route", boolObj);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing Boolean object
        router.canActivate("route", boolObj);
      }).toThrowError(/Handler must be a boolean or factory function/);
    });

    it("should reject async function used directly as handler (not as factory)", () => {
      // async function returns Promise, not ActivationFn
      const asyncHandler = async () => true;

      expect(() => {
        // @ts-expect-error: testing async as direct handler
        router.canActivate("route", asyncHandler);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing async as direct handler
        router.canActivate("route", asyncHandler);
      }).toThrowError(/Factory must return a function.*got Promise/);
    });

    it("should reject generator function as factory", () => {
      // Generator function returns Generator object, not function
      function* generatorFactory() {
        yield () => true;
      }

      expect(() => {
        // @ts-expect-error: testing generator
        router.canActivate("route", generatorFactory);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing generator
        router.canActivate("route", generatorFactory);
      }).toThrowError(/Factory must return a function/);
    });

    it("should accept Proxy function (transparent to typeof)", () => {
      const realFactory = () => () => true;

      const proxyFactory = new Proxy(realFactory, {
        apply(target, thisArg, args) {
          return Reflect.apply(target, thisArg, args);
        },
      });

      expect(() => {
        router.canActivate("proxyRoute", proxyFactory);
      }).not.toThrowError();

      // Verify guard works via navigation
      router.navigate("proxyRoute", (err) => {
        expect(err?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });

    it("should accept bound function", () => {
      const factory = function (this: { allowed: boolean }) {
        return () => this.allowed;
      }.bind({ allowed: true });

      expect(() => {
        router.canActivate("boundRoute", factory);
      }).not.toThrowError();

      // Verify bound function's `this.allowed` (true) works via navigation
      router.navigate("boundRoute", (err) => {
        expect(err?.code).not.toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });

    it("should accept factory returning async activation function", () => {
      // Factory returns async function (valid - async ActivationFn is supported)
      const factory = () => async () => true;

      expect(() => {
        router.canActivate("asyncActivation", factory);
      }).not.toThrowError();

      // Async guards are supported - registration succeeds
    });
  });

  describe("edge cases - recursive registration", () => {
    it("should allow factory to register multiple other routes during compilation", () => {
      const registeredRoutes: string[] = [];

      router.canActivate("parent", (r) => {
        // Register child routes during parent compilation
        r.canActivate("parent.child1", true);
        registeredRoutes.push("parent.child1");

        r.canActivate("parent.child2", false);
        registeredRoutes.push("parent.child2");

        r.canActivate("parent.child3", () => () => true);
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

      router.canActivate("parent", false);
      router.canActivate("parent.child1", false);
      router.canActivate("parent.child2", true);
      router.canActivate("parent.child3", false);

      // All 4 overwrites should trigger warnings
      expect(warnSpy).toHaveBeenCalledTimes(4);

      warnSpy.mockRestore();
    });

    it("should allow nested factory registration (factory within factory)", () => {
      router.canActivate("level1", (r) => {
        r.canActivate("level2", (r2) => {
          r2.canActivate("level3", false); // blocking guard

          return () => true;
        });

        return () => true;
      });

      // Verify level3 guard works via navigation
      router.navigate("level3", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });
  });
});
