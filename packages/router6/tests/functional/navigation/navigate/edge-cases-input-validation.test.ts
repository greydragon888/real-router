import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

let router: Router;

describe("router.navigate() - edge cases input validation", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("Issue #60: navigate() options validation", () => {
    it("should throw TypeError for invalid options type (string)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigate("users", {}, "invalid");
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigate("users", {}, "invalid");
      }).toThrowError(/Invalid options/);
    });

    it("should throw TypeError for invalid options type (number)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigate("users", {}, 123);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid options type (array)", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigate("users", {}, []);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigate("users", {}, { replace: "true" });
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error -- testing runtime validation
        router.navigate("users", {}, { reload: 1 });
      }).toThrowError(TypeError);
    });

    it("should accept valid NavigationOptions", () => {
      expect(() => {
        router.navigate("users", {}, { replace: true, reload: false });
      }).not.toThrowError();
    });

    it("should accept empty options object", () => {
      expect(() => {
        router.navigate("users", {}, {});
      }).not.toThrowError();
    });

    it("should accept undefined options (short form)", () => {
      expect(() => {
        router.navigate("users", {});
      }).not.toThrowError();
    });

    it("should accept options with custom fields", () => {
      expect(() => {
        router.navigate("users", {}, { replace: true, customField: "value" });
      }).not.toThrowError();
    });

    it("should include method name in error message", () => {
      const action = () => {
        // @ts-expect-error -- testing runtime validation
        router.navigate("users", {}, { replace: "invalid" });
      };

      expect(action).toThrowError(TypeError);
      expect(action).toThrowError(/\[router\.navigate\]/);
    });
  });

  describe("edge cases - invalid input types (analysis 10.1.3)", () => {
    it("should throw TypeError for number as route name", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime behavior with invalid type
        router.navigate(123);
      }).toThrowError(TypeError);

      // Router should still be operational
      expect(router.isStarted()).toBe(true);
    });

    it("should throw TypeError for null as route name", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime behavior with invalid type
        router.navigate(null);
      }).toThrowError(TypeError);

      // Router should still be operational
      expect(router.isStarted()).toBe(true);
    });

    it("should throw TypeError for undefined as route name", () => {
      expect(() => {
        // @ts-expect-error -- testing runtime behavior with invalid type
        router.navigate(undefined);
      }).toThrowError(TypeError);

      // Router should still be operational
      expect(router.isStarted()).toBe(true);
    });

    it("should handle empty string as route name", () => {
      router.navigate("", (err) => {
        expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      // Router should still be operational
      expect(router.isStarted()).toBe(true);
    });
  });

  // ============================================================================
  // Edge cases from Section 12 analysis
  // ============================================================================
});
