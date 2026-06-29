// #1027/#1028: `normalizeParams` collapses an all-undefined (or empty) param
// dict to the shared frozen `EMPTY_PARAMS` singleton, so `makeState`'s
// `params === EMPTY_PARAMS` reuse branch fires and an empty-params navigation
// allocates zero transient `{}`.
//
// Coverage blind spot this closes: the functional `empty-params-reuse.test.ts`
// pins the singleton identity only for GENUINE no-params navigations (no params
// argument at all). `normalizeParams.test.ts` exercises the undefined-strip loop
// but only THROUGH `buildPath`, which consumes params internally — identity is
// not observable there. Neither sees the case the property below generates: a
// params DICT whose every value is `undefined`, driven through the PUBLIC
// `navigate()` so the committed `state.params` identity is observable.
//
// Discriminating power: asserts `state.params === EMPTY_PARAMS` by IDENTITY.
// The regression `normalized ??= {}` → eager `normalized = {}` (src/helpers.ts)
// returns a FRESH `{}` for an all-undefined dict — deep-equal to `{}` but a
// distinct reference — which FAILS this `.toBe` while passing every
// deep-equality assertion. (Verified: the audit confirmed ~99/100 generated
// dicts carry ≥1 undefined key, i.e. exercise the strip loop, not just `{}`.)

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbParamKey, createStartedRouter, NUM_RUNS } from "./helpers";
import { EMPTY_PARAMS } from "../../src/constants";

// Param-less fixture routes: an all-undefined dict on these has no surviving
// path/query param, so `normalizeParams` returns the shared singleton.
const arbParamlessRoute = fc.constantFrom(
  "home",
  "users.list",
  "admin.dashboard",
  "admin.settings",
);

// A Record whose every value is `undefined` (≥1 key in ~99% of runs — the
// discriminating case; the rare empty dict also collapses to EMPTY_PARAMS).
const arbAllUndefinedParams = fc.dictionary(
  arbParamKey,
  fc.constant(undefined),
  { maxKeys: 8 },
);

describe("empty-params reuse: all-undefined dict → EMPTY_PARAMS singleton (#1027/#1028)", () => {
  test.prop([arbParamlessRoute, arbAllUndefinedParams], {
    numRuns: NUM_RUNS.fast,
  })(
    "navigating a param-less route with an all-undefined param dict commits the shared frozen EMPTY_PARAMS singleton",
    async (route, undefinedParams) => {
      // Start on a param-bearing route so the param-less target is always a
      // different state (no SAME_STATES rejection).
      const router = await createStartedRouter("/users/abc");

      try {
        const state = await router.navigate(route, undefinedParams);

        // Identity, not deep-equality: the all-undefined dict must collapse onto
        // the shared frozen singleton, never a fresh `{}`.
        expect(state.params).toBe(EMPTY_PARAMS);
        expect(Object.isFrozen(state.params)).toBe(true);
      } finally {
        router.stop();
      }
    },
  );
});
