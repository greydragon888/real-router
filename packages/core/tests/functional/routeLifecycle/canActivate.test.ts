import { logger } from "logger";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
  vi,
} from "vitest";

import {
  createLifecycleTestRouter,
  createTestRouter,
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

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("")).toBeDefined();
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

      const [, activateFns] = router.getLifecycleFunctions();

      expectTypeOf(
        activateFns.get("@@router/UNKNOWN_ROUTE")!,
      ).toBeFunction();
    });

    it("should register guard for nonexistent route without error", () => {
      // Guard can be registered for routes not in the tree
      // The guard simply won't be called during navigation
      expect(() => {
        router.canActivate("nonexistent.route.path", true);
      }).not.toThrowError();

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("nonexistent.route.path")).toBeDefined();
    });

    it("should pass router and getDependency to factory", () => {
      let receivedRouter: unknown;
      let receivedGetDependency: unknown;

      router.canActivate("testRoute", (r, getDep) => {
        receivedRouter = r;
        receivedGetDependency = getDep;

        return () => true;
      });

      expect(receivedRouter).toBe(router);
      expect(receivedGetDependency).toBe(router.getDependency);
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

      // Verify factory was rolled back
      const [, activateFactories] = router.getLifecycleFactories();

      expect(activateFactories.problematic).toBe(undefined);

      // Verify compiled function was not added
      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("problematic")).toBe(undefined);
    });

    it("should rollback if factory returns non-function", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.canActivate("invalid", () => null);
      }).toThrowError(TypeError);

      // Verify factory was rolled back
      const [, activateFactories] = router.getLifecycleFactories();

      expect(activateFactories.invalid).toBe(undefined);

      // Verify compiled function was not added
      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("invalid")).toBe(undefined);
    });

    it("should maintain Map consistency after failed registration", () => {
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

      // Verify valid guards are still intact
      const [, activateFactories] = router.getLifecycleFactories();
      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFactories.valid1).toBeDefined();
      expect(activateFactories.valid2).toBeDefined();
      expect(activateFns.get("valid1")).toBeDefined();
      expect(activateFns.get("valid2")).toBeDefined();

      // Verify failed guard was not added
      expect(activateFactories.failing).toBe(undefined);
      expect(activateFns.get("failing")).toBe(undefined);
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

    it("should throw Error if factory tries to clear itself via clearCanActivate", () => {
      expect(() => {
        router.canActivate("selfClear", (r) => {
          // Try to clear during own registration
          r.clearCanActivate("selfClear", true);

          return () => true;
        });
      }).toThrowError(Error);
      expect(() => {
        router.canActivate("selfClear2", (r) => {
          r.clearCanActivate("selfClear2");

          return () => true;
        });
      }).toThrowError(
        /Cannot modify route "selfClear2" during its own registration/,
      );
    });

    it("should allow factory to register OTHER routes during compilation", () => {
      let route2Registered = false;

      router.canActivate("route1", (r) => {
        // Registering a DIFFERENT route is allowed
        r.canActivate("route2", true);
        route2Registered = true;

        return () => true;
      });

      expect(route2Registered).toBe(true);

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("route1")).toBeDefined();
      expect(activateFns.get("route2")).toBeDefined();
    });

    it("should maintain factories/functions consistency after blocked self-modification", () => {
      // First, register a valid guard
      router.canActivate("existing", true);

      // Try to register a guard that attempts self-modification
      expect(() => {
        router.canActivate("problematic", (r) => {
          r.canActivate("problematic", false);

          return () => true;
        });
      }).toThrowError();

      // Verify existing guard is still intact
      const [, activateFactories] = router.getLifecycleFactories();
      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFactories.existing).toBeDefined();
      expect(activateFns.get("existing")).toBeDefined();

      // Verify problematic guard was not registered (rolled back)
      expect(activateFactories.problematic).toBe(undefined);
      expect(activateFns.get("problematic")).toBe(undefined);
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

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("throwingRoute")).toBeDefined();
    });
  });

  describe("boolean shorthand", () => {
    it("should compile boolean true to function returning true", () => {
      router.canActivate("alwaysAllow", true);

      const [, activateFns] = router.getLifecycleFunctions();
      const compiledFn = activateFns.get("alwaysAllow")!;

      expectTypeOf(compiledFn).toBeFunction();

      // Call the compiled function
      const result = compiledFn(
        { name: "test", path: "/test", params: {} },
        undefined,
        () => {},
      );

      expect(result).toBe(true);
    });

    it("should compile boolean false to function returning false", () => {
      router.canActivate("alwaysDeny", false);

      const [, activateFns] = router.getLifecycleFunctions();
      const compiledFn = activateFns.get("alwaysDeny")!;

      expectTypeOf(compiledFn).toBeFunction();

      const result = compiledFn(
        { name: "test", path: "/test", params: {} },
        undefined,
        () => {},
      );

      expect(result).toBe(false);
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
      router.canActivate("route", true);

      const [, activateFnsBefore] = router.getLifecycleFunctions();
      const oldFn = activateFnsBefore.get("route");

      router.canActivate("route", false);

      const [, activateFnsAfter] = router.getLifecycleFunctions();
      const newFn = activateFnsAfter.get("route");

      // Functions should be different
      expect(oldFn).not.toBe(newFn);

      // New function should return false
      expect(
        newFn!(
          { name: "test", path: "/test", params: {} },
          undefined,
          () => {},
        ),
      ).toBe(false);
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
      expect(() => {
        router.canActivate("__proto__", true);
      }).not.toThrowError();

      expect(() => {
        router.canActivate("constructor", true);
      }).not.toThrowError();

      expect(() => {
        router.canActivate("hasOwnProperty", true);
      }).not.toThrowError();

      const [, activateFns] = router.getLifecycleFunctions();

      // All should be registered correctly - Map stores keys as strings safely
      expect(activateFns.get("__proto__")).toBeDefined();
      expect(activateFns.get("constructor")).toBeDefined();
      expect(activateFns.get("hasOwnProperty")).toBeDefined();
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
      // eslint-disable-next-line @typescript-eslint/require-await -- testing async behavior
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

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("proxyRoute")).toBeDefined();
    });

    it("should accept bound function", () => {
      const factory = function (this: { allowed: boolean }) {
        return () => this.allowed;
      }.bind({ allowed: true });

      expect(() => {
        router.canActivate("boundRoute", factory);
      }).not.toThrowError();

      const [, activateFns] = router.getLifecycleFunctions();
      const compiledFn = activateFns.get("boundRoute")!;

      expect(compiledFn).toBeDefined();
      // Bound function should return true via `this.allowed`
      expect(
        compiledFn(
          { name: "test", path: "/test", params: {} },
          undefined,
          () => {},
        ),
      ).toBe(true);
    });

    it("should accept factory returning async activation function", () => {
      // Factory returns async function (valid - async ActivationFn is supported)
      // eslint-disable-next-line @typescript-eslint/require-await -- testing async behavior
      const factory = () => async () => true;

      expect(() => {
        router.canActivate("asyncActivation", factory);
      }).not.toThrowError();

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("asyncActivation")).toBeDefined();
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

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("parent")).toBeDefined();
      expect(activateFns.get("parent.child1")).toBeDefined();
      expect(activateFns.get("parent.child2")).toBeDefined();
      expect(activateFns.get("parent.child3")).toBeDefined();
    });

    it("should allow nested factory registration (factory within factory)", () => {
      router.canActivate("level1", (r) => {
        r.canActivate("level2", (r2) => {
          r2.canActivate("level3", true);

          return () => true;
        });

        return () => true;
      });

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("level1")).toBeDefined();
      expect(activateFns.get("level2")).toBeDefined();
      expect(activateFns.get("level3")).toBeDefined();
    });
  });

  describe("limits", () => {
    it("should allow registering up to 200 lifecycle handlers", () => {
      const tempRouter = createTestRouter();
      // Note: createTestRouter has 2 pre-registered canActivate handlers
      // Maximum is 199 total handlers (check is >= 200)

      // Register 97 more canActivate and 100 canDeactivate
      // Total: 2 (pre-existing) + 97 + 100 = 199 (at limit)
      for (let i = 0; i < 97; i++) {
        expect(() => {
          tempRouter.canActivate(`activateRoute${i}`, true);
        }).not.toThrowError();
      }

      for (let i = 0; i < 100; i++) {
        expect(() => {
          tempRouter.canDeactivate(`deactivateRoute${i}`, true);
        }).not.toThrowError();
      }
    });

    it("should throw Error when exceeding 200 handlers limit", () => {
      const tempRouter = createTestRouter();
      // Note: createTestRouter has 2 pre-registered canActivate handlers
      // Maximum is 199 total handlers (check is >= 200)

      // Register 196 more canActivate handlers (routes 1-196)
      // Total: 2 (pre-existing) + 196 = 198
      for (let i = 1; i <= 196; i++) {
        tempRouter.canActivate(`route${i}`, true);
      }

      // 199th handler should succeed (last one before limit)
      expect(() => {
        tempRouter.canActivate("route197", true);
      }).not.toThrowError();

      // 200th handler should throw (exceeds limit)
      expect(() => {
        tempRouter.canActivate("route198", true);
      }).toThrowError(Error);
      expect(() => {
        tempRouter.canActivate("route198", true);
      }).toThrowError(/limit exceeded.*200/i);
    });

    it("should log warning at 50 handlers", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);
      const tempRouter = createTestRouter();
      // Note: createTestRouter has 2 pre-registered canActivate handlers

      // Clear any previous calls
      warnSpy.mockClear();

      // Register 47 more handlers (2 + 47 = 49 total)
      for (let i = 1; i <= 47; i++) {
        tempRouter.canActivate(`route${i}`, true);
      }

      // Count warning calls mentioning "50" before 50th handler
      const warningsBefore = warnSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("50")),
      ).length;

      // Register 50th handler - should trigger warning
      tempRouter.canActivate("route48", true);

      // Count warning calls mentioning "50" after 50th handler
      const warningsAfter = warnSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("50")),
      ).length;

      // Should have one more warning mentioning "50" after registration
      expect(warningsAfter).toBeGreaterThan(warningsBefore);

      warnSpy.mockRestore();
    });

    it("should log error at 100 handlers", () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(noop);
      const tempRouter = createTestRouter();
      // Note: createTestRouter has 2 pre-registered canActivate handlers

      // Clear any previous calls
      errorSpy.mockClear();

      // Register 97 more handlers (2 + 97 = 99 total)
      for (let i = 1; i <= 97; i++) {
        tempRouter.canActivate(`route${i}`, true);
      }

      // Count error calls mentioning "100" before 100th handler
      const errorsBefore = errorSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("100")),
      ).length;

      // Register 100th handler - should trigger error log
      tempRouter.canActivate("route98", true);

      // Count error calls mentioning "100" after 100th handler
      const errorsAfter = errorSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("100")),
      ).length;

      // Should have at least one error mentioning "100" after registration
      expect(errorsAfter).toBeGreaterThan(errorsBefore);

      errorSpy.mockRestore();
    });

    it("should not count overwrites against the limit", () => {
      const tempRouter = createTestRouter();
      // Note: createTestRouter has 2 pre-registered canActivate handlers
      // Maximum is 199 total handlers (check is >= 200)

      // Register 97 more handlers (route1 - route97)
      // Total: 2 (pre-existing) + 97 = 99
      for (let i = 1; i <= 97; i++) {
        tempRouter.canActivate(`route${i}`, true);
      }

      // Overwriting existing handlers should not increase count
      expect(() => {
        tempRouter.canActivate("route1", false);
        tempRouter.canActivate("route2", false);
        tempRouter.canActivate("route3", false);
      }).not.toThrowError();

      // Should be able to add 100 new handlers (99 existing + 100 new = 199, at limit)
      for (let i = 98; i <= 197; i++) {
        expect(() => {
          tempRouter.canActivate(`route${i}`, true);
        }).not.toThrowError();
      }

      // 200th handler should throw (exceeds limit)
      expect(() => {
        tempRouter.canActivate("route198", true);
      }).toThrowError(Error);
    });
  });
});
