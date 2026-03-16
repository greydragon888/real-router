import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - edge cases input validation", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("Issue #60: navigate() options validation", () => {
    it("should throw TypeError for invalid options type (string)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigate("users", {}, "invalid");
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigate("users", {}, "invalid");
      }).toThrow(/Invalid options/);
    });

    it("should throw TypeError for invalid options type (number)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigate("users", {}, 123);
      }).toThrow(TypeError);
    });

    it("should throw TypeError for invalid options type (array)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigate("users", {}, []);
      }).toThrow(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigate("users", {}, { replace: "true" });
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        void router.navigate("users", {}, { reload: 1 });
      }).toThrow(TypeError);
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

    it("should accept undefined options (short form)", () => {
      expect(() => {
        void router.navigate("users", {});
      }).not.toThrow();
    });

    it("should include method name in error message", () => {
      const action = () => {
        // @ts-expect-error -- testing runtime validation
        void router.navigate("users", {}, { replace: "invalid" });
      };

      expect(action).toThrow(TypeError);
      expect(action).toThrow(/\[router\.navigate\]/);
    });
  });

  describe("edge cases - invalid input types (analysis 10.1.3)", () => {
    it("should throw TypeError for number as route name", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime behavior with invalid type
        void router.navigate(123);
      }).toThrow(TypeError);

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    it("should throw TypeError for null as route name", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime behavior with invalid type
        void router.navigate(null);
      }).toThrow(TypeError);

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    it("should throw TypeError for undefined as route name", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime behavior with invalid type
        void router.navigate(undefined);
      }).toThrow(TypeError);

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });

    it("should handle empty string as route name", async () => {
      try {
        await router.navigate("");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      // Router should still be operational
      expect(router.isActive()).toBe(true);
    });
  });

  // ============================================================================
  // Edge cases from Section 12 analysis
  // ============================================================================
});
