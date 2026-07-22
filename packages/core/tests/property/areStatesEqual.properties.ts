import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { arbState, createFixtureRouter, NUM_RUNS } from "./helpers";
import { DEFAULT_TRANSITION } from "../helpers";

import type { Params, State } from "@real-router/core";

describe("areStatesEqual Properties", () => {
  const router = createFixtureRouter();

  // areStatesEqual's param-comparison loop only runs when `state.name` is a
  // route the matcher knows AND that has URL params — `getUrlParams(name)` drives
  // the loop (StateNamespace :168-176). The fixture's `users.view` (path `/:id`)
  // exposes the URL param `id`, so states built here actually EXERCISE the
  // comparison engine. The old generator (`arbState`, random dotted names) made
  // `getUrlParams()` return `[]`, so the whole loop was dead and equality
  // collapsed to a name-only check — symmetry/transitivity/monotonicity held
  // vacuously and no param-comparison mutation could fail them.
  function viewState(params: Params): State {
    // path is irrelevant to areStatesEqual (it compares name + params only), so
    // a constant keeps the helper simple and array-valued `id` lint-safe.
    return {
      name: "users.view",
      params,
      search: {},
      path: "/users/x",
      transition: DEFAULT_TRANSITION,
      context: {},
    };
  }

  const arbIdValue = fc.stringMatching(/^[a-z0-9]{1,6}$/);
  const arbExtra = fc.stringMatching(/^[a-z0-9]{1,6}$/);

  /** Routed state on `users.view` with a real URL param `id` (+ optional non-URL `q`). */
  const arbRoutedState = fc
    .record({ id: arbIdValue, q: fc.option(arbExtra, { nil: undefined }) })
    .map(({ id, q }) => viewState(q === undefined ? { id } : { id, q }));

  test.prop([arbRoutedState], { numRuns: NUM_RUNS.thorough })(
    "reflexivity: areStatesEqual(s, s) === true",
    (state) => {
      expect(router.areStatesEqual(state, state)).toBe(true);
    },
  );

  test.prop([arbRoutedState, arbRoutedState], { numRuns: NUM_RUNS.thorough })(
    "symmetry: areStatesEqual(s1, s2) === areStatesEqual(s2, s1)",
    (s1, s2) => {
      expect(router.areStatesEqual(s1, s2)).toBe(router.areStatesEqual(s2, s1));
    },
  );

  test.prop([arbRoutedState, arbRoutedState, arbRoutedState], {
    numRuns: NUM_RUNS.standard,
  })("transitivity: equal(a,b) && equal(b,c) → equal(a,c)", (a, b, c) => {
    if (router.areStatesEqual(a, b) && router.areStatesEqual(b, c)) {
      expect(router.areStatesEqual(a, c)).toBe(true);
    }
  });

  test.prop([arbIdValue, arbIdValue], { numRuns: NUM_RUNS.thorough })(
    "URL-param sensitivity: equal iff the url param `id` matches (default ignoreQueryParams)",
    (id1, id2) => {
      // Dichotomy driving the getUrlParams("users.view")=["id"] loop directly.
      // If the param loop is removed (returns true after the name check), this
      // fails for id1 !== id2; if it over-compares it fails for id1 === id2.
      expect(
        router.areStatesEqual(viewState({ id: id1 }), viewState({ id: id2 })),
      ).toBe(id1 === id2);
    },
  );

  test.prop([arbIdValue, arbExtra, arbExtra], { numRuns: NUM_RUNS.standard })(
    "ignoreQueryParams axis: non-URL params ignored by default, compared when false",
    (id, q1, q2) => {
      fc.pre(q1 !== q2);

      const a = viewState({ id, q: q1 });
      const b = viewState({ id, q: q2 }); // same URL param, different non-URL param

      // default / explicit-true: only the URL param `id` is compared → equal
      expect(router.areStatesEqual(a, b)).toBe(true);
      expect(router.areStatesEqual(a, b, true)).toBe(true);
      // strict (false): all keys compared → the differing `q` makes them unequal
      expect(router.areStatesEqual(a, b, false)).toBe(false);
    },
  );

  test.prop([arbIdValue, arbIdValue, arbIdValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "array param values are compared element-wise (areParamValuesEqual recursion)",
    (x, y, z) => {
      fc.pre(y !== z);

      // An array-valued URL param exercises the array branch of
      // areParamValuesEqual (untested when every param value is a scalar).
      const same = router.areStatesEqual(
        viewState({ id: [x, y] }),
        viewState({ id: [x, y] }),
      );
      const diff = router.areStatesEqual(
        viewState({ id: [x, y] }),
        viewState({ id: [x, z] }),
      );

      expect(same).toBe(true);
      expect(diff).toBe(false);
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

  test.prop([arbRoutedState], { numRuns: NUM_RUNS.standard })(
    "one undefined: areStatesEqual(s, undefined) === false",
    (state) => {
      expect(router.areStatesEqual(state, undefined as unknown as State)).toBe(
        false,
      );
    },
  );

  test.prop([arbState, arbState], { numRuns: NUM_RUNS.thorough })(
    "different names implies not equal",
    (s1, s2) => {
      fc.pre(s1.name !== s2.name);

      // Name check short-circuits before the param loop, so arbitrary names are
      // the right generator here.
      expect(router.areStatesEqual(s1, s2)).toBe(false);
    },
  );
});
