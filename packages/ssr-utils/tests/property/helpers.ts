import { fc } from "@fast-check/vitest";

import type { State } from "@real-router/core/types";

/** Number of runs for different test categories */
export const NUM_RUNS = {
  fast: 100,
  standard: 500,
  thorough: 1000,
} as const;

/** Route name 1-4 segments */
const arbRouteName = fc
  .array(fc.stringMatching(/^[a-zA-Z_]\w{0,15}$/), {
    minLength: 1,
    maxLength: 4,
  })
  .map((a) => a.join("."));

/** Parameter value — string, integer, or boolean */
const arbParamValue = fc.oneof(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.integer({ min: 0, max: 9999 }),
  fc.boolean(),
);

/** Arbitrary params dictionary */
const arbParams = fc.dictionary(
  fc.stringMatching(/^[a-zA-Z_]\w{0,10}$/),
  arbParamValue,
  { maxKeys: 5 },
);

/**
 * Arbitrary State object. `transition` is a minimal valid `TransitionMeta`
 * shape — its content is never asserted on by the consuming property tests
 * (they only assert that `serializeRouterState` strips the field entirely),
 * so it does not need to mirror core's internal `DEFAULT_TRANSITION` (not a
 * public export — `@real-router/ssr-utils` builds its own fixture).
 */
export const arbState: fc.Arbitrary<State> = fc
  .record({
    name: arbRouteName,
    params: arbParams,
    path: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/${s}`),
  })
  .map((r) => ({
    name: r.name,
    params: r.params,
    search: {},
    path: r.path,
    transition: {
      phase: "activating" as const,
      reason: "success" as const,
      segments: {
        deactivated: [],
        activated: [],
        intersection: "",
      },
    },
    context: {},
  }));
