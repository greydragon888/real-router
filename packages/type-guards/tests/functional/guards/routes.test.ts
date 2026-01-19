// packages/type-guards/tests/functional/routes.test.ts

import { describe, it, expect } from "vitest";

import { isRouteName } from "type-guards";

describe("Route Type Guards", () => {
  describe("isRouteName", () => {
    describe("valid route names", () => {
      it("accepts simple route name", () => {
        expect(isRouteName("home")).toBe(true);
      });

      it("accepts hierarchical route names", () => {
        expect(isRouteName("users.profile")).toBe(true);
        expect(isRouteName("admin.users.list")).toBe(true);
      });

      it("accepts route names with underscores", () => {
        expect(isRouteName("admin_panel")).toBe(true);
        expect(isRouteName("user_profile")).toBe(true);
      });

      it("accepts route names with hyphens", () => {
        expect(isRouteName("api-v2")).toBe(true);
        expect(isRouteName("some-route")).toBe(true);
      });

      it("accepts route names starting with uppercase", () => {
        expect(isRouteName("Home")).toBe(true);
        expect(isRouteName("AdminPanel")).toBe(true);
      });

      it("accepts route names with numbers (not at start)", () => {
        expect(isRouteName("route123")).toBe(true);
        expect(isRouteName("api2")).toBe(true);
      });

      it("accepts system routes starting with @@", () => {
        expect(isRouteName("@@real-router/UNKNOWN_ROUTE")).toBe(true);
        expect(isRouteName("@@system")).toBe(true);
      });
    });

    describe("invalid route names", () => {
      it("rejects non-string values", () => {
        expect(isRouteName(123)).toBe(false);
        expect(isRouteName(null)).toBe(false);
        expect(isRouteName(undefined)).toBe(false);
        expect(isRouteName({})).toBe(false);
        expect(isRouteName([])).toBe(false);
        expect(isRouteName(true)).toBe(false);
      });

      it("accepts empty string (root node)", () => {
        expect(isRouteName("")).toBe(true);
      });

      it("rejects whitespace-only strings", () => {
        expect(isRouteName(" ")).toBe(false);
        expect(isRouteName("  ")).toBe(false);
        expect(isRouteName("\t")).toBe(false);
        expect(isRouteName("\n")).toBe(false);
      });

      it("rejects names with leading dot", () => {
        expect(isRouteName(".users")).toBe(false);
      });

      it("rejects names with trailing dot", () => {
        expect(isRouteName("users.")).toBe(false);
      });

      it("rejects names with consecutive dots", () => {
        expect(isRouteName("users..profile")).toBe(false);
      });

      it("rejects names with segments starting with numbers", () => {
        expect(isRouteName("123route")).toBe(false);
        expect(isRouteName("users.123profile")).toBe(false);
      });

      it("rejects names with segments starting with hyphens", () => {
        expect(isRouteName("-route")).toBe(false);
        expect(isRouteName("users.-profile")).toBe(false);
      });

      it("rejects names containing spaces", () => {
        expect(isRouteName("users profile")).toBe(false);
        expect(isRouteName("admin panel")).toBe(false);
      });

      it("rejects names containing special characters", () => {
        expect(isRouteName("users@profile")).toBe(false);
        expect(isRouteName("users#profile")).toBe(false);
        expect(isRouteName("users/profile")).toBe(false);
      });

      it("rejects names exceeding MAX_ROUTE_NAME_LENGTH", () => {
        const longName = "a".repeat(10_001);

        expect(isRouteName(longName)).toBe(false);
      });

      it("accepts name exactly at MAX_ROUTE_NAME_LENGTH (kills >= mutant)", () => {
        // This ensures the boundary check is correct (> not >=)
        const maxLengthName = "a".repeat(10_000);

        expect(isRouteName(maxLengthName)).toBe(true);
      });
    });
  });
});
