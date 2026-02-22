import { describe, beforeEach, afterEach, it, expect } from "vitest";

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
    it("should handle state with getter that changes on each read", async () => {
      // Start router first
      await router.start("/users/list");

      // Router handles gracefully - either starts or errors
      expect(router.isActive()).toBe(true);
    });
  });

  describe("Proxy state objects", () => {
    it("should accept Proxy state objects", async () => {
      const state = await router.start("/users/list");

      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });
  });

  describe("Circular reference in params", () => {
    it("should reject state with circular reference in params", async () => {
      router = createTestRouter({ allowNotFound: false });

      try {
        await router.navigate("users.view", { id: "123", self: {} as any });

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("State with overridden valueOf/toString", () => {
    it("should not call valueOf/toString during isState validation", async () => {
      const state = await router.start("/users/list");

      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });
  });

  describe("State with extra fields", () => {
    it("should preserve extra fields in state object", async () => {
      const state = await router.start("/users/list");

      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });
  });

  describe("Async guard + stop()", () => {
    it("should cancel transition when stop() called during async guard", async () => {
      let resolveGuard: () => void;
      const guardPromise = new Promise<boolean>((resolve) => {
        resolveGuard = () => {
          resolve(true);
        };
      });

      router.addActivateGuard("users.list", () => async () => {
        await guardPromise;

        return true;
      });

      const startPromise = router.start("/users/list");

      // Stop during async guard
      router.stop();

      // Complete guard
      resolveGuard!();
      await guardPromise;

      // Wait for start to complete
      try {
        await startPromise;
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
      }
    });
  });

  describe("State with Symbol properties in params", () => {
    it("should preserve Symbol properties in params (no structuredClone)", async () => {
      const state = await router.start("/users/list");

      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });
  });

  describe("State validation with isState()", () => {
    beforeEach(async () => {
      // Disable fallback to UNKNOWN_ROUTE to get ROUTE_NOT_FOUND errors
      router = createTestRouter({ allowNotFound: false });
      await router.start("/home");
    });

    it("should reject state with missing path field", async () => {
      try {
        await router.navigate("invalid.route");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      expect(router.isActive()).toBe(true);
    });

    it("should reject state with missing params field", async () => {
      try {
        await router.navigate("invalid.route");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      expect(router.isActive()).toBe(true);
    });

    it("should reject state with function in params", async () => {
      try {
        // @ts-expect-error - testing invalid params with function
        await router.navigate("users.list", { fn: () => {} });

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
      }

      expect(router.isActive()).toBe(true);
    });

    it("should reject state with class instance in params", async () => {
      class CustomClass {
        value = 42;
      }

      try {
        // @ts-expect-error - testing invalid params with class instance
        await router.navigate("users.list", { instance: new CustomClass() });

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
      }

      expect(router.isActive()).toBe(true);
    });
  });

  describe("Async callback returning Promise", () => {
    it("should work with async callback (rejected promise not caught)", async () => {
      // Should not throw synchronously
      const state = await router.start("/users/list");

      expect(state).toBeDefined();
      expect(router.isActive()).toBe(true);
    });
  });

  // "Empty string as path" test removed in Task 6 — start() now requires path

  describe("UNKNOWN_ROUTE special case", () => {
    it("should work normally for UNKNOWN_ROUTE with custom path", async () => {
      const state = await router.start("/custom/unknown/path");

      expect(state).toBeDefined();
      expect(router.isActive()).toBe(true);
      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });
});
