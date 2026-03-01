import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isHistoryState, isStateStrict } from "type-guards";

import {
  paramsSimpleArbitrary,
  validRouteNameArbitrary,
  validRoutePathArbitrary,
} from "../helpers";

/**
 * Edge case tests for uncovered branches in state.ts
 * Focus: isHistoryState function (lines 133-162)
 * Goal: Increase coverage from 90.8% to 95%+
 */
describe("State Edge Cases (Uncovered Branches)", () => {
  describe("isHistoryState - Basic structure validation (lines 133-135)", () => {
    test.prop(
      [fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))],
      { numRuns: 10_000 },
    )("rejects primitive values", (value) => {
      // Line 133: if (typeof value !== "object" || value === null)
      expect(isHistoryState(value)).toBe(false);

      return true;
    });

    it("rejects null specifically", () => {
      // Line 133: value === null check
      expect(isHistoryState(null)).toBe(false);

      return true;
    });

    it("rejects undefined specifically", () => {
      // Line 133: typeof value !== "object"
      expect(isHistoryState(undefined)).toBe(false);

      return true;
    });
  });

  describe("isHistoryState - Required fields validation (lines 140-146)", () => {
    test.prop(
      [validRouteNameArbitrary, validRoutePathArbitrary, paramsSimpleArbitrary],
      {
        numRuns: 10_000,
      },
    )(
      "accepts valid history state with name, path, params, meta",
      (name, path, params) => {
        const historyState = {
          name,
          path,
          params,
          meta: { id: 1, params: {} },
        };

        // Lines 140-143: All type checks should pass
        expect(isHistoryState(historyState)).toBe(true);

        return true;
      },
    );

    test.prop([fc.integer(), fc.string(), paramsSimpleArbitrary], {
      numRuns: 5000,
    })("rejects state with non-string name", (name, path, params) => {
      const state = {
        name,
        path,
        params,
        meta: { id: 1, params: {} },
      };

      // Line 141: typeof obj.name !== "string"
      expect(isHistoryState(state)).toBe(false);

      return true;
    });

    test.prop([fc.string(), fc.integer(), paramsSimpleArbitrary], {
      numRuns: 5000,
    })("rejects state with non-string path", (name, path, params) => {
      const state = {
        name,
        path,
        params,
        meta: { id: 1, params: {} },
      };

      // Line 142: typeof obj.path !== "string"
      expect(isHistoryState(state)).toBe(false);

      return true;
    });

    test.prop(
      [
        fc.string(),
        fc.string(),
        fc.oneof(
          fc.constant(null),
          fc.string(), // Primitives fail isParamsStrict
          fc.constant(Number.NaN), // NaN fails
        ),
      ],
      { numRuns: 5000 },
    )("rejects state with invalid params", (name, path, invalidParams) => {
      const state = {
        name,
        path,
        params: invalidParams,
        meta: { id: 1, params: {} },
      };

      // Line 143: !isParamsStrict(obj.params)
      expect(isHistoryState(state)).toBe(false);

      return true;
    });
  });

  describe("isHistoryState - Meta validation (lines 149-162)", () => {
    test.prop(
      [validRouteNameArbitrary, validRoutePathArbitrary, paramsSimpleArbitrary],
      {
        numRuns: 5000,
      },
    )("rejects state without meta field", (name, path, params) => {
      const state = { name, path, params };

      // Line 149: !("meta" in obj)
      expect(isHistoryState(state)).toBe(false);

      return true;
    });

    test.prop(
      [validRouteNameArbitrary, validRoutePathArbitrary, paramsSimpleArbitrary],
      {
        numRuns: 5000,
      },
    )("rejects state with null meta", (name, path, params) => {
      const state = { name, path, params, meta: null };

      // Line 149: obj.meta === null
      expect(isHistoryState(state)).toBe(false);

      return true;
    });

    test.prop(
      [
        validRouteNameArbitrary,
        validRoutePathArbitrary,
        paramsSimpleArbitrary,
        fc.string(),
      ],
      {
        numRuns: 5000,
      },
    )("rejects state with non-object meta", (name, path, params, metaValue) => {
      const state = { name, path, params, meta: metaValue };

      // Line 149: typeof obj.meta !== "object"
      expect(isHistoryState(state)).toBe(false);

      return true;
    });

    test.prop(
      [
        fc.string(),
        fc.string(),
        paramsSimpleArbitrary,
        fc.oneof(
          fc.string(), // Primitives fail
          fc.constant(null),
          fc.constant(Number.NaN),
        ),
      ],
      { numRuns: 10_000 },
    )(
      "rejects meta with invalid params field",
      (name, path, params, metaParams) => {
        const state = {
          name,
          path,
          params,
          meta: { params: metaParams, id: 1 },
        };

        // Line 157: "params" in meta && !isParamsStrict(meta.params)
        expect(isHistoryState(state)).toBe(false);

        return true;
      },
    );

    test.prop(
      [
        validRouteNameArbitrary,
        validRoutePathArbitrary,
        paramsSimpleArbitrary,
        fc.string(),
      ],
      {
        numRuns: 10_000,
      },
    )(
      "rejects meta with non-number id field",
      (name, path, params, idValue) => {
        const state = {
          name,
          path,
          params,
          meta: { id: idValue },
        };

        // Line 159: "id" in meta && typeof meta.id !== "number"
        expect(isHistoryState(state)).toBe(false);

        return true;
      },
    );
  });

  describe("isHistoryState - Valid combinations covering all branches", () => {
    test.prop(
      [validRouteNameArbitrary, validRoutePathArbitrary, paramsSimpleArbitrary],
      {
        numRuns: 10_000,
      },
    )("accepts state with minimal meta", (name, path, params) => {
      // Meta with no optional fields - exercises all !(...) checks passing
      const state = {
        name,
        path,
        params,
        meta: {},
      };

      expect(isHistoryState(state)).toBe(true);

      return true;
    });

    test.prop(
      [
        validRouteNameArbitrary,
        validRoutePathArbitrary,
        paramsSimpleArbitrary,
        paramsSimpleArbitrary,
      ],
      { numRuns: 10_000 },
    )("accepts state with meta.params", (name, path, params, metaParams) => {
      // Line 157: "params" in meta && isParamsStrict(meta.params) === true
      const state = {
        name,
        path,
        params,
        meta: { params: metaParams },
      };

      expect(isHistoryState(state)).toBe(true);

      return true;
    });

    test.prop(
      [
        validRouteNameArbitrary,
        validRoutePathArbitrary,
        paramsSimpleArbitrary,
        fc.integer(),
      ],
      {
        numRuns: 10_000,
      },
    )("accepts state with meta.id", (name, path, params, id) => {
      // Line 159: "id" in meta && typeof meta.id === "number"
      const state = {
        name,
        path,
        params,
        meta: { id },
      };

      expect(isHistoryState(state)).toBe(true);

      return true;
    });
  });

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

      return true;
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

        return true;
      },
    );
  });
});
