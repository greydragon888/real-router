import { describe, it, expect } from "vitest";

import { isState, isStateStrict, isHistoryState } from "type-guards";

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

    describe("meta validation", () => {
      it("rejects non-object meta (string)", () => {
        const invalid = {
          name: "home",
          params: {},
          path: "/home",
          meta: "invalid",
        };

        expect(isStateStrict(invalid)).toBe(false);
      });

      it("rejects null meta", () => {
        const invalid = {
          name: "home",
          params: {},
          path: "/home",
          meta: null,
        };

        expect(isStateStrict(invalid)).toBe(false);
      });

      it("rejects meta with invalid params type", () => {
        const invalid = {
          name: "home",
          params: {},
          path: "/home",
          meta: {
            params: "invalid",
          },
        };

        expect(isStateStrict(invalid)).toBe(false);
      });

      it("rejects meta with invalid id type", () => {
        const invalid = {
          name: "home",
          params: {},
          path: "/home",
          meta: {
            id: "invalid",
          },
        };

        expect(isStateStrict(invalid)).toBe(false);
      });
    });
  });

  describe("isHistoryState", () => {
    it("validates valid history state", () => {
      const validState = {
        name: "home",
        params: {},
        path: "/home",
        meta: {
          id: 1,
          params: {},
        },
      };

      expect(isHistoryState(validState)).toBe(true);
    });

    it("rejects null and undefined", () => {
      expect(isHistoryState(null)).toBe(false);
      expect(isHistoryState(undefined)).toBe(false);
    });

    it("rejects non-object values", () => {
      expect(isHistoryState("string")).toBe(false);
      expect(isHistoryState(123)).toBe(false);
      expect(isHistoryState(true)).toBe(false);
      expect(isHistoryState([])).toBe(false);
    });

    it("rejects state with invalid required fields", () => {
      // Invalid name type
      expect(
        isHistoryState({
          name: 123,
          params: {},
          path: "/home",
          meta: {},
        }),
      ).toBe(false);

      // Invalid path type
      expect(
        isHistoryState({
          name: "home",
          params: {},
          path: 123,
          meta: {},
        }),
      ).toBe(false);

      // Invalid params type
      expect(
        isHistoryState({
          name: "home",
          params: "invalid",
          path: "/home",
          meta: {},
        }),
      ).toBe(false);
    });

    it("validates history state with minimal meta", () => {
      const state = {
        name: "home",
        params: {},
        path: "/home",
        meta: {},
      };

      expect(isHistoryState(state)).toBe(true);
    });

    it("rejects state without meta", () => {
      const invalid = {
        name: "home",
        params: {},
        path: "/home",
      };

      expect(isHistoryState(invalid)).toBe(false);
    });

    it("rejects state with null meta", () => {
      const invalid = {
        name: "home",
        params: {},
        path: "/home",
        meta: null,
      };

      expect(isHistoryState(invalid)).toBe(false);
    });

    it("rejects state with non-object meta", () => {
      const invalid = {
        name: "home",
        params: {},
        path: "/home",
        meta: "invalid",
      };

      expect(isHistoryState(invalid)).toBe(false);
    });

    it("validates history state with additional properties", () => {
      const state = {
        name: "home",
        params: {},
        path: "/home",
        meta: {
          id: 1,
          params: {},
        },
        custom: "data", // Additional properties allowed
      };

      expect(isHistoryState(state)).toBe(true);
    });

    describe("meta.params field validation (line 157)", () => {
      it("accepts valid params in meta", () => {
        expect(
          isHistoryState({
            name: "home",
            params: {},
            path: "/home",
            meta: { params: { id: "123" } },
          }),
        ).toBe(true);
      });

      it("rejects invalid params in meta (nested object)", () => {
        expect(
          isHistoryState({
            name: "home",
            params: {},
            path: "/home",
            meta: { params: { nested: { invalid: true } } },
          }),
        ).toBe(false);
      });

      it("rejects non-object params in meta", () => {
        expect(
          isHistoryState({
            name: "home",
            params: {},
            path: "/home",
            meta: { params: "invalid" },
          }),
        ).toBe(false);
      });
    });

    describe("meta.id field validation (line 159)", () => {
      it("accepts valid id number in meta", () => {
        expect(
          isHistoryState({
            name: "home",
            params: {},
            path: "/home",
            meta: { id: 42 },
          }),
        ).toBe(true);
      });

      it("rejects non-number id in meta (string)", () => {
        expect(
          isHistoryState({
            name: "home",
            params: {},
            path: "/home",
            meta: { id: "123" },
          }),
        ).toBe(false);
      });

      it("rejects non-number id in meta (object)", () => {
        expect(
          isHistoryState({
            name: "home",
            params: {},
            path: "/home",
            meta: { id: {} },
          }),
        ).toBe(false);
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
