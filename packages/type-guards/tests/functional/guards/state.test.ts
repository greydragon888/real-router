import { describe, it, expect } from "vitest";

import { isState, isStateStrict } from "type-guards";

const noop = () => undefined;

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

  describe("isStateStrict", () => {
    it("validates valid state with type checking", () => {
      const validState = {
        name: "home",
        params: {},
        path: "/home",
      };

      expect(isStateStrict(validState)).toBe(true);
    });

    it("validates state with array params", () => {
      const state = {
        name: "search",
        params: {
          tags: ["js", "ts", "react"],
          ids: [1, 2, 3],
        },
        path: "/search",
      };

      expect(isStateStrict(state)).toBe(true);
    });

    it("rejects object with wrong name type", () => {
      const invalid = {
        name: 123,
        params: {},
        path: "/home",
      };

      expect(isStateStrict(invalid)).toBe(false);
    });

    it("rejects object with wrong path type", () => {
      const invalid = {
        name: "home",
        params: {},
        path: 123,
      };

      expect(isStateStrict(invalid)).toBe(false);
    });

    it("accepts object with valid params (nested objects)", () => {
      const valid = {
        name: "home",
        params: {
          nested: { valid: true },
        },
        path: "/home",
      };

      expect(isStateStrict(valid)).toBe(true);
    });

    it("rejects object with invalid params (function)", () => {
      const invalid = {
        name: "home",
        params: {
          fn: noop,
        },
        path: "/home",
      };

      expect(isStateStrict(invalid)).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isStateStrict(null)).toBe(false);
      expect(isStateStrict(undefined)).toBe(false);
    });

    it("rejects non-object values", () => {
      expect(isStateStrict("string")).toBe(false);
      expect(isStateStrict(123)).toBe(false);
      expect(isStateStrict(true)).toBe(false);
      expect(isStateStrict([])).toBe(false);
    });

    describe("extra properties", () => {
      it("accepts state with arbitrary extra properties", () => {
        const stateWithExtra = {
          name: "home",
          params: {},
          path: "/",
          foo: "bar",
          baz: 42,
        };

        expect(isStateStrict(stateWithExtra)).toBe(true);
      });
    });
  });

  describe("Edge Cases", () => {
    it("handles params with null/undefined values", () => {
      const state = {
        name: "search",
        params: {
          query: null,
          filter: undefined,
        },
        path: "/search",
      };

      expect(isStateStrict(state)).toBe(true);
    });

    it("handles arrays with primitive types", () => {
      const state = {
        name: "home",
        params: {
          strings: ["a", "b", "c"],
          numbers: [1, 2, 3],
          booleans: [true, false],
        },
        path: "/home",
      };

      expect(isStateStrict(state)).toBe(true);
    });

    it("accepts arrays with objects (serializable)", () => {
      const valid = {
        name: "home",
        params: {
          items: [{ id: 1 }, { id: 2 }],
        },
        path: "/home",
      };

      expect(isStateStrict(valid)).toBe(true);
    });

    it("handles frozen params object", () => {
      const params = Object.freeze({ key: "value", id: 123 });

      const state = {
        name: "home",
        params: params,
        path: "/home",
      };

      expect(isStateStrict(state)).toBe(true);
    });

    it("rejects params with NaN values", () => {
      const invalid = {
        name: "home",
        params: {
          value: Number.NaN,
        },
        path: "/home",
      };

      expect(isStateStrict(invalid)).toBe(false);
    });

    it("rejects params with Infinity values", () => {
      const invalid = {
        name: "home",
        params: {
          value: Infinity,
        },
        path: "/home",
      };

      expect(isStateStrict(invalid)).toBe(false);
    });

    it("handles params with numeric zero", () => {
      const state = {
        name: "home",
        params: {
          page: 0,
          offset: -0,
        },
        path: "/home",
      };

      expect(isStateStrict(state)).toBe(true);
    });

    it("rejects arrays with NaN in params", () => {
      const invalid = {
        name: "home",
        params: {
          values: [1, Number.NaN, 3],
        },
        path: "/home",
      };

      expect(isStateStrict(invalid)).toBe(false);
    });

    it("rejects arrays with Infinity in params", () => {
      const invalid = {
        name: "home",
        params: {
          values: [1, Infinity, 3],
        },
        path: "/home",
      };

      expect(isStateStrict(invalid)).toBe(false);
    });
  });
});
