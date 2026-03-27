import { fc, test } from "@fast-check/vitest";

import { NUM_RUNS, arbNavigationOptions, arbState } from "./helpers";
import { shouldReplaceHistory } from "../../src";

import type { NavigationOptions, State } from "@real-router/core";

describe("shouldReplaceHistory Properties", () => {
  describe("replace: true — always returns true", () => {
    test.prop([arbState, fc.option(arbState, { nil: undefined })], {
      numRuns: NUM_RUNS.standard,
    })(
      "navOptions.replace === true forces replaceState",
      (toState: State, fromState: State | undefined) => {
        const navOptions: NavigationOptions = { replace: true };

        expect(shouldReplaceHistory(navOptions, toState, fromState)).toBe(true);
      },
    );
  });

  describe("fromState === undefined — always returns true", () => {
    test.prop([arbNavigationOptions, arbState], {
      numRuns: NUM_RUNS.standard,
    })(
      "first navigation (no fromState) forces replaceState",
      (navOptions: NavigationOptions, toState: State) => {
        const optsWithoutReplace: NavigationOptions = {
          ...navOptions,
          replace: undefined,
        };

        expect(
          shouldReplaceHistory(optsWithoutReplace, toState, undefined),
        ).toBe(true);
      },
    );
  });

  describe("reload && same path — returns true", () => {
    test.prop([arbState], { numRuns: NUM_RUNS.standard })(
      "reload to same state forces replaceState",
      (state: State) => {
        const navOptions: NavigationOptions = {
          replace: false,
          reload: true,
        };

        expect(shouldReplaceHistory(navOptions, state, state)).toBe(true);
      },
    );
  });

  describe("normal navigation — returns false", () => {
    test.prop([arbState, arbState], { numRuns: NUM_RUNS.standard })(
      "non-replace, non-reload, different states returns false",
      (toState: State, fromState: State) => {
        const navOptions: NavigationOptions = {
          replace: false,
          reload: false,
        };

        expect(shouldReplaceHistory(navOptions, toState, fromState)).toBe(
          false,
        );
      },
    );
  });
});
