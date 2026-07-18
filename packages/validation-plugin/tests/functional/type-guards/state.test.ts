import { describe, it, expect } from "vitest";

import { isState } from "../../../src/type-guards";

describe("State Type Guards", () => {
  describe("isState", () => {
    it("validates valid state", () => {
      const validState = {
        name: "home",
        params: {},
        path: "/home",
      };

      expect(isState(validState)).toBe(true);
    });

    it("validates state with meta", () => {
      const stateWithMeta = {
        name: "home",
        params: {},
        path: "/home",
        meta: {
          id: 1,
          params: {},
        },
      };

      expect(isState(stateWithMeta)).toBe(true);
    });

    it("validates state with primitive params", () => {
      const state = {
        name: "users.view",
        params: {
          id: "123",
          active: true,
          page: 1,
        },
        path: "/users/view/123",
      };

      expect(isState(state)).toBe(true);
    });

    it("rejects null and undefined", () => {
      expect(isState(null)).toBe(false);
      expect(isState(undefined)).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isState("string")).toBe(false);
      expect(isState(123)).toBe(false);
      expect(isState(true)).toBe(false);
    });

    it("rejects object without required fields", () => {
      expect(isState({ params: {}, path: "/home" })).toBe(false);
      expect(isState({ name: "home", path: "/home" })).toBe(false);
      expect(isState({ name: "home", params: {} })).toBe(false);
    });
  });
});
