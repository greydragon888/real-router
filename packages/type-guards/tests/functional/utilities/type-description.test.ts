// packages/type-guards/tests/functional/helpers.test.ts

import { describe, it, expect } from "vitest";

import { getTypeDescription } from "type-guards";

describe("Helper Functions", () => {
  describe("getTypeDescription", () => {
    it("returns 'null' for null", () => {
      expect(getTypeDescription(null)).toBe("null");
    });

    it("returns 'undefined' for undefined", () => {
      expect(getTypeDescription(undefined)).toBe("undefined");
    });

    it("returns 'array[N]' for arrays with length", () => {
      expect(getTypeDescription([])).toBe("array[0]");
      expect(getTypeDescription([1, 2, 3])).toBe("array[3]");
      expect(getTypeDescription(["a", "b"])).toBe("array[2]");
      expect(getTypeDescription(Array.from({ length: 10 }))).toBe("array[10]");
    });

    it("returns constructor name for class instances", () => {
      expect(getTypeDescription(new Date())).toBe("Date");
      expect(getTypeDescription(new Error("test"))).toBe("Error");
      expect(getTypeDescription(/regex/)).toBe("RegExp");

      class CustomClass {
        public test() {
          return true;
        }
      }

      expect(getTypeDescription(new CustomClass())).toBe("CustomClass");
    });

    it("returns 'object' for plain objects", () => {
      expect(getTypeDescription({})).toBe("object");
      expect(getTypeDescription({ a: 1 })).toBe("object");
      expect(getTypeDescription(Object.create(null))).toBe("object");
    });

    it("returns typeof for primitives", () => {
      expect(getTypeDescription("string")).toBe("string");
      expect(getTypeDescription(123)).toBe("number");
      expect(getTypeDescription(true)).toBe("boolean");
      expect(getTypeDescription(false)).toBe("boolean");
      expect(getTypeDescription(Symbol("test"))).toBe("symbol");
      expect(getTypeDescription(123n)).toBe("bigint");
    });

    it("returns 'function' for functions", () => {
      expect(getTypeDescription(() => {})).toBe("function");
      expect(getTypeDescription(() => {})).toBe("function");

      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      expect(getTypeDescription(class Test {})).toBe("function");
    });

    it("handles edge cases", () => {
      expect(getTypeDescription(Number.NaN)).toBe("number");
      expect(getTypeDescription(Infinity)).toBe("number");
      expect(getTypeDescription(-Infinity)).toBe("number");
    });

    it("handles Map and Set", () => {
      expect(getTypeDescription(new Map())).toBe("Map");
      expect(getTypeDescription(new Set())).toBe("Set");
      expect(getTypeDescription(new WeakMap())).toBe("WeakMap");
      expect(getTypeDescription(new WeakSet())).toBe("WeakSet");
    });

    it("handles Promise", () => {
      expect(getTypeDescription(Promise.resolve())).toBe("Promise");
    });
  });
});
