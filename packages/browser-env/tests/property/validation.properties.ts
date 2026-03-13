import { fc, test } from "@fast-check/vitest";

import {
  NUM_RUNS,
  testDefaults,
  arbValidPartialOpts,
  arbInvalidPartialOpts,
} from "./helpers";
import { createOptionsValidator } from "../../src";

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
        }).not.toThrowError();
      },
    );
  });

  describe("invalid types throw Error", () => {
    test.prop([arbInvalidPartialOpts], { numRuns: NUM_RUNS.standard })(
      "type-mismatched options throw an Error",
      (opts) => {
        expect(() => {
          validate(opts as never);
        }).toThrowError(Error);
      },
    );
  });

  describe("undefined opts pass without error", () => {
    test("undefined options do not throw", () => {
      expect(() => {
        validate(undefined);
      }).not.toThrowError();
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
        }).not.toThrowError();
      },
    );
  });
});
