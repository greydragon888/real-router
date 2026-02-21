import { describe, it, expect } from "vitest";

import { isString, isBoolean, isObjKey, isPrimitiveValue } from "type-guards";

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
