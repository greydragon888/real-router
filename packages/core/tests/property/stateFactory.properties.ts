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
