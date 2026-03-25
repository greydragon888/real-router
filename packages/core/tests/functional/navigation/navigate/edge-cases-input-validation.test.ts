import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

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
  });

  describe("edge cases - invalid input types (analysis 10.1.3)", () => {
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
