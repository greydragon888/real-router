// packages/type-guards/tests/property/validators.properties.ts

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { validateRouteName, validateState } from "type-guards";

import { stateMinimalArbitrary } from "../helpers";

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
        }).not.toThrowError();
      },
    );

    test.prop([fc.stringMatching(/^@@.+$/)])(
      "accepts system routes without throwing",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).not.toThrowError();
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
      }).toThrowError(TypeError);
      expect(() => {
        validateRouteName(value, "test");
      }).toThrowError("[router.test]");
    });

    test.prop([fc.constant("")])(
      "accepts empty string (root node) without throwing",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).not.toThrowError();
      },
    );

    test.prop([fc.constantFrom(" ", "  ", "\t", "\n")])(
      "throws for whitespace-only strings",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).toThrowError(TypeError);
        expect(() => {
          validateRouteName(name, "test");
        }).toThrowError("whitespace");
      },
    );

    test.prop([fc.string({ minLength: 10_001 })])(
      "throws for strings exceeding MAX_ROUTE_NAME_LENGTH",
      (name) => {
        expect(() => {
          validateRouteName(name, "test");
        }).toThrowError(TypeError);
        expect(() => {
          validateRouteName(name, "test");
        }).toThrowError("maximum length");
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
        }).toThrowError(TypeError);
      },
    );

    test.prop([fc.constantFrom("add", "remove", "navigate", "matchPath")])(
      "includes method name in error message",
      (methodName) => {
        // Use invalid route name (whitespace) to trigger error
        expect(() => {
          validateRouteName(" ", methodName);
        }).toThrowError(`[router.${methodName}]`);
      },
    );
  });

  describe("validateState", () => {
    test.prop([stateMinimalArbitrary])(
      "accepts valid state objects without throwing",
      (state) => {
        expect(() => {
          validateState(state, "test");
        }).not.toThrowError();
      },
    );

    test.prop([
      fc.oneof(
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.string(),
        fc.array(fc.string()),
      ),
    ])("throws TypeError for non-object values", (value) => {
      expect(() => {
        validateState(value, "test");
      }).toThrowError(TypeError);
      expect(() => {
        validateState(value, "test");
      }).toThrowError("[test]");
    });

    test.prop([
      fc.record({
        name: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        params: fc.object(),
        path: fc.string(),
      }),
    ])("throws for invalid name type", (state) => {
      expect(() => {
        validateState(state, "test");
      }).toThrowError(TypeError);
      expect(() => {
        validateState(state, "test");
      }).toThrowError("Invalid state");
    });

    test.prop([
      fc.record({
        name: fc.string(),
        params: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
        path: fc.string(),
      }),
    ])("throws for invalid params type", (state) => {
      expect(() => {
        validateState(state, "test");
      }).toThrowError(TypeError);
    });

    test.prop([
      fc.record({
        name: fc.string(),
        params: fc.object(),
        path: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
      }),
    ])("throws for invalid path type", (state) => {
      expect(() => {
        validateState(state, "test");
      }).toThrowError(TypeError);
    });

    test.prop([fc.constantFrom("navigate", "matchPath", "setState")])(
      "includes method name in error message",
      (methodName) => {
        expect(() => {
          validateState(null, methodName);
        }).toThrowError(`[${methodName}]`);
      },
    );
  });
});
