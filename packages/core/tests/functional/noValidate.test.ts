import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { EventName } from "@real-router/types";

describe("core/noValidate option", () => {
  describe("default behavior (noValidate: false)", () => {
    let router: Router;

    beforeEach(() => {
      router = createTestRouter();
    });

    afterEach(() => {
      router.stop();
    });

    it("should validate by default", () => {
      // getRoute with invalid type throws TypeError
      expect(() => router.getRoute(123 as any)).toThrowError(TypeError);
    });

    it("should validate route names", () => {
      expect(() => router.getRoute(123 as any)).toThrowError(TypeError);

      expect(() => router.hasRoute(123 as any)).toThrowError(TypeError);
    });

    it("should validate option names", () => {
      expect(() => router.getOption("unknownOption" as any)).toThrowError(
        ReferenceError,
      );
    });

    it("should validate dependencies", () => {
      expect(() => (router as any).getDependency("nonexistent")).toThrowError(
        ReferenceError,
      );
    });
  });

  describe("noValidate: true", () => {
    let router: Router;

    beforeEach(() => {
      router = createTestRouter({ noValidate: true });
    });

    afterEach(() => {
      router.stop();
    });

    // Route Management
    describe("route management", () => {
      it("should skip validation in addRoute", () => {
        // Empty name would fail validation with noValidate: false
        expect(
          () => void router.addRoute({ name: "a", path: "/test-new" }),
        ).not.toThrowError();
      });

      it("should skip validation in removeRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => router.removeRoute("")).not.toThrowError();
      });

      it("should skip validation in getRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => router.getRoute("")).not.toThrowError();
      });

      it("should skip validation in hasRoute", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => router.hasRoute("")).not.toThrowError();
      });

      it("should skip validation in updateRoute", () => {
        router.addRoute({ name: "test", path: "/test" });

        // Empty forwardTo would fail validation with noValidate: false
        expect(
          () => void router.updateRoute("test", { forwardTo: "" }),
        ).not.toThrowError();
      });
    });

    // Path & State Building
    describe("path and state building", () => {
      it("should skip validation in isActiveRoute", () => {
        // Empty string would normally warn, but not throw validation error
        expect(() => router.isActiveRoute("")).not.toThrowError();
      });

      it("should skip validation in buildPath", () => {
        // Valid route name - tests that validation doesn't throw
        expect(() => router.buildPath("home")).not.toThrowError();
      });

      it("should skip validation in matchPath", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => router.matchPath("")).not.toThrowError();
      });

      it("should skip validation in setRootPath", () => {
        expect(() => {
          router.setRootPath("");
        }).not.toThrowError();
      });

      it("should skip validation in makeState", () => {
        // Valid route name - tests that validation doesn't throw
        expect(() => router.makeState("home")).not.toThrowError();
      });

      it("should skip validation in areStatesEqual", () => {
        expect(() =>
          router.areStatesEqual(undefined, undefined),
        ).not.toThrowError();
      });

      it("should skip validation in forwardState", () => {
        expect(() => router.forwardState("home", {})).not.toThrowError();
      });

      it("should skip validation in buildState", () => {
        expect(() => router.buildState("home", {})).not.toThrowError();
      });

      it("should skip validation in shouldUpdateNode", () => {
        // Empty string would fail validation with noValidate: false
        expect(() => router.shouldUpdateNode("")).not.toThrowError();
      });
    });

    // Options
    describe("options", () => {
      it("should skip validation in getOption", () => {
        // Unknown option - would throw ReferenceError with noValidate: false
        expect(() =>
          router.getOption("unknownOption" as any),
        ).not.toThrowError();
      });
    });

    // Lifecycle
    describe("lifecycle", () => {
      it("should skip validation in start", () => {
        expect(() => router.start()).not.toThrowError();
      });

      it("should skip validation in canDeactivate", () => {
        // Valid handler
        expect(() =>
          router.addDeactivateGuard("home", () => () => true),
        ).not.toThrowError();
      });

      it("should skip validation in canActivate", () => {
        // Valid handler
        expect(() =>
          router.addActivateGuard("home", () => () => true),
        ).not.toThrowError();
      });

      it("should skip validation in canNavigateTo", () => {
        void router.start();

        // Invalid type would throw TypeError with noValidate: false
        expect(() => router.canNavigateTo(123 as any)).not.toThrowError();
      });
    });

    // Plugins & Middleware
    describe("plugins and middleware", () => {
      it("should skip validation in usePlugin", () => {
        // Valid plugin
        expect(() => router.usePlugin(() => ({}))).not.toThrowError();
      });

      it("should skip validation in useMiddleware", () => {
        // Valid middleware
        expect(() =>
          router.useMiddleware(() => (_toState, _fromState) => {
            return true;
          }),
        ).not.toThrowError();
      });
    });

    // Dependencies
    describe("dependencies", () => {
      it("should skip validation in setDependency", () => {
        expect(() =>
          (router as any).setDependency("testDep", "value"),
        ).not.toThrowError();
      });

      it("should skip validation in setDependencies", () => {
        expect(() =>
          (router as any).setDependencies({ testDep: "value" }),
        ).not.toThrowError();
      });

      it("should skip validation in getDependency for nonexistent", () => {
        // Would throw ReferenceError with noValidate: false
        expect(() =>
          (router as any).getDependency("nonexistent"),
        ).not.toThrowError();
      });

      it("should skip validation in removeDependency", () => {
        expect(() =>
          (router as any).removeDependency("testDep"),
        ).not.toThrowError();
      });

      it("should skip validation in hasDependency", () => {
        expect(() =>
          (router as any).hasDependency("testDep"),
        ).not.toThrowError();
      });
    });

    // Events
    describe("events", () => {
      it("should skip validation in addEventListener", () => {
        // Invalid event name would throw with noValidate: false
        expect(() =>
          router.addEventListener(
            "invalidEvent" as unknown as EventName,
            () => {},
          ),
        ).not.toThrowError();
      });

      it("should skip validation in subscribe", () => {
        expect(() => router.subscribe(() => {})).not.toThrowError();
      });
    });

    // Navigation
    describe("navigation", () => {
      it("should skip validation in navigate", () => {
        void router.start();

        // Empty route name would throw with noValidate: false
        expect(() => router.navigate("")).not.toThrowError();
      });

      it("should skip validation in navigateToDefault", () => {
        void router.start();

        expect(() => router.navigateToDefault()).not.toThrowError();
      });

      it("should skip validation in navigateToState", async () => {
        await router.start();

        const state = router.makeState("home", {}, "/home");

        expect(() =>
          router.navigateToState(state, undefined, {}, true),
        ).not.toThrowError();
      });
    });

    // Cloning
    describe("cloning", () => {
      it("should skip validation in clone", () => {
        expect(() => router.clone()).not.toThrowError();
      });
    });
  });

  describe("constructor validation", () => {
    it("should always validate options in constructor (validates noValidate itself)", () => {
      // Invalid noValidate value should throw
      expect(() => createRouter([], { noValidate: "yes" as any })).toThrowError(
        TypeError,
      );
    });

    it("should skip dependencies validation when noValidate is true", () => {
      // Array instead of object - would throw without noValidate
      expect(() =>
        createRouter([], { noValidate: true }, [] as any),
      ).not.toThrowError();
    });

    it("should validate dependencies when noValidate is false", () => {
      // Array instead of object - should throw
      expect(() =>
        createRouter([], { noValidate: false }, [] as any),
      ).toThrowError(TypeError);
    });
  });

  describe("noValidate option value", () => {
    it("should default to false", () => {
      const testRouter = createRouter([{ name: "test", path: "/test" }]);

      expect(testRouter.getOptions().noValidate).toBe(false);

      testRouter.stop();
    });

    it("should accept true", () => {
      const testRouter = createRouter([{ name: "test", path: "/test" }], {
        noValidate: true,
      });

      expect(testRouter.getOptions().noValidate).toBe(true);

      testRouter.stop();
    });

    it("should accept false", () => {
      const testRouter = createRouter([{ name: "test", path: "/test" }], {
        noValidate: false,
      });

      expect(testRouter.getOptions().noValidate).toBe(false);

      testRouter.stop();
    });
  });

  describe("forwardMap caching with noValidate", () => {
    it("should cache forwardTo chains without validation", () => {
      // Create router with forwardTo chain (a → b → c)
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b", forwardTo: "c" },
          { name: "c", path: "/c" },
        ],
        { noValidate: true },
      );

      // forwardState should resolve through chain a → b → c
      const result = router.forwardState("a", {});

      expect(result.name).toBe("c");

      router.stop();
    });

    it("should refresh forward cache when routes are added (noValidate: true)", () => {
      // Start with a simple forwardTo
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b" },
        ],
        { noValidate: true },
      );

      // Verify initial forwardTo works
      expect(router.forwardState("a", {}).name).toBe("b");

      // Add another route with forwardTo - this triggers cache refresh
      router.addRoute({ name: "d", path: "/d", forwardTo: "a" });

      // d → a → b
      expect(router.forwardState("d", {}).name).toBe("b");

      router.stop();
    });

    it("should refresh forward cache when routes are removed (noValidate: true)", () => {
      // Create router with multiple forwardTo routes
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b", forwardTo: "c" },
          { name: "c", path: "/c" },
          { name: "d", path: "/d", forwardTo: "c" },
        ],
        { noValidate: true },
      );

      // Verify initial chains work
      expect(router.forwardState("a", {}).name).toBe("c");
      expect(router.forwardState("d", {}).name).toBe("c");

      // Remove route 'd' - triggers cache refresh
      router.removeRoute("d");

      // Remaining chain should still work
      expect(router.forwardState("a", {}).name).toBe("c");

      router.stop();
    });

    it("should refresh forward cache when forwardTo is updated (noValidate: true)", () => {
      const router = createRouter(
        [
          { name: "a", path: "/a", forwardTo: "b" },
          { name: "b", path: "/b" },
          { name: "c", path: "/c" },
        ],
        { noValidate: true },
      );

      // Initial: a → b
      expect(router.forwardState("a", {}).name).toBe("b");

      // Update forwardTo: a → c (triggers cache refresh)
      router.updateRoute("a", { forwardTo: "c" });

      // Now: a → c
      expect(router.forwardState("a", {}).name).toBe("c");

      router.stop();
    });
  });

  describe("validation comparison", () => {
    it("should throw validation error with noValidate: false for empty route name", () => {
      const testRouter = createTestRouter({ noValidate: false });

      // navigate doesn't throw directly, but validation happens internally
      // Test getRoute instead which does throw for validation errors
      expect(() => testRouter.getRoute(123 as any)).toThrowError(TypeError);

      testRouter.stop();
    });

    it("should not throw validation error with noValidate: true for invalid input", () => {
      const testRouter = createTestRouter({ noValidate: true });

      // getOption with unknown option name won't throw ReferenceError
      expect(() =>
        testRouter.getOption("unknownOption" as any),
      ).not.toThrowError();

      testRouter.stop();
    });

    it("should throw validation error with noValidate: false for unknown option", () => {
      const testRouter = createTestRouter({ noValidate: false });

      expect(() => testRouter.getOption("unknownOption" as any)).toThrowError(
        ReferenceError,
      );

      testRouter.stop();
    });

    it("should not throw validation error with noValidate: true for unknown option", () => {
      const testRouter = createTestRouter({ noValidate: true });

      expect(() =>
        testRouter.getOption("unknownOption" as any),
      ).not.toThrowError();

      testRouter.stop();
    });

    it("should reject async forwardTo even with noValidate: true", () => {
      const testRouter = createTestRouter({ noValidate: true });

      expect(() => {
        testRouter.addRoute({
          name: "async-no-validate",
          path: "/async-no-validate",
          forwardTo: (async () => "target") as any,
        });
      }).toThrowError(TypeError);

      expect(() => {
        testRouter.addRoute({
          name: "async-no-validate",
          path: "/async-no-validate",
          forwardTo: (async () => "target") as any,
        });
      }).toThrowError(/cannot be async/);

      testRouter.stop();
    });
  });
});
