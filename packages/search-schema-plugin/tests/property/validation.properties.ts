import fc from "fast-check";
import { describe, it, expect } from "vitest";

import { validateOptions } from "../../src/validation";

import type { SearchSchemaPluginOptions } from "../../src/types";

// =============================================================================
// Arbitraries
// =============================================================================

const arbDefinedValidMode = fc.constantFrom(
  "development" as const,
  "production" as const,
);

const arbInvalidMode = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s !== "development" && s !== "production");

const arbInvalidStrict: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.constant(null),
  fc.array(fc.anything(), { maxLength: 3 }),
);

const arbInvalidOnError: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.anything(), { maxLength: 3 }),
);

// =============================================================================
// Factory Options Validation
// =============================================================================

describe("Factory Options Validation", () => {
  it("Valid mode accepted", () => {
    fc.assert(
      fc.property(arbDefinedValidMode, (mode) => {
        expect(() => {
          validateOptions({ mode });
        }).not.toThrow();
      }),
    );

    expect(() => {
      validateOptions({});
    }).not.toThrow();
  });

  it("Invalid mode rejected", () => {
    fc.assert(
      fc.property(arbInvalidMode, (mode) => {
        expect(() => {
          validateOptions({ mode: mode as "development" });
        }).toThrow(TypeError);
      }),
    );
  });

  it("Valid strict accepted", () => {
    fc.assert(
      fc.property(fc.boolean(), (strict) => {
        expect(() => {
          validateOptions({ strict });
        }).not.toThrow();
      }),
    );

    expect(() => {
      validateOptions({});
    }).not.toThrow();
  });

  it("Invalid strict rejected", () => {
    fc.assert(
      fc.property(arbInvalidStrict, (strict) => {
        expect(() => {
          validateOptions({ strict: strict as boolean });
        }).toThrow(TypeError);
      }),
    );
  });

  it("Valid onError accepted", () => {
    fc.assert(
      fc.property(fc.func(fc.constant({} as Record<string, unknown>)), (fn) => {
        expect(() => {
          validateOptions({
            onError: fn as NonNullable<SearchSchemaPluginOptions["onError"]>,
          });
        }).not.toThrow();
      }),
    );

    expect(() => {
      validateOptions({});
    }).not.toThrow();
  });

  it("Invalid onError rejected", () => {
    fc.assert(
      fc.property(arbInvalidOnError, (onError) => {
        expect(() => {
          validateOptions({
            onError: onError as NonNullable<
              SearchSchemaPluginOptions["onError"]
            >,
          });
        }).toThrow(TypeError);
      }),
    );
  });
});
