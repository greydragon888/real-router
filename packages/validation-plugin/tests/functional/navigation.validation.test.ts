import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { errorCodes } from "@real-router/core";

import { createValidationRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("navigation validation — with validationPlugin", () => {
  beforeEach(async () => {
    router = createValidationRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("navigate() options validation", () => {
    it("should throw TypeError for invalid options type (string)", () => {
      const raw = router as unknown as {
        navigate(n: string, p: object, o: unknown): unknown;
      };
      expect(() => raw.navigate("users", {}, "invalid")).toThrow(TypeError);
      expect(() => raw.navigate("users", {}, "invalid")).toThrow(
        /Invalid options/,
      );
    });

    it("should throw TypeError for invalid options type (number)", () => {
      const raw = router as unknown as {
        navigate(n: string, p: object, o: unknown): unknown;
      };
      expect(() => raw.navigate("users", {}, 123)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid options type (array)", () => {
      const raw = router as unknown as {
        navigate(n: string, p: object, o: unknown): unknown;
      };
      expect(() => raw.navigate("users", {}, [])).toThrow(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      const raw = router as unknown as {
        navigate(n: string, p: object, o: unknown): unknown;
      };
      expect(() => raw.navigate("users", {}, { replace: "true" })).toThrow(
        TypeError,
      );
      expect(() => raw.navigate("users", {}, { reload: 1 })).toThrow(TypeError);
    });

    it("should accept valid NavigationOptions", () => {
      expect(() => {
        void router.navigate("users", {}, { replace: true, reload: false });
      }).not.toThrow();
    });

    it("should accept empty options object", () => {
      expect(() => {
        void router.navigate("users", {}, {});
      }).not.toThrow();
    });

    it("should accept undefined options", () => {
      expect(() => {
        void router.navigate("users", {});
      }).not.toThrow();
    });

    it("should include method name in error message", () => {
      const raw = router as unknown as {
        navigate(n: string, p: object, o: unknown): unknown;
      };
      const action = () => raw.navigate("users", {}, { replace: "invalid" });
      expect(action).toThrow(TypeError);
      expect(action).toThrow(/\[router\.navigate\]/);
    });
  });

  describe("navigate() route name validation", () => {
    it("should throw TypeError for number as route name", () => {
      const raw = router as unknown as { navigate(n: unknown): unknown };
      expect(() => raw.navigate(123)).toThrow(TypeError);
      expect(router.isActive()).toBe(true);
    });

    it("should throw TypeError for null as route name", () => {
      const raw = router as unknown as { navigate(n: unknown): unknown };
      expect(() => raw.navigate(null)).toThrow(TypeError);
      expect(router.isActive()).toBe(true);
    });

    it("should throw TypeError for undefined as route name", () => {
      const raw = router as unknown as { navigate(n: unknown): unknown };
      expect(() => raw.navigate(undefined)).toThrow(TypeError);
      expect(router.isActive()).toBe(true);
    });

    it("should not throw for empty string (returns ROUTE_NOT_FOUND)", async () => {
      try {
        await router.navigate("");
      } catch (error: unknown) {
        expect((error as { code?: string }).code).toBe(
          errorCodes.ROUTE_NOT_FOUND,
        );
      }
      expect(router.isActive()).toBe(true);
    });
  });

  describe("navigateToDefault() options validation", () => {
    it("should throw TypeError for invalid argument types", () => {
      const raw = router as unknown as {
        navigateToDefault(o: unknown): Promise<unknown>;
      };
      expect(() => raw.navigateToDefault("string")).toThrow(TypeError);
    });

    it("should throw TypeError for invalid options type (string)", () => {
      const raw = router as unknown as {
        navigateToDefault(o: unknown): Promise<unknown>;
      };
      expect(() => raw.navigateToDefault("invalid")).toThrow(/Invalid options/);
    });

    it("should throw TypeError for invalid options type (number)", () => {
      const raw = router as unknown as {
        navigateToDefault(o: unknown): Promise<unknown>;
      };
      expect(() => raw.navigateToDefault(123)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      const raw = router as unknown as {
        navigateToDefault(o: unknown): Promise<unknown>;
      };
      expect(() => raw.navigateToDefault({ replace: "true" })).toThrow(
        TypeError,
      );
    });

    it("should include method name in error message", () => {
      const raw = router as unknown as {
        navigateToDefault(o: unknown): Promise<unknown>;
      };
      expect(() => raw.navigateToDefault("invalid")).toThrow(
        /navigateToDefault/,
      );
    });
  });
});
