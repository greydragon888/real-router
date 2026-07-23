import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { NUM_RUNS, arbFullState } from "./helpers";
import { canSkipPopstateHistoryWrite } from "../../../src/browser-env";

import type { Browser } from "../../../src/browser-env";
import type { State } from "@real-router/core";

// areStatesEqual with ignoreQueryParams=false compares name + all params and
// never touches the route tree, so any router instance works as the reference.
// Wrapped in an arrow (not destructured) to avoid vitest/unbound-method.
const router = createRouter([{ name: "x", path: "/x" }]);
const areStatesEqual = (
  a: State,
  b: State,
  ignoreQueryParams: boolean,
): boolean => router.areStatesEqual(a, b, ignoreQueryParams);

// Minimal Browser exposing only the field the guard reads (`getState`); the
// cast is sound because the guard never touches any other Browser method.
const browserWithState = (getState: () => unknown): Browser =>
  ({ getState }) as unknown as Browser;

const triplet = (
  s: State,
): { name: string; params: State["params"]; path: string } => ({
  name: s.name,
  params: { ...s.params },
  path: s.path,
});

describe("canSkipPopstateHistoryWrite Properties", () => {
  describe("no getState reader — never skips (opt-in, non-breaking)", () => {
    test.prop([arbFullState], { numRuns: NUM_RUNS.standard })(
      "a Browser without getState always keeps the write",
      (toState: State) => {
        expect(
          canSkipPopstateHistoryWrite(toState, {} as Browser, areStatesEqual),
        ).toBe(false);
      },
    );
  });

  describe("corrupted / missing history.state — never skips", () => {
    test.prop(
      [
        arbFullState,
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ foo: fc.integer() }),
          fc.string(),
          fc.integer(),
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "an invalid-shape live history.state always keeps the write",
      (toState: State, garbage: unknown) => {
        expect(
          canSkipPopstateHistoryWrite(
            toState,
            browserWithState(() => garbage),
            areStatesEqual,
          ),
        ).toBe(false);
      },
    );
  });

  describe("restored entry identical to resolved — skips", () => {
    test.prop([arbFullState], { numRuns: NUM_RUNS.standard })(
      "an identical {name,params,path} live entry allows the skip",
      (toState: State) => {
        expect(
          canSkipPopstateHistoryWrite(
            toState,
            browserWithState(() => triplet(toState)),
            areStatesEqual,
          ),
        ).toBe(true);
      },
    );
  });

  describe("path differs — never skips (normalization / redirect)", () => {
    test.prop([arbFullState], { numRuns: NUM_RUNS.standard })(
      "a live entry with the same name/params but a different path keeps the write",
      (toState: State) => {
        const live = { ...triplet(toState), path: `${toState.path}/extra` };

        expect(
          canSkipPopstateHistoryWrite(
            toState,
            browserWithState(() => live),
            areStatesEqual,
          ),
        ).toBe(false);
      },
    );
  });

  describe("params differ, same path — never skips (defaultParams / drift)", () => {
    test.prop([arbFullState], { numRuns: NUM_RUNS.standard })(
      "a live entry with an extra param but identical path keeps the write",
      (toState: State) => {
        const live = {
          ...triplet(toState),
          params: { ...toState.params, __drift: "z" },
        };

        expect(
          canSkipPopstateHistoryWrite(
            toState,
            browserWithState(() => live),
            areStatesEqual,
          ),
        ).toBe(false);
      },
    );
  });

  describe("SAFETY — a skip implies the write would be a value-level no-op", () => {
    // Correlate `live` with `toState` so the skip branch is actually reached:
    // sometimes an exact clone (→ skip), sometimes a mutation or garbage (→ keep).
    const arbCase = arbFullState.chain((toState) =>
      fc.tuple(
        fc.constant(toState),
        fc.oneof(
          fc.constant(triplet(toState)),
          fc.constant({ ...triplet(toState), path: `${toState.path}/x` }),
          fc.constant({
            ...triplet(toState),
            params: { ...toState.params, __x: "1" },
          }),
          fc.constant(null),
          fc.record({ garbage: fc.boolean() }),
        ),
      ),
    );

    test.prop([arbCase], { numRuns: NUM_RUNS.thorough })(
      "skip === true ⟹ live path equals resolved path and areStatesEqual holds; result is always boolean",
      ([toState, live]: [State, unknown]) => {
        const skip = canSkipPopstateHistoryWrite(
          toState,
          browserWithState(() => live),
          areStatesEqual,
        );

        expect(typeof skip).toBe("boolean");

        if (skip) {
          const committed = live as State;

          expect(committed.path).toBe(toState.path);

          // `canSkipPopstateHistoryWrite` backfills an empty query bag for a
          // search-less (pre-M2, #1548) live entry before comparing; mirror that
          // here so this independent invariant re-check compares the same
          // normalized shape instead of throwing on the missing `search` channel.
          const normalized: State =
            (committed as Partial<State>).search === undefined
              ? { ...committed, search: {} }
              : committed;

          expect(areStatesEqual(toState, normalized, false)).toBe(true);
        }
      },
    );
  });
});
