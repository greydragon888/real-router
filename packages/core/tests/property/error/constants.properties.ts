import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes } from "@real-router/core";

describe("RouterError Constants Properties", () => {
  describe("errorCodes structure", () => {
    it("errorCodes is an object with keys and values", () => {
      expect(typeof errorCodes).toBe("object");
      expect(errorCodes).not.toBeNull();
      expect(Array.isArray(errorCodes)).toBe(false);
    });

    it("all errorCodes values are unique", () => {
      const values = Object.values(errorCodes);
      const uniqueValues = new Set(values);

      expect(uniqueValues.size).toBe(values.length);
    });

    // Removed "all errorCodes keys are unique": object keys are inherently
    // unique in JS, so `new Set(keys).size === keys.length` can never fail —
    // vacuous (no invariant to violate). "values are unique" above IS real:
    // two distinct codes could collide on the same string value.
  });

  describe("errorCodes invariants", () => {
    it("all errorCodes values are non-empty strings", () => {
      const values = Object.values(errorCodes) as string[];

      for (const value of values) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
        expect(value.trim().length).toBeGreaterThan(0);
      }
    });

    it("all errorCodes keys are non-empty strings", () => {
      const keys = Object.keys(errorCodes);

      for (const key of keys) {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
        expect(key.trim().length).toBeGreaterThan(0);
      }
    });

    it("errorCodes values have no leading or trailing whitespace", () => {
      const values = Object.values(errorCodes) as string[];

      for (const value of values) {
        expect(value).toBe(value.trim());
      }
    });

    it("errorCodes keys contain no whitespace", () => {
      const keys = Object.keys(errorCodes);

      for (const key of keys) {
        expect(key).not.toMatch(/\s/);
      }
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
    });
  });

  describe("errorCodes mutability", () => {
    it("errorCodes object is frozen", () => {
      expect(Object.isFrozen(errorCodes)).toBe(true);
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
    });
  });

  describe("errorCodes backward compatibility", () => {
    it("errorCodes holds exactly the published keys and values", () => {
      // The whole table: a code added, removed or renamed fails here, and so
      // does a changed value. The values are public API — a consumer matches
      // `err.code` against them.
      expect(errorCodes).toStrictEqual({
        ROUTER_NOT_STARTED: "NOT_STARTED",
        ROUTER_ALREADY_STARTED: "ALREADY_STARTED",
        ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
        SAME_STATES: "SAME_STATES",
        CANNOT_DEACTIVATE: "CANNOT_DEACTIVATE",
        CANNOT_ACTIVATE: "CANNOT_ACTIVATE",
        TRANSITION_ERR: "TRANSITION_ERR",
        TRANSITION_CANCELLED: "CANCELLED",
        ROUTER_DISPOSED: "DISPOSED",
        PLUGIN_CONFLICT: "PLUGIN_CONFLICT",
        CONTEXT_NAMESPACE_ALREADY_CLAIMED: "CONTEXT_NAMESPACE_ALREADY_CLAIMED",
        REENTRANT_NAVIGATION: "REENTRANT_NAVIGATION",
        REENTRANT_TREE_MUTATION: "REENTRANT_TREE_MUTATION",
        ROUTER_NOT_STOPPED: "NOT_STOPPED",
        WRONG_CHANNEL: "WRONG_CHANNEL",
      });
    });
  });
});
