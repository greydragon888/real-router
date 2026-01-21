import { describe, it, expect } from "vitest";

import { RouterError } from "@real-router/core";

import { makeError } from "../../../src/transition/makeError";

describe("transition/makeError", () => {
  describe("makeError", () => {
    it("should return undefined when err is undefined (line 11)", () => {
      const err = undefined;
      const result = makeError("ERR_CODE", err);

      expect(result).toBe(undefined);
    });

    it("should return undefined when err is not provided", () => {
      const result = makeError("ERR_CODE");

      expect(result).toBe(undefined);
    });

    it("should set error code and return error when err is provided", () => {
      const err = new RouterError("INITIAL_CODE");
      const result = makeError("CUSTOM_CODE", err);

      expect(result).toBe(err);
      expect(result?.code).toBe("CUSTOM_CODE");
    });

    it("should overwrite existing code", () => {
      const err = new RouterError("ORIGINAL_CODE");

      expect(err.code).toBe("ORIGINAL_CODE");

      const result = makeError("NEW_CODE", err);

      expect(result?.code).toBe("NEW_CODE");
    });
  });
});
