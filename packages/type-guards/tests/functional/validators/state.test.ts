// packages/type-guards/tests/functional/validators.test.ts

import { describe, it, expect } from "vitest";

import { validateState } from "type-guards";

describe("State Validators", () => {
  describe("validateState", () => {
    it("accepts valid state", () => {
      const state = {
        name: "home",
        params: {},
        path: "/",
      };

      expect(() => {
        validateState(state, "test");
      }).not.toThrowError();
    });

    it("accepts state with meta", () => {
      const state = {
        name: "users.profile",
        params: { id: "123" },
        path: "/users/123",
        meta: {
          id: 1,
          params: {},
        },
      };

      expect(() => {
        validateState(state, "test");
      }).not.toThrowError();
    });

    it("throws for null", () => {
      expect(() => {
        validateState(null, "test");
      }).toThrowError("[test] Invalid state structure: null");
    });

    it("throws for undefined", () => {
      expect(() => {
        validateState(undefined, "test");
      }).toThrowError("[test] Invalid state structure: undefined");
    });

    it("throws for non-object", () => {
      expect(() => {
        validateState("state", "test");
      }).toThrowError("[test] Invalid state structure: string");
      expect(() => {
        validateState(123, "test");
      }).toThrowError("[test] Invalid state structure: number");
      expect(() => {
        validateState(true, "test");
      }).toThrowError("[test] Invalid state structure: boolean");
    });

    it("throws for array", () => {
      expect(() => {
        validateState([1, 2, 3], "test");
      }).toThrowError("[test] Invalid state structure: array[3]");
    });

    it("throws for object without required fields", () => {
      expect(() => {
        validateState({}, "test");
      }).toThrowError("[test] Invalid state structure");
      expect(() => {
        validateState({ name: "home" }, "test");
      }).toThrowError("[test] Invalid state structure");
      expect(() => {
        validateState({ name: "home", params: {} }, "test");
      }).toThrowError("[test] Invalid state structure");
    });

    it("throws for invalid name type", () => {
      const state = {
        name: 123,
        params: {},
        path: "/",
      };

      expect(() => {
        validateState(state, "test");
      }).toThrowError("[test] Invalid state structure");
    });

    it("throws for invalid params type", () => {
      const state = {
        name: "home",
        params: "invalid",
        path: "/",
      };

      expect(() => {
        validateState(state, "test");
      }).toThrowError("[test] Invalid state structure");
    });

    it("throws for invalid path type", () => {
      const state = {
        name: "home",
        params: {},
        path: 123,
      };

      expect(() => {
        validateState(state, "test");
      }).toThrowError("[test] Invalid state structure");
    });

    it("includes method name in error message", () => {
      expect(() => {
        validateState(null, "navigate");
      }).toThrowError("[navigate]");
      expect(() => {
        validateState(null, "matchPath");
      }).toThrowError("[matchPath]");
    });
  });
});
