// packages/type-guards/tests/property/routes.properties.ts

import { fc, test } from "@fast-check/vitest";

import { isRouteName } from "type-guards";

describe("Route Guards - Property-Based Tests", () => {
  describe("isRouteName", () => {
    test.prop([fc.string()])(
      "accepts any string input without throwing",
      (name) => {
        expect(() => isRouteName(name)).not.toThrow();
      },
    );

    test.prop([
      fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.object(),
        fc.array(fc.string()),
      ),
    ])("rejects non-string values", (value) => {
      expect(isRouteName(value)).toBe(false);
    });

    test.prop([fc.stringMatching(/^[A-Z_a-z][\w-]*(?:\.[A-Z_a-z][\w-]*)*$/)])(
      "accepts valid route names matching pattern",
      (name) => {
        // Skip if too long
        if (name.length > 10_000) {
          return;
        }

        expect(isRouteName(name)).toBe(true);
      },
    );

    test.prop([fc.stringMatching(/^@@.+$/)])(
      "accepts system routes starting with @@",
      (name) => {
        expect(isRouteName(name)).toBe(true);
      },
    );

    test.prop([fc.string({ minLength: 10_001 })])(
      "rejects strings exceeding MAX_ROUTE_NAME_LENGTH",
      (name) => {
        expect(isRouteName(name)).toBe(false);
      },
    );

    test.prop([fc.constant("")])("accepts empty string (root node)", (name) => {
      expect(isRouteName(name)).toBe(true);
    });

    test.prop([fc.constantFrom(" ", "  ", "\t", "\n", "\r")])(
      "rejects whitespace-only strings",
      (name) => {
        expect(isRouteName(name)).toBe(false);
      },
    );

    test.prop([fc.string().filter((s) => s.includes(".."))])(
      "rejects names with consecutive dots",
      (name) => {
        if (name.startsWith("@@")) {
          return; // System routes bypass validation
        }

        expect(isRouteName(name)).toBe(false);
      },
    );

    test.prop([fc.string().filter((s) => s.startsWith(".") && s.length > 1)])(
      "rejects names with leading dot",
      (name) => {
        if (name.startsWith("@@")) {
          return; // System routes bypass validation
        }

        expect(isRouteName(name)).toBe(false);
      },
    );

    test.prop([fc.string().filter((s) => s.endsWith(".") && s.length > 1)])(
      "rejects names with trailing dot",
      (name) => {
        if (name.startsWith("@@")) {
          return; // System routes bypass validation
        }

        expect(isRouteName(name)).toBe(false);
      },
    );
  });
});
