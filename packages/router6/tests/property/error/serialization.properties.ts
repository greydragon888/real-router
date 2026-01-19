import { test } from "@fast-check/vitest";
import { describe } from "vitest";

import { RouterError } from "router6";

import {
  constructorOptionsArbitrary,
  customFieldsArbitrary,
  errorCodeArbitrary,
} from "./helpers";

/**
 * Recursively checks if a value is not JSON-serializable or loses information during serialization
 * (undefined, Infinity, -Infinity, NaN, -0, functions, symbols)
 */
function isNotJsonSerializable(value: unknown): boolean {
  // Check for non-serializable primitives
  if (value === undefined) {
    return true;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return true;
    } // Infinity, -Infinity, NaN
    if (Object.is(value, -0)) {
      return true;
    } // -0 becomes 0 in JSON
  }
  if (typeof value === "function") {
    return true;
  }
  if (typeof value === "symbol") {
    return true;
  }

  // Recursively check objects and arrays
  if (value === null || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => isNotJsonSerializable(item));
  }

  return Object.values(value).some((val) => isNotJsonSerializable(val));
}

describe("RouterError Serialization Properties", () => {
  describe("toJSON basic properties", () => {
    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("toJSON always contains code and message", (code, options) => {
      const err = new RouterError(code, options);
      const json = err.toJSON();

      expect(json).toHaveProperty("code");
      expect(json).toHaveProperty("message");
      expect(json.code).toBe(code);
      expect(json.message).toBe(options.message ?? code);

      return true;
    });

    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })(
      "toJSON includes segment/path/redirect only if defined",
      (code, options) => {
        const err = new RouterError(code, options);
        const json = err.toJSON();

        if (options.segment === undefined) {
          expect(json).not.toHaveProperty("segment");
        } else {
          expect(json).toHaveProperty("segment", options.segment);
        }

        if (options.path === undefined) {
          expect(json).not.toHaveProperty("path");
        } else {
          expect(json).toHaveProperty("path", options.path);
        }

        if (options.redirect === undefined) {
          expect(json).not.toHaveProperty("redirect");
        } else {
          expect(json).toHaveProperty("redirect");
          expect(json.redirect).toEqual(options.redirect);
        }

        return true;
      },
    );

    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("toJSON never includes stack", (code, options) => {
      const err = new RouterError(code, options);

      err.stack = "long stack trace here";

      const json = err.toJSON();

      expect(json).not.toHaveProperty("stack");

      return true;
    });
  });

  describe("toJSON with arbitrary fields", () => {
    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 10_000 })(
      "toJSON includes arbitrary fields",
      (code, fields) => {
        const err = new RouterError(code, fields);
        const json = err.toJSON();

        for (const [key, value] of Object.entries(fields)) {
          if (
            ![
              "setCode",
              "toJSON",
              "hasField",
              "getField",
              "setAdditionalFields",
              "setErrorInstance",
            ].includes(key)
          ) {
            expect(json[key]).toBe(value);
          }
        }

        return true;
      },
    );

    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 5000 })(
      "toJSON + setAdditionalFields includes all fields",
      (code, fields) => {
        const err = new RouterError(code);

        err.setAdditionalFields(fields);

        const json = err.toJSON();

        for (const [key, value] of Object.entries(fields)) {
          if (
            ![
              "setCode",
              "toJSON",
              "hasField",
              "getField",
              "setAdditionalFields",
              "setErrorInstance",
            ].includes(key)
          ) {
            expect(json[key]).toBe(value);
          }
        }

        return true;
      },
    );
  });

  describe("toJSON determinism", () => {
    test.prop(
      [errorCodeArbitrary, constructorOptionsArbitrary, customFieldsArbitrary],
      {
        numRuns: 10_000,
      },
    )(
      "multiple toJSON calls return identical result",
      (code, options, fields) => {
        const err = new RouterError(code, { ...options, ...fields });

        const json1 = err.toJSON();
        const json2 = err.toJSON();

        expect(json1).toEqual(json2);
        // Verify these are different objects (not same reference)
        expect(json1).not.toBe(json2);

        return true;
      },
    );

    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("identical errors serialize identically", (code, options) => {
      const err1 = new RouterError(code, options);
      const err2 = new RouterError(code, options);

      const json1 = err1.toJSON();
      const json2 = err2.toJSON();

      expect(json1).toEqual(json2);

      return true;
    });
  });

  describe("JSON.stringify compatibility", () => {
    test.prop(
      [errorCodeArbitrary, constructorOptionsArbitrary, customFieldsArbitrary],
      {
        numRuns: 10_000,
      },
    )("JSON.stringify + JSON.parse preserves data", (code, options, fields) => {
      const err = new RouterError(code, { ...options, ...fields });

      const jsonString = JSON.stringify(err);
      const parsed = JSON.parse(jsonString) as Record<string, unknown>;

      // Basic fields
      expect(parsed.code).toBe(code);
      expect(parsed.message).toBe(options.message ?? code);

      // Optional fields
      if (options.segment !== undefined) {
        expect(parsed.segment).toBe(options.segment);
      }

      if (options.path !== undefined) {
        expect(parsed.path).toBe(options.path);
      }

      // Only check redirect if it doesn't contain non-serializable values
      // (undefined, Infinity, NaN become null in JSON, causing mismatch)
      if (
        options.redirect !== undefined &&
        !isNotJsonSerializable(options.redirect)
      ) {
        expect(parsed.redirect).toEqual(options.redirect);
      }

      // Arbitrary fields (except reserved ones)
      for (const [key, value] of Object.entries(fields)) {
        if (
          ![
            "setCode",
            "toJSON",
            "hasField",
            "getField",
            "setAdditionalFields",
            "setErrorInstance",
          ].includes(key) && // JSON.stringify may alter some types (undefined, Infinity, functions, etc)
          // Skip values that are not JSON-serializable
          !isNotJsonSerializable(value)
        ) {
          expect(parsed[key]).toEqual(value);
        }
      }

      // stack should not be in JSON
      expect(parsed).not.toHaveProperty("stack");

      return true;
    });
  });

  describe("toJSON invariants", () => {
    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("toJSON always returns plain object", (code, options) => {
      const err = new RouterError(code, options);
      const json = err.toJSON();

      expect(typeof json).toBe("object");
      expect(json).not.toBeNull();
      expect(Array.isArray(json)).toBe(false);

      // Should not be instance of RouterError or Error
      expect(json).not.toBeInstanceOf(Error);
      expect(json).not.toBeInstanceOf(RouterError);

      return true;
    });

    test.prop(
      [errorCodeArbitrary, constructorOptionsArbitrary, customFieldsArbitrary],
      {
        numRuns: 10_000,
      },
    )("toJSON result contains no methods", (code, options, fields) => {
      const err = new RouterError(code, { ...options, ...fields });
      const json = err.toJSON();

      // Verify there are no functions in JSON
      for (const value of Object.values(json)) {
        expect(typeof value).not.toBe("function");
      }

      return true;
    });

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "toJSON result does not have Error prototype",
      (code) => {
        const err = new RouterError(code);
        const json = err.toJSON();

        // JSON object should have Object.prototype, not Error.prototype
        expect(Object.getPrototypeOf(json)).toBe(Object.prototype);

        return true;
      },
    );
  });
});
