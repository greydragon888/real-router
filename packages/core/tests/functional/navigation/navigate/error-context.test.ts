import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - error context", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("error context preservation (analysis 10.4)", () => {
    it("should preserve error message when guard throws Error", async () => {
      const errorMessage = "Custom guard error message";

      router.addActivateGuard("users", () => () => {
        throw new Error(errorMessage);
      });

      try {
        await router.navigate("users");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.message).toBe(errorMessage);
      }
    });

    it("should preserve error stack when guard throws Error", async () => {
      router.addActivateGuard("users", () => () => {
        throw new Error("Error with stack");
      });

      try {
        await router.navigate("users");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.stack).toBeDefined();
        expect(error?.stack).toContain("Error with stack");
      }
    });

    it("should include segment info in canActivate error", async () => {
      router.addActivateGuard("users", () => () => {
        throw new Error("Guard error");
      });

      try {
        await router.navigate("users");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.segment).toBe("users");
      }
    });

    it("should include segment info in canDeactivate error", async () => {
      await router.navigate("users");

      router.addDeactivateGuard("users", () => () => {
        throw new Error("Guard error");
      });

      try {
        await router.navigate("home");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.segment).toBe("users");
      }
    });

    it("should preserve error message when Promise rejects with Error", async () => {
      const errorMessage = "Async rejection message";

      router.addActivateGuard(
        "users",
        () => () => Promise.reject(new Error(errorMessage)),
      );

      try {
        await router.navigate("users");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.message).toBe(errorMessage);
      }
    });

    it("should handle Promise rejection with plain object", async () => {
      router.addActivateGuard(
        "users",
        () => () => Promise.reject({ reason: "auth_failed", userId: 123 }),
      );

      try {
        await router.navigate("users");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        // Custom properties should be preserved (except reserved)
        expect(error?.reason).toBe("auth_failed");
        expect(error?.userId).toBe(123);
      }
    });
  });

  describe("Issue #39: RouterError constructor conflicts with reserved properties", () => {
    // Test 1: Constructor should throw when "code" is passed in options
    it("should throw TypeError when 'code' property is passed in options", async () => {
      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.TRANSITION_ERR, { code: 500 } as any);
      }).toThrowError(TypeError);

      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.TRANSITION_ERR, { code: 500 } as any);
      }).toThrowError(/Cannot set reserved property "code"/);
    });

    // Test 2: Constructor should throw for "segment" if passed as custom field
    // Note: segment IS in destructuring, so this tests double-passing scenario
    it("should not allow overwriting segment via rest properties", async () => {
      // segment is destructured, so passing it normally works fine
      const err = new RouterError(errorCodes.TRANSITION_ERR, {
        segment: "users",
      });

      expect(err.segment).toBe("users");

      // But if somehow code ends up in rest (e.g., via spread), it should throw
      const badOptions = { segment: "normal", code: "OVERWRITE" };

      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.TRANSITION_ERR, badOptions as any);
      }).toThrowError(TypeError);
    });

    // Test 3: setAdditionalFields already throws for reserved properties (consistency check)
    it("setAdditionalFields should throw for reserved properties", async () => {
      const err = new RouterError(errorCodes.TRANSITION_ERR);

      expect(() => {
        err.setAdditionalFields({ code: "OVERWRITE" });
      }).toThrowError(/Cannot set reserved property "code"/);

      expect(() => {
        err.setAdditionalFields({ segment: "overwrite" });
      }).toThrowError(/Cannot set reserved property "segment"/);

      expect(() => {
        err.setAdditionalFields({ path: "/overwrite" });
      }).toThrowError(/Cannot set reserved property "path"/);

      expect(() => {
        err.setAdditionalFields({
          redirect: { name: "x", params: {}, path: "/" },
        });
      }).toThrowError(/Cannot set reserved property "redirect"/);
    });

    // Test 4: Non-reserved custom properties should work in constructor
    it("should allow custom non-reserved properties in constructor", async () => {
      const err = new RouterError(errorCodes.TRANSITION_ERR, {
        userId: "123",
        attemptedRoute: "/admin",
        customData: { foo: "bar" },
      });

      expect(err.code).toBe(errorCodes.TRANSITION_ERR);
      expect(err.userId).toBe("123");
      expect(err.attemptedRoute).toBe("/admin");
      expect(err.customData).toStrictEqual({ foo: "bar" });
    });

    // Test 5: Reserved method names should be silently ignored (not throw)
    it("should silently ignore reserved method names in constructor", async () => {
      const err = new RouterError(errorCodes.TRANSITION_ERR, {
        setCode: "malicious",
        toJSON: "override",
      } as any);

      // Methods should NOT be overwritten
      expect(typeof err.setCode).toBe("function");
      expect(typeof err.toJSON).toBe("function");
    });

    // Test 6: First argument "code" should be preserved, not overwritten
    it("should preserve first argument code even if options contain code", async () => {
      // After fix: this should throw
      // Before fix: this would silently overwrite code to 500
      expect(() => {
        // eslint-disable-next-line sonarjs/constructor-for-side-effects, sonarjs/no-unthrown-error
        new RouterError(errorCodes.CANNOT_ACTIVATE, { code: 500 } as any);
      }).toThrowError(TypeError);
    });
  });
});
