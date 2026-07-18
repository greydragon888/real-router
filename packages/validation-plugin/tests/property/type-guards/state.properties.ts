import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  stateMinimalArbitrary,
  stateFullArbitrary,
  invalidStateArbitrary,
  arbitraryInvalidTypes,
  paramsSimpleArbitrary,
  structuralParamsArbitrary,
  validRouteNameArbitrary,
  validRoutePathArbitrary,
} from "./helpers";
import { isParams, isState } from "../../../src/type-guards";
import { isRouteName } from "../../../src/type-guards/guards/routes";

describe("State Type Guards Properties", () => {
  describe("isState", () => {
    test.prop([stateMinimalArbitrary], { numRuns: 10_000 })(
      "always returns true for minimal valid State",
      (state) => {
        expect(isState(state)).toBe(true);
      },
    );

    test.prop([stateFullArbitrary], { numRuns: 10_000 })(
      "always returns true for full State with meta",
      (state) => {
        expect(isState(state)).toBe(true);
      },
    );

    test.prop([invalidStateArbitrary], { numRuns: 10_000 })(
      "returns false for invalid State (missing required fields or wrong types)",
      (state) => {
        // isState validates via isRequiredFields:
        // - name must be a valid route name (via isRouteName)
        // - path must be a string (typeof check)
        // - params must be valid params (via isParams)
        //
        // invalidStateArbitrary generates invalid states, so all should be false
        expect(isState(state)).toBe(false);
      },
    );

    test.prop([arbitraryInvalidTypes], { numRuns: 10_000 })(
      "returns false for primitives",
      (value) => {
        expect(isState(value)).toBe(false);
      },
    );

    test.prop([stateMinimalArbitrary], { numRuns: 2000 })(
      "deterministic result",
      (state) => {
        const result1 = isState(state);
        const result2 = isState(state);

        expect(result1).toBe(result2);
        expect(result1).toBe(true);
      },
    );

    it("handles null and undefined", () => {
      expect(isState(null)).toBe(false);
      expect(isState(undefined)).toBe(false);
    });

    test.prop(
      [validRouteNameArbitrary, validRoutePathArbitrary, paramsSimpleArbitrary],
      { numRuns: 3000 },
    )("State with valid name/path/params", (name, path, params) => {
      const state = { name, path, params };

      expect(isState(state)).toBe(true);
    });
  });

  describe("Invariants between State guards", () => {
    // ===================================================================
    // INV 83: isState component decomposition
    // ===================================================================
    test.prop(
      [validRouteNameArbitrary, validRoutePathArbitrary, paramsSimpleArbitrary],
      { numRuns: 5000 },
    )(
      "isState(x) implies isRouteName(x.name) and isParams(x.params)",
      (name, path, params) => {
        const state = { name, path, params };

        if (isState(state)) {
          expect(isRouteName(state.name)).toBe(true);
          expect(typeof state.path).toBe("string");
          expect(isParams(state.params)).toBe(true);
        }
      },
    );

    // ===================================================================
    // INV: isState delegates structural params validation to isParams — it
    // must reject cyclic / class-instance params and accept shared-reference
    // (diamond) params exactly as isParams does, since params reaching isState
    // (e.g. user-supplied navigation params) may carry such structures.
    // ===================================================================
    test.prop([structuralParamsArbitrary], { numRuns: 10_000 })(
      "isState follows isParams for structural params (cycles, diamonds, instances)",
      (params) => {
        const state = { name: "home", path: "/", params };

        // With a valid name and path, isState reduces to isParams(params).
        expect(isState(state)).toBe(isParams(params));
      },
    );
  });

  describe("Edge cases", () => {
    it("State with valid name/path", () => {
      expect(isState({ name: "home", path: "", params: {} })).toBe(true);
    });

    test.prop([validRouteNameArbitrary, validRoutePathArbitrary], {
      numRuns: 2000,
    })("State with various valid name/path", (name, path) => {
      const state = { name, path, params: {} };

      expect(isState(state)).toBe(true);
    });

    it("State with additional fields", () => {
      const state = {
        name: "test",
        path: "/test",
        params: {},
        extraField: "should be allowed",
      };

      expect(isState(state)).toBe(true);
    });

    test.prop([stateMinimalArbitrary], { numRuns: 2000 })(
      "mutation of State after validation does not affect result",
      (state) => {
        const result1 = isState(state);

        // Mutate state
        state.name = "mutated";

        const result2 = isState(state);

        // Both results should be true
        expect(result1).toBe(true);
        expect(result2).toBe(true);
      },
    );
  });
});
