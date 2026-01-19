import { describe, it, expect } from "vitest";

import { wrapSyncError } from "../../../modules/transition/wrapSyncError";

describe("transition/wrapSyncError", () => {
  describe("Error instances", () => {
    it("should extract message and stack from Error", () => {
      const error = new Error("Test error message");
      const result = wrapSyncError(error);

      expect(result.message).toBe("Test error message");
      expect(result.stack).toBeDefined();
      expect(typeof result.stack).toBe("string");
    });

    it("should include segment when provided", () => {
      const error = new Error("Test error");
      const result = wrapSyncError(error, "users.profile");

      expect(result.segment).toBe("users.profile");
      expect(result.message).toBe("Test error");
    });

    it("should extract Error.cause when present (ES2022+)", () => {
      const cause = new Error("Root cause");
      const error = new Error("Wrapper error");

      (error as any).cause = cause;

      const result = wrapSyncError(error);

      expect(result.cause).toBe(cause);
      expect(result.message).toBe("Wrapper error");
    });

    it("should not include cause when undefined", () => {
      const error = new Error("No cause");
      const result = wrapSyncError(error);

      expect("cause" in result).toBe(false);
    });

    it("should handle Error subclasses", () => {
      const error = new TypeError("Type error message");
      const result = wrapSyncError(error, "route");

      expect(result.message).toBe("Type error message");
      expect(result.segment).toBe("route");
      expect(result.stack).toBeDefined();
    });
  });

  describe("plain objects", () => {
    it("should spread object properties into metadata", () => {
      const thrown = { custom: "value", statusCode: 42 };
      const result = wrapSyncError(thrown);

      expect(result.custom).toBe("value");
      expect(result.statusCode).toBe(42);
    });

    // Issue #39: Reserved properties are filtered to avoid RouterError constructor conflicts
    it("should filter reserved properties (code, segment, path, redirect)", () => {
      const thrown = {
        custom: "value",
        code: 42,
        segment: "x",
        path: "/y",
        redirect: {},
      };
      const result = wrapSyncError(thrown);

      expect(result.custom).toBe("value");
      expect(result.code).toBeUndefined();
      expect(result.segment).toBeUndefined();
      expect(result.path).toBeUndefined();
      expect(result.redirect).toBeUndefined();
    });

    it("should include segment with object properties", () => {
      const thrown = { foo: "bar" };
      const result = wrapSyncError(thrown, "segment.name");

      expect(result.segment).toBe("segment.name");
      expect(result.foo).toBe("bar");
    });

    it("should handle empty object", () => {
      const result = wrapSyncError({}, "test");

      expect(result.segment).toBe("test");
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("should handle object with message property", () => {
      const thrown = { message: "custom message", extra: true };
      const result = wrapSyncError(thrown);

      expect(result.message).toBe("custom message");
      expect(result.extra).toBe(true);
    });
  });

  describe("primitives", () => {
    it("should return base metadata for string", () => {
      const result = wrapSyncError("string error");

      expect(result).toStrictEqual({});
    });

    it("should return segment only for string with segment", () => {
      const result = wrapSyncError("string error", "route");

      expect(result).toStrictEqual({ segment: "route" });
    });

    it("should return base metadata for number", () => {
      const result = wrapSyncError(42);

      expect(result).toStrictEqual({});
    });

    it("should return segment only for number with segment", () => {
      const result = wrapSyncError(123, "users");

      expect(result).toStrictEqual({ segment: "users" });
    });

    it("should handle null", () => {
      const result = wrapSyncError(null, "test");

      expect(result).toStrictEqual({ segment: "test" });
    });

    it("should handle undefined", () => {
      const result = wrapSyncError(undefined);

      expect(result).toStrictEqual({});
    });

    it("should handle boolean", () => {
      const result = wrapSyncError(false, "route");

      expect(result).toStrictEqual({ segment: "route" });
    });

    it("should handle symbol", () => {
      const sym = Symbol("test");
      const result = wrapSyncError(sym);

      expect(result).toStrictEqual({});
    });

    it("should handle bigint", () => {
      const result = wrapSyncError(9_007_199_254_740_991n, "test");

      expect(result).toStrictEqual({ segment: "test" });
    });
  });

  describe("edge cases", () => {
    it("should handle array (as object)", () => {
      const arr = [1, 2, 3];
      const result = wrapSyncError(arr);

      // Arrays are objects, so properties are spread
      expect(result[0]).toBe(1);
      expect(result[1]).toBe(2);
      expect(result[2]).toBe(3);
    });

    it("should handle Date object", () => {
      const date = new Date("2024-01-01");
      const result = wrapSyncError(date, "test");

      // Date is an object but Error check fails, so it spreads
      expect(result.segment).toBe("test");
    });

    it("should handle function (as object)", () => {
      const fn = () => "test";
      const result = wrapSyncError(fn);

      // Functions are objects
      expect(typeof result).toBe("object");
    });

    it("should not have segment when segment is not provided", () => {
      const error = new Error("test");
      const result = wrapSyncError(error);

      expect("segment" in result).toBe(false);
    });

    it("should handle empty string segment", () => {
      const error = new Error("test");
      const result = wrapSyncError(error, "");

      // Empty string is falsy, so no segment
      expect("segment" in result).toBe(false);
    });

    it("should preserve all Error properties", () => {
      const error = new Error("test");

      (error as any).customProp = "custom";
      (error as any).cause = "root cause";

      const result = wrapSyncError(error);

      expect(result.message).toBe("test");
      expect(result.cause).toBe("root cause");
      // Note: customProp is NOT preserved - only message, stack, cause
      expect(result.customProp).toBeUndefined();
    });
  });
});
