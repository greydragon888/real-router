import { describe, it, expect } from "vitest";

import { isLoggerConfig } from "../../src/typeGuards";

describe("typeGuards", () => {
  describe("isLoggerConfig", () => {
    it("should return true for empty config object", () => {
      expect(isLoggerConfig({})).toBe(true);
    });

    it("should return true for valid level 'all'", () => {
      expect(isLoggerConfig({ level: "all" })).toBe(true);
    });

    it("should return true for valid level 'warn-error'", () => {
      expect(isLoggerConfig({ level: "warn-error" })).toBe(true);
    });

    it("should return true for valid level 'error-only'", () => {
      expect(isLoggerConfig({ level: "error-only" })).toBe(true);
    });

    it("should return true for valid callback function", () => {
      expect(isLoggerConfig({ callback: () => {} })).toBe(true);
    });

    it("should return true for valid config with both level and callback", () => {
      expect(isLoggerConfig({ level: "all", callback: () => {} })).toBe(true);
    });

    it('should return true for valid level "none" (#789)', () => {
      expect(isLoggerConfig({ level: "none" })).toBe(true);
    });

    it("should return true for callbackIgnoresLevel boolean (#789)", () => {
      expect(isLoggerConfig({ callbackIgnoresLevel: true })).toBe(true);
      expect(isLoggerConfig({ callbackIgnoresLevel: false })).toBe(true);
    });

    it("should return true for the full LoggerConfig surface (#789)", () => {
      expect(
        isLoggerConfig({
          level: "none",
          callback: () => {},
          callbackIgnoresLevel: true,
        }),
      ).toBe(true);
    });

    it("should throw TypeError for non-object config (null)", () => {
      expect(() => isLoggerConfig(null)).toThrow(TypeError);
      expect(() => isLoggerConfig(null)).toThrow(
        "Logger config must be an object",
      );
    });

    it("should throw TypeError for non-object config (primitive)", () => {
      expect(() => isLoggerConfig("string")).toThrow(TypeError);
      expect(() => isLoggerConfig(123)).toThrow(TypeError);
      expect(() => isLoggerConfig(true)).toThrow(TypeError);
      expect(() => isLoggerConfig(undefined)).toThrow(TypeError);
    });

    it("should throw TypeError for unknown property", () => {
      expect(() => isLoggerConfig({ unknown: "value" })).toThrow(TypeError);
      expect(() => isLoggerConfig({ unknown: "value" })).toThrow(
        'Unknown logger config property: "unknown"',
      );
    });

    it("should throw TypeError for invalid level - number", () => {
      expect(() => isLoggerConfig({ level: 123 })).toThrow(TypeError);
      expect(() => isLoggerConfig({ level: 123 })).toThrow(
        "Invalid logger level",
      );
    });

    it("should throw TypeError for invalid level - string not in set (line 60)", () => {
      expect(() => isLoggerConfig({ level: "invalid" })).toThrow(TypeError);
      expect(() => isLoggerConfig({ level: "invalid" })).toThrow(
        "Invalid logger level",
      );
    });

    it("should throw TypeError for invalid level - object (formatValue branch line 36)", () => {
      expect(() => isLoggerConfig({ level: { nested: true } })).toThrow(
        TypeError,
      );
      expect(() => isLoggerConfig({ level: { nested: true } })).toThrow(
        'Invalid logger level: {"nested":true}',
      );
    });

    it("should throw TypeError for callback that is not a function", () => {
      expect(() => isLoggerConfig({ callback: "not-a-function" })).toThrow(
        TypeError,
      );
      expect(() => isLoggerConfig({ callback: "not-a-function" })).toThrow(
        "Logger callback must be a function",
      );
    });

    it("should throw TypeError for callbackIgnoresLevel that is not a boolean (#789)", () => {
      expect(() => isLoggerConfig({ callbackIgnoresLevel: "yes" })).toThrow(
        TypeError,
      );
      expect(() => isLoggerConfig({ callbackIgnoresLevel: "yes" })).toThrow(
        "Logger callbackIgnoresLevel must be a boolean",
      );
    });

    it('should list "none" in the invalid-level error message (#789)', () => {
      expect(() => isLoggerConfig({ level: "invalid" })).toThrow(
        '"all" | "warn-error" | "error-only" | "none"',
      );
    });

    it("should accept undefined values for optional properties", () => {
      expect(isLoggerConfig({ level: undefined })).toBe(true);
      expect(isLoggerConfig({ callback: undefined })).toBe(true);
      expect(isLoggerConfig({ callbackIgnoresLevel: undefined })).toBe(true);
      expect(isLoggerConfig({ level: undefined, callback: undefined })).toBe(
        true,
      );
    });

    it("should format non-string, non-object values using String() (line 40)", () => {
      // This tests the formatValue function's fallback branch
      // Using Symbol which is neither string nor object
      const symbolLevel = Symbol("test");

      expect(() => isLoggerConfig({ level: symbolLevel })).toThrow(TypeError);
      expect(() => isLoggerConfig({ level: symbolLevel })).toThrow(
        "Invalid logger level: Symbol(test)",
      );
    });
  });
});
