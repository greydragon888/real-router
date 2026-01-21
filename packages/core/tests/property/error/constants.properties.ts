import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes } from "@real-router/core";

describe("RouterError Constants Properties", () => {
  describe("errorCodes structure", () => {
    it("errorCodes is an object with keys and values", () => {
      expect(typeof errorCodes).toBe("object");
      expect(errorCodes).not.toBeNull();
      expect(Array.isArray(errorCodes)).toBe(false);

      return true;
    });

    it("errorCodes contains all required codes", () => {
      const requiredCodes = [
        "ROUTER_NOT_STARTED",
        "NO_START_PATH_OR_STATE",
        "ROUTER_ALREADY_STARTED",
        "ROUTE_NOT_FOUND",
        "SAME_STATES",
        "CANNOT_DEACTIVATE",
        "CANNOT_ACTIVATE",
        "TRANSITION_ERR",
        "TRANSITION_CANCELLED",
      ];

      for (const code of requiredCodes) {
        expect(errorCodes).toHaveProperty(code);
        expect(typeof errorCodes[code as keyof typeof errorCodes]).toBe(
          "string",
        );
        expect(errorCodes[code as keyof typeof errorCodes]).toBe(true);
      }

      return true;
    });

    it("all errorCodes values are unique", () => {
      const values = Object.values(errorCodes);
      const uniqueValues = new Set(values);

      expect(uniqueValues.size).toBe(values.length);

      return true;
    });

    it("all errorCodes keys are unique", () => {
      const keys = Object.keys(errorCodes);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(keys.length);

      return true;
    });
  });

  describe("errorCodes invariants", () => {
    it("all errorCodes values are non-empty strings", () => {
      const values = Object.values(errorCodes) as string[];

      for (const value of values) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
        expect(value.trim().length).toBeGreaterThan(0);
      }

      return true;
    });

    it("all errorCodes keys are non-empty strings", () => {
      const keys = Object.keys(errorCodes);

      for (const key of keys) {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
        expect(key.trim().length).toBeGreaterThan(0);
      }

      return true;
    });

    it("errorCodes values have no leading or trailing whitespace", () => {
      const values = Object.values(errorCodes) as string[];

      for (const value of values) {
        expect(value).toBe(value.trim());
      }

      return true;
    });

    it("errorCodes keys contain no whitespace", () => {
      const keys = Object.keys(errorCodes);

      for (const key of keys) {
        expect(key).not.toMatch(/\s/);
      }

      return true;
    });
  });

  describe("errorCodes naming conventions", () => {
    it("errorCodes keys are in SCREAMING_SNAKE_CASE", () => {
      const keys = Object.keys(errorCodes);

      for (const key of keys) {
        // SCREAMING_SNAKE_CASE: only uppercase letters, digits, and underscores
        expect(key).toMatch(/^[\dA-Z_]+$/);
        // Should not have double underscores
        expect(key).not.toMatch(/__/);
        // Should not start or end with underscore
        expect(key).not.toMatch(/(?:^_)|(?:_$)/);
      }

      return true;
    });

    it("errorCodes values are in SNAKE_CASE or SCREAMING_SNAKE_CASE", () => {
      const values = Object.values(errorCodes) as string[];

      for (const value of values) {
        // Only letters, digits, and underscores
        expect(value).toMatch(/^\w+$/);
        // Should not have double underscores
        expect(value).not.toMatch(/__/);
        // Should not start or end with underscore
        expect(value).not.toMatch(/(?:^_)|(?:_$)/);
      }

      return true;
    });
  });

  describe("errorCodes mutability", () => {
    it("errorCodes object is frozen", () => {
      expect(Object.isFrozen(errorCodes)).toBe(true);

      return true;
    });

    test.prop([fc.string({ minLength: 1, maxLength: 50 })], { numRuns: 1000 })(
      "cannot add new properties to errorCodes",
      (newKey) => {
        const before = Object.keys(errorCodes).length;

        try {
          (errorCodes as unknown as Record<string, string>)[newKey] =
            "NEW_VALUE";
        } catch {
          // Expected in strict mode
        }

        const after = Object.keys(errorCodes).length;

        expect(after).toBe(before);

        return true;
      },
    );

    test.prop([fc.constantFrom(...Object.keys(errorCodes))], {
      numRuns: 1000,
    })("cannot modify existing errorCodes properties", (existingKey) => {
      const originalValue = errorCodes[existingKey as keyof typeof errorCodes];

      try {
        (errorCodes as unknown as Record<string, string>)[existingKey] =
          "MODIFIED_VALUE";
      } catch {
        // Expected in strict mode
      }

      const currentValue = errorCodes[existingKey as keyof typeof errorCodes];

      expect(currentValue).toBe(originalValue);

      return true;
    });

    test.prop([fc.constantFrom(...Object.keys(errorCodes))], {
      numRuns: 1000,
    })("cannot delete properties from errorCodes", (existingKey) => {
      const before = Object.keys(errorCodes).length;

      try {
        delete (errorCodes as unknown as Record<string, string>)[existingKey];
      } catch {
        // Expected in strict mode
      }

      const after = Object.keys(errorCodes).length;

      expect(after).toBe(before);
      expect(errorCodes).toHaveProperty(existingKey);

      return true;
    });
  });

  describe("errorCodes backward compatibility", () => {
    it("errorCodes contains exact number of codes", () => {
      // If this number changes, it may break backward compatibility
      const expectedCount = 9;
      const actualCount = Object.keys(errorCodes).length;

      expect(actualCount).toBe(expectedCount);

      return true;
    });

    it("errorCodes has expected values", () => {
      // These values must not change for backward compatibility
      const expectedMapping = {
        ROUTER_NOT_STARTED: "NOT_STARTED",
        NO_START_PATH_OR_STATE: "NO_START_PATH_OR_STATE",
        ROUTER_ALREADY_STARTED: "ALREADY_STARTED",
        ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
        SAME_STATES: "SAME_STATES",
        CANNOT_DEACTIVATE: "CANNOT_DEACTIVATE",
        CANNOT_ACTIVATE: "CANNOT_ACTIVATE",
        TRANSITION_ERR: "TRANSITION_ERR",
        TRANSITION_CANCELLED: "CANCELLED",
      };

      for (const [key, expectedValue] of Object.entries(expectedMapping)) {
        expect(errorCodes[key as keyof typeof errorCodes]).toBe(expectedValue);
      }

      return true;
    });
  });
});
