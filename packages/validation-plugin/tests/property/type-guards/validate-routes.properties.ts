import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { validateRouteName } from "../../../src/type-guards";
import { isRouteName } from "../../../src/type-guards/guards/routes";

describe("Validators - Property-Based Tests", () => {
  describe("validateRouteName", () => {
    test.prop([fc.stringMatching(/^[A-Z_a-z][\w-]*(?:\.[A-Z_a-z][\w-]*)*$/)])(
      "accepts valid route names without throwing",
      (name) => {
        // Skip if too long
        if (name.length > 10_000) {
          return;
        }

        expect(() => {
          validateRouteName(name, "test");
        }).not.toThrow();
      },
    );

    test.prop([fc.stringMatching(/^@@.+$/)])(
      "accepts system routes without throwing",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).not.toThrow();
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
    ])("throws TypeError for non-string values", (value) => {
      expect(() => {
        validateRouteName(value, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateRouteName(value, "test");
      }).toThrow("[router.test]");
    });

    test.prop([fc.constant("")])(
      "accepts empty string (root node) without throwing",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).not.toThrow();
      },
    );

    test.prop([fc.constantFrom(" ", "  ", "\t", "\n")])(
      "throws for whitespace-only strings",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).toThrow(TypeError);
        expect(() => {
          validateRouteName(name, "test");
        }).toThrow("whitespace");
      },
    );

    test.prop([fc.string({ minLength: 10_001 })])(
      "throws for strings exceeding MAX_ROUTE_NAME_LENGTH",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).toThrow(TypeError);
        expect(() => {
          validateRouteName(name, "test");
        }).toThrow("maximum length");
      },
    );

    test.prop([fc.string().filter((s) => s.includes(".."))])(
      "throws for names with consecutive dots",
      (name) => {
        if (name.startsWith("@@")) {
          return; // System routes bypass validation
        }

        expect(() => {
          validateRouteName(name, "test");
        }).toThrow(TypeError);
      },
    );

    test.prop([fc.constantFrom("add", "remove", "navigate", "matchPath")])(
      "includes method name in error message",
      (methodName) => {
        // Use invalid route name (whitespace) to trigger error
        expect(() => {
          validateRouteName(" ", methodName);
        }).toThrow(`[router.${methodName}]`);
      },
    );

    // ===================================================================
    // INV 82: validateRouteName ↔ isRouteName bidirectional equivalence
    // ===================================================================
    test.prop([fc.anything()], { numRuns: 5000 })(
      "validateRouteName(x) succeeds if and only if isRouteName(x) is true",
      (value) => {
        const guardResult = isRouteName(value);
        let validatorSucceeded: boolean;

        try {
          validateRouteName(value, "test");
          validatorSucceeded = true;
        } catch {
          validatorSucceeded = false;
        }

        expect(validatorSucceeded).toBe(guardResult);
      },
    );
  });
});
