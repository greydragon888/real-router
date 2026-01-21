import { describe, it, expect } from "vitest";

import { formatRouteName } from "../../../src/internal/formatting";

import type { State } from "@real-router/core";

describe("formatting utilities", () => {
  describe("formatRouteName", () => {
    it("should return route name when state is defined", () => {
      const state = {
        name: "users.view",
        params: {},
        path: "/users/123",
      } as State;

      expect(formatRouteName(state)).toBe("users.view");
    });

    it("should return (none) when state is undefined", () => {
      expect(formatRouteName()).toBe("(none)");
    });

    it("should return (none) when state name is undefined", () => {
      const state = {
        name: undefined,
        params: {},
        path: "/",
      } as unknown as State;

      expect(formatRouteName(state)).toBe("(none)");
    });

    it("should handle empty string name", () => {
      const state = { name: "", params: {}, path: "/" } as State;

      expect(formatRouteName(state)).toBe("");
    });
  });
});
