import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { isStateStrict } from "type-guards";

import {
  paramsSimpleArbitrary,
  validRouteNameArbitrary,
  validRoutePathArbitrary,
} from "../helpers";

/**
 * Edge case tests for uncovered branches in state.ts
 * Focus: isStateStrict edge cases for better mutation killing
 */
describe("State Edge Cases (Uncovered Branches)", () => {
  describe("isStateStrict - Edge cases for better mutation killing", () => {
    test.prop(
      [
        fc.string(),
        fc.string(),
        fc.oneof(
          fc.constant(null),
          fc.string(), // Primitives fail
          fc.constant(Number.NaN),
        ),
      ],
      { numRuns: 5000 },
    )("rejects state with invalid params", (name, path, invalidParams) => {
      const state = { name, path, params: invalidParams };

      // Ensures isParamsStrict check is properly tested
      expect(isStateStrict(state)).toBe(false);
    });

    test.prop(
      [
        validRouteNameArbitrary,
        validRoutePathArbitrary,
        paramsSimpleArbitrary,
        fc.integer(),
      ],
      {
        numRuns: 5000,
      },
    )(
      "rejects state with meta.id as non-number",
      (name, path, params, idValue) => {
        const state = {
          name,
          path,
          params,
          meta: { id: `${idValue}` }, // String instead of number
        };

        expect(isStateStrict(state)).toBe(false);
      },
    );
  });
});
