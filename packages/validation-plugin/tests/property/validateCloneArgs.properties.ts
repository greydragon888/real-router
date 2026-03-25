import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  plainObjectArbitrary,
  nonObjectNonUndefinedArbitrary,
  nonPlainObjectArbitrary,
} from "./helpers";
import { validateCloneArgs } from "../../src/validators/dependencies";

describe("validateCloneArgs — property-based", () => {
  it("undefined always passes", () => {
    expect(() => {
      validateCloneArgs(undefined);
    }).not.toThrow();
  });

  test.prop([plainObjectArbitrary], { numRuns: 10_000 })(
    "plain objects with primitive values never throw",
    (obj) => {
      expect(() => {
        validateCloneArgs(obj);
      }).not.toThrow();
    },
  );

  test.prop([nonObjectNonUndefinedArbitrary], { numRuns: 5000 })(
    "non-objects (excluding undefined) always throw TypeError",
    (value) => {
      expect(() => {
        validateCloneArgs(value);
      }).toThrow(TypeError);
    },
  );

  test.prop([nonPlainObjectArbitrary], { numRuns: 3000 })(
    "non-plain objects (Map, Set, Date, RegExp) always throw TypeError",
    (value) => {
      expect(() => {
        validateCloneArgs(value);
      }).toThrow(TypeError);
    },
  );

  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    ],
    { numRuns: 3000 },
  )("objects with getter properties always throw TypeError", (key, value) => {
    const obj = {};

    Object.defineProperty(obj, key, { get: () => value, enumerable: true });

    expect(() => {
      validateCloneArgs(obj);
    }).toThrow(TypeError);
    expect(() => {
      validateCloneArgs(obj);
    }).toThrow("Getters not allowed");
  });

  test.prop([plainObjectArbitrary], { numRuns: 2000 })(
    "idempotent — calling twice with same input gives same result",
    (obj) => {
      const run = () => {
        validateCloneArgs(obj);
      };
      let threw1 = false;
      let threw2 = false;

      try {
        run();
      } catch {
        threw1 = true;
      }

      try {
        run();
      } catch {
        threw2 = true;
      }

      expect(threw1).toBe(threw2);
    },
  );
});
