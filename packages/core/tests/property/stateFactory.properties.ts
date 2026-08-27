import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createFixtureRouter, arbIdParam, NUM_RUNS } from "./helpers";

describe("makeState Properties", () => {
  const router = createFixtureRouter();
  const pluginApi = getPluginApi(router);

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "makeState returns a frozen state",
    (params) => {
      const path = router.buildPath("users.view", params);
      const state = pluginApi.makeState("users.view", params, undefined, path);

      expect(Object.isFrozen(state)).toBe(true);
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "makeState determinism: same args produce structurally equal states (except id)",
    (params) => {
      const path = router.buildPath("users.view", params);
      const s1 = pluginApi.makeState("users.view", params, undefined, path);
      const s2 = pluginApi.makeState("users.view", params, undefined, path);

      expect(s1.name).toBe(s2.name);
      expect(s1.path).toBe(s2.path);
      expect(s1.params).toStrictEqual(s2.params);
    },
  );

  // ── #1550 / #1551: `undefined` is absence on BOTH sides of the merge ────────
  //
  // Class-guard for the whole leak: whatever mix of route defaults and caller
  // values is thrown at the factory, no channel of the committed state may carry
  // an `undefined`-valued own key — and where the caller said `undefined`, the
  // route default must survive (it means "I said nothing", not "clear it").
  const arbMaybeValue = fc.option(fc.stringMatching(/^[a-z0-9]{1,4}$/), {
    nil: undefined,
  });

  test.prop([arbMaybeValue, arbMaybeValue, arbMaybeValue, arbMaybeValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "no undefined-valued own key survives into either channel",
    (defaultParam, callerParam, defaultQuery, callerQuery) => {
      const scoped = createRouter([
        { name: "home", path: "/home" },
        {
          name: "m",
          path: "/m?q",
          defaultParams: { p: defaultParam },
          defaultSearch: { q: defaultQuery },
        },
      ]);
      const state = getPluginApi(scoped).makeState(
        "m",
        { p: callerParam },
        { q: callerQuery },
      );

      for (const channel of [state.params, state.search]) {
        for (const [key, value] of Object.entries(channel)) {
          expect(value, `own key "${key}" must not be undefined`).toBeDefined();
        }
      }

      // The default fills the slot exactly when the caller supplied nothing.
      const expectedParam = callerParam ?? defaultParam;

      expect(state.params.p).toStrictEqual(expectedParam);
      expect(Object.hasOwn(state.params, "p")).toBe(
        expectedParam !== undefined,
      );

      const expectedQuery = callerQuery ?? defaultQuery;

      expect(state.search.q).toStrictEqual(expectedQuery);
      expect(Object.hasOwn(state.search, "q")).toBe(
        expectedQuery !== undefined,
      );
    },
  );
});

describe("the terminal reads the route name once (#1883)", () => {
  /**
   * ⚠ Written with the last batch's lesson in hand: a property whose generator
   * cannot produce the hazard is green and empty. Here the hazard is a name that
   * is not a string, so the generator produces those DELIBERATELY — a plain
   * string is the control arm, not the subject.
   */
  const arbNonStringName = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.integer({ min: 0, max: 999 }),
    fc.boolean(),
    fc.constant({}),
    fc.array(fc.constantFrom("home", "other"), { minLength: 1, maxLength: 1 }),
  );

  const ROUTES = [
    { name: "home", path: "/home", defaultParams: { who: "HOME" } },
    { name: "other", path: "/other", defaultParams: { who: "OTHER" } },
  ];

  test.prop([fc.oneof(fc.constantFrom("home", "other"), arbNonStringName)], {
    numRuns: NUM_RUNS.standard,
  })("the published state.name is always a string", (name) => {
    const router = createRouter(ROUTES as never);

    try {
      const state = getPluginApi(router).makeState(name as never, {}, {}, "/x");

      expect(typeof state.name).toBe("string");
      // `[object Object]` for the plain-object arm is the ASSERTION, not an
      // accident: the property says the door publishes exactly what one
      // `ToPropertyKey` of the caller's value yields, whatever that is.
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the default stringification is the expected value here (#1883)
      expect(state.name).toBe(String(name));
    } finally {
      router.dispose();
    }
  });

  test.prop(
    [fc.constantFrom("home", "other"), fc.constantFrom("home", "other")],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "a DRIFTING name resolves as its FIRST read names, never a later one",
    (first, second) => {
      let reads = 0;
      const drifting = {
        toString() {
          reads += 1;

          return reads <= 1 ? first : second;
        },
      } as unknown as string;

      const router = createRouter(ROUTES as never);

      try {
        const drifted = getPluginApi(router).makeState(drifting, {}, {}, "/x");
        const plain = getPluginApi(router).makeState(first, {}, {}, "/x");

        expect(drifted.name).toBe(plain.name);
        expect(drifted.params).toStrictEqual(plain.params);
        expect(reads, "one read, so the second answer is unreachable").toBe(1);
      } finally {
        router.dispose();
      }
    },
  );
});
