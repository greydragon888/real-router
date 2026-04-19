import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  validOptionsArbitrary,
  nonObjectArbitrary,
  unknownKeyArbitrary,
  invalidEnumFieldArbitrary,
  invalidEnumValueArbitrary,
  limitKeyArbitrary,
  outOfBoundsLimitArbitrary,
} from "./helpers";
import { validateOptions } from "../../src/validators/options";

describe("validateOptions — property-based", () => {
  test.prop([validOptionsArbitrary], { numRuns: 10_000 })(
    "valid options never throw",
    (options) => {
      expect(() => {
        validateOptions(options, "test");
      }).not.toThrow();
    },
  );

  test.prop([nonObjectArbitrary], { numRuns: 5000 })(
    "non-object inputs always throw TypeError",
    (value) => {
      expect(() => {
        validateOptions(value, "test");
      }).toThrow(TypeError);
    },
  );

  test.prop([validOptionsArbitrary, unknownKeyArbitrary], { numRuns: 5000 })(
    "unknown keys always throw TypeError",
    (options, extraKey) => {
      const withExtra = { ...options, [extraKey]: "value" };

      expect(() => {
        validateOptions(withExtra, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions(withExtra, "test");
      }).toThrow("Unknown option");
    },
  );

  test.prop([invalidEnumFieldArbitrary, invalidEnumValueArbitrary], {
    numRuns: 5000,
  })("invalid enum values always throw TypeError", (field, badValue) => {
    const options = { [field]: badValue };

    expect(() => {
      validateOptions(options, "test");
    }).toThrow(TypeError);
  });

  test.prop([validOptionsArbitrary], { numRuns: 5000 })(
    "partial options (random subset of valid fields) never throw",
    (fullOptions) => {
      const keys = Object.keys(fullOptions);
      const keepCount = Math.floor(keys.length / 2);
      const partial: Record<string, unknown> = {};

      for (let i = 0; i < keepCount; i++) {
        const key = keys[i];

        partial[key] = fullOptions[key];
      }

      expect(() => {
        validateOptions(partial, "test");
      }).not.toThrow();
    },
  );

  test.prop([limitKeyArbitrary], { numRuns: 3000 })(
    "limit values outside bounds always throw RangeError",
    (key) => {
      fc.assert(
        fc.property(outOfBoundsLimitArbitrary(key), (badValue) => {
          const options = { limits: { [key]: badValue } };

          try {
            validateOptions(options, "test");

            return false;
          } catch (error) {
            return error instanceof RangeError;
          }
        }),
        { numRuns: 50 },
      );
    },
  );

  test.prop([validOptionsArbitrary], { numRuns: 2000 })(
    "idempotent — calling twice with same input gives same result",
    (options) => {
      const run = () => {
        validateOptions(options, "test");
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

  test.prop(
    [
      fc.integer({ min: 1, max: 100_000 }).chain((max) =>
        fc.record({
          maxListeners: fc.constant(max),
          warnListeners: fc.integer({ min: max + 1, max: max + 100_000 }),
        }),
      ),
    ],
    { numRuns: 2000 },
  )(
    "warnListeners > maxListeners always throws RangeError (#471 case 1)",
    ({ maxListeners, warnListeners }) => {
      // fast-check's .chain upper bound can exceed LIMIT_BOUNDS.warnListeners
      // (100_000); clamp so we only exercise the cross-field path, not the
      // per-field bounds path.
      const clampedWarn = Math.min(warnListeners, 100_000);

      // Skip if clamping collapsed the inequality (max=100_000, warn=100_001
      // → clampedWarn=100_000 == max). Cross-field check uses strict `>`.
      if (clampedWarn <= maxListeners) {
        return;
      }

      expect(() => {
        validateOptions(
          { limits: { maxListeners, warnListeners: clampedWarn } },
          "test",
        );
      }).toThrow(RangeError);
    },
  );
});
