import { describe, it, expect } from "vitest";

import { isString, isBoolean, isObjKey } from "../../../src/type-guards";

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
});
