import { describe, it, expect } from "vitest";

import {
  isString,
  isBoolean,
  isPromise,
  isObjKey,
  isPrimitiveValue,
} from "type-guards";

const noop = () => undefined;

describe("Primitive Type Guards", () => {
  describe("isString", () => {
    it("returns true for strings", () => {
      expect(isString("hello")).toBe(true);
      expect(isString("")).toBe(true);
    });

    it("returns false for non-strings", () => {
      expect(isString(123)).toBe(false);
      expect(isString(true)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe("isBoolean", () => {
    it("returns true for booleans", () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it("returns false for non-booleans", () => {
      expect(isBoolean("true")).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });

  describe("isPromise", () => {
    it("returns true for promises", () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(noop))).toBe(true);
    });

    it("returns true for thenable objects", () => {
      // eslint-disable-next-line unicorn/no-thenable
      const thenable = { then: noop };

      expect(isPromise(thenable)).toBe(true);
    });

    it("returns false for non-promises", () => {
      expect(isPromise({})).toBe(false);
      expect(isPromise(null)).toBe(false);
      expect(isPromise("promise")).toBe(false);
    });

    it("returns false for objects with non-function then (kills typeof mutant)", () => {
      // This ensures typeof value.then === "function" is necessary
      // If mutated to just "true", this would incorrectly pass
      // eslint-disable-next-line unicorn/no-thenable
      expect(isPromise({ then: "not a function" })).toBe(false);
      // eslint-disable-next-line unicorn/no-thenable
      expect(isPromise({ then: 123 })).toBe(false);
      // eslint-disable-next-line unicorn/no-thenable
      expect(isPromise({ then: null })).toBe(false);
      // eslint-disable-next-line unicorn/no-thenable
      expect(isPromise({ then: {} })).toBe(false);
    });
  });

  describe("isObjKey", () => {
    it("returns true for existing keys", () => {
      const obj = { a: 1, b: 2 };

      expect(isObjKey("a", obj)).toBe(true);
      expect(isObjKey("b", obj)).toBe(true);
    });

    it("returns false for non-existing keys", () => {
      const obj = { a: 1 };

      expect(isObjKey("b", obj)).toBe(false);
    });
  });

  describe("isPrimitiveValue", () => {
    it("returns true for valid primitives", () => {
      expect(isPrimitiveValue("string")).toBe(true);
      expect(isPrimitiveValue(123)).toBe(true);
      expect(isPrimitiveValue(true)).toBe(true);
      expect(isPrimitiveValue(false)).toBe(true);
    });

    it("rejects NaN and Infinity", () => {
      expect(isPrimitiveValue(Number.NaN)).toBe(false);
      expect(isPrimitiveValue(Infinity)).toBe(false);
      expect(isPrimitiveValue(-Infinity)).toBe(false);
    });

    it("returns false for non-primitives", () => {
      expect(isPrimitiveValue({})).toBe(false);
      expect(isPrimitiveValue([])).toBe(false);
      expect(isPrimitiveValue(null)).toBe(false);
      expect(isPrimitiveValue(undefined)).toBe(false);
    });
  });
});
