import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createFixtureRouter, arbState, arbParams, NUM_RUNS } from "./helpers";
import { DEFAULT_TRANSITION } from "../../src/constants";

import type { Params, State } from "@real-router/core";

describe("areStatesEqual Properties", () => {
  const router = createFixtureRouter();

  test.prop([arbState], { numRuns: NUM_RUNS.thorough })(
    "reflexivity: areStatesEqual(s, s) === true",
    (state) => {
      expect(router.areStatesEqual(state, state)).toBe(true);
    },
  );

  test.prop([arbState, arbState], { numRuns: NUM_RUNS.thorough })(
    "symmetry: areStatesEqual(s1, s2) === areStatesEqual(s2, s1)",
    (s1, s2) => {
      expect(router.areStatesEqual(s1, s2)).toBe(router.areStatesEqual(s2, s1));
    },
  );

  it("both undefined: areStatesEqual(undefined, undefined) === true", () => {
    expect(
      router.areStatesEqual(
        undefined as unknown as State,
        undefined as unknown as State,
      ),
    ).toBe(true);
  });

  test.prop([arbState], { numRuns: NUM_RUNS.standard })(
    "one undefined: areStatesEqual(s, undefined) === false",
    (state) => {
      expect(router.areStatesEqual(state, undefined as unknown as State)).toBe(
        false,
      );
    },
  );

  test.prop([arbState, arbParams as fc.Arbitrary<Params>], {
    numRuns: NUM_RUNS.standard,
  })(
    "monotonicity of ignoreQueryParams: equal without ignore → equal with ignore",
    (state, extraParams) => {
      const s2: State = {
        name: state.name,
        params: { ...state.params, ...extraParams },
        path: state.path,
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      const equalStrict = router.areStatesEqual(state, s2, false);
      const equalIgnore = router.areStatesEqual(state, s2, true);

      if (equalStrict) {
        expect(equalIgnore).toBe(true);
      }
    },
  );

  test.prop([arbState, arbState], { numRuns: NUM_RUNS.thorough })(
    "different names implies not equal",
    (s1, s2) => {
      fc.pre(s1.name !== s2.name);

      expect(router.areStatesEqual(s1, s2)).toBe(false);
    },
  );

  test.prop([arbState, arbState, arbState], { numRuns: NUM_RUNS.standard })(
    "transitivity: equal(a,b) && equal(b,c) → equal(a,c)",
    (a, b, c) => {
      const ab = router.areStatesEqual(a, b);
      const bc = router.areStatesEqual(b, c);

      if (ab && bc) {
        expect(router.areStatesEqual(a, c)).toBe(true);
      }
    },
  );
});
