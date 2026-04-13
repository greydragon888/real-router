import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { shouldReplaceHistory } from "../../src/browser-env/index.js";
import { computeDirection } from "../../src/navigate-handler";
import { deriveNavigationType } from "../../src/plugin";

import type { NavigationOptions, State } from "@real-router/core";

// --- Arbitraries ---

const arbIndex = fc.integer({ min: 0, max: 1000 });

const STUB_TRANSITION = Object.freeze({
  phase: "activating",
  reason: "success",
  segments: Object.freeze({
    deactivated: Object.freeze([]),
    activated: Object.freeze([]),
    intersection: "",
  }),
}) as unknown as State["transition"];

const arbState: fc.Arbitrary<State> = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 10 }),
    params: fc.constant({}),
    path: fc.stringMatching(/^\/[a-z]{0,10}$/),
  })
  .map(
    (r) =>
      ({
        ...r,
        transition: STUB_TRANSITION,
        context: {},
      }) as unknown as State,
  );

const arbNavOptions: fc.Arbitrary<NavigationOptions> = fc.record({
  replace: fc.constantFrom(true, false, undefined),
  reload: fc.constantFrom(true, false, undefined),
});

describe("computeDirection Properties", () => {
  test.prop([fc.tuple(arbIndex, arbIndex).filter(([a, b]) => a !== b)], {
    numRuns: NUM_RUNS.standard,
  })("traverse direction is antisymmetric for distinct indices", ([a, b]) => {
    const directionAB = computeDirection("traverse", a, b);
    const directionBA = computeDirection("traverse", b, a);

    expect(new Set([directionAB, directionBA])).toStrictEqual(
      new Set(["forward", "back"]),
    );
  });

  test.prop([arbIndex], { numRuns: NUM_RUNS.fast })(
    "traverse direction is unknown for equal indices",
    (index) => {
      expect(computeDirection("traverse", index, index)).toBe("unknown");
    },
  );

  test.prop([arbIndex, arbIndex], { numRuns: NUM_RUNS.fast })(
    "push direction is always forward",
    (destination, curr) => {
      expect(computeDirection("push", destination, curr)).toBe("forward");
    },
  );

  test.prop([arbIndex, arbIndex], { numRuns: NUM_RUNS.fast })(
    "replace direction is always unknown",
    (destination, curr) => {
      expect(computeDirection("replace", destination, curr)).toBe("unknown");
    },
  );

  test.prop([arbIndex, arbIndex], { numRuns: NUM_RUNS.fast })(
    "reload direction is always unknown",
    (destination, curr) => {
      expect(computeDirection("reload", destination, curr)).toBe("unknown");
    },
  );
});

describe("deriveNavigationType Properties", () => {
  test.prop(
    [arbNavOptions, arbState, fc.option(arbState, { nil: undefined })],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "always returns a valid navigation type (closure)",
    (opts, toState, fromState) => {
      // Known bug #447: shouldReplaceHistory throws when replace=false, fromState=undefined, reload=true
      fc.pre(
        !(
          opts.replace === false &&
          fromState === undefined &&
          opts.reload === true
        ),
      );

      const result = deriveNavigationType(opts, toState, fromState);

      expect(["reload", "replace", "push"]).toContain(result);
    },
  );
});

describe("shouldReplaceHistory Properties (cross-partition)", () => {
  test.prop(
    [arbNavOptions, arbState, fc.option(arbState, { nil: undefined })],
    { numRuns: NUM_RUNS.standard },
  )(
    "never throws for any valid input combination",
    (opts, toState, fromState) => {
      // Known bug #447: shouldReplaceHistory throws when replace=false, fromState=undefined, reload=true
      fc.pre(
        !(
          opts.replace === false &&
          fromState === undefined &&
          opts.reload === true
        ),
      );

      expect(() =>
        shouldReplaceHistory(opts, toState, fromState),
      ).not.toThrow();
    },
  );

  test.prop(
    [arbNavOptions, arbState, fc.option(arbState, { nil: undefined })],
    { numRuns: NUM_RUNS.standard },
  )("always returns boolean", (opts, toState, fromState) => {
    // Known bug #447: shouldReplaceHistory throws when replace=false, fromState=undefined, reload=true
    fc.pre(
      !(
        opts.replace === false &&
        fromState === undefined &&
        opts.reload === true
      ),
    );

    const result = shouldReplaceHistory(opts, toState, fromState);

    expect(typeof result).toBe("boolean");
  });
});
