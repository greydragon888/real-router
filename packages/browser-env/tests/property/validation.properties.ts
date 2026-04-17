import { fc, test } from "@fast-check/vitest";

import {
  NUM_RUNS,
  testDefaults,
  arbValidPartialOpts,
  arbInvalidPartialOpts,
} from "./helpers";
import {
  createOptionsValidator,
  nonNegativeIntegerRule,
  safeBaseRule,
} from "../../src";

describe("createOptionsValidator Properties", () => {
  const validate = createOptionsValidator(testDefaults, "property-test");

  describe("valid types pass without error", () => {
    test.prop([arbValidPartialOpts], { numRuns: NUM_RUNS.standard })(
      "valid partial options do not throw",
      (opts) => {
        const cleaned = Object.fromEntries(
          Object.entries(opts).filter(([, v]) => v !== undefined),
        );

        expect(() => {
          validate(cleaned);
        }).not.toThrow();
      },
    );
  });

  describe("invalid types throw Error", () => {
    test.prop([arbInvalidPartialOpts], { numRuns: NUM_RUNS.standard })(
      "type-mismatched options throw an Error",
      (opts) => {
        expect(() => {
          validate(opts as never);
        }).toThrow(Error);
      },
    );
  });

  describe("undefined opts pass without error", () => {
    test("undefined options do not throw", () => {
      expect(() => {
        validate(undefined);
      }).not.toThrow();
    });
  });

  describe("safeBaseRule", () => {
    // eslint-disable-next-line no-control-regex -- testing the rule means constructing control-char inputs
    const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

    test.prop(
      [fc.string({ maxLength: 20 }).filter((s) => !CONTROL_CHARS.test(s))],
      { numRuns: NUM_RUNS.fast },
    )(
      "accepts strings free of control chars and '..' segments",
      (value: string) => {
        fc.pre(!value.split("/").includes(".."));

        expect(safeBaseRule.validate(value)).toBeNull();
      },
    );

    test.prop([fc.stringMatching(CONTROL_CHARS)], {
      numRuns: NUM_RUNS.fast,
    })("rejects strings containing control chars", (value: string) => {
      expect(safeBaseRule.validate(value)).not.toBeNull();
    });
  });

  describe("nonNegativeIntegerRule", () => {
    test.prop([fc.integer({ min: 0, max: 1_000_000 })], {
      numRuns: NUM_RUNS.standard,
    })("accepts non-negative integers", (n: number) => {
      expect(nonNegativeIntegerRule.validate(n)).toBeNull();
    });

    test.prop([fc.integer({ min: -1_000_000, max: -1 })], {
      numRuns: NUM_RUNS.fast,
    })("rejects negative integers", (n: number) => {
      expect(nonNegativeIntegerRule.validate(n)).not.toBeNull();
    });

    test.prop(
      [
        fc
          .double({ noNaN: false, noDefaultInfinity: false })
          .filter((n) => !Number.isInteger(n) || !Number.isFinite(n)),
      ],
      { numRuns: NUM_RUNS.standard },
    )("rejects non-integer or non-finite numbers", (n: number) => {
      expect(nonNegativeIntegerRule.validate(n)).not.toBeNull();
    });
  });

  describe("unknown keys are tolerated", () => {
    test.prop(
      [
        arbValidPartialOpts,
        fc.stringMatching(/^[a-z]{3,10}$/).filter((k) => !(k in testDefaults)),
        fc.anything(),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "keys not present in defaults do not cause errors",
      (validOpts, unknownKey, unknownValue) => {
        const opts = { ...validOpts, [unknownKey]: unknownValue };
        const cleaned = Object.fromEntries(
          Object.entries(opts).filter(([, v]) => v !== undefined),
        );

        expect(() => {
          validate(cleaned);
        }).not.toThrow();
      },
    );
  });
});
