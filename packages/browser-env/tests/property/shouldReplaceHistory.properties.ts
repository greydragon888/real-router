import { fc, test } from "@fast-check/vitest";

import {
  NUM_RUNS,
  arbNavigationOptions,
  arbState,
  makeMockRouter,
} from "./helpers";
import { shouldReplaceHistory } from "../../src";

import type { NavigationOptions, State } from "@real-router/core";

describe("shouldReplaceHistory Properties", () => {
  describe("replace: true — always returns true", () => {
    test.prop(
      [arbState, fc.option(arbState, { nil: undefined }), fc.boolean()],
      { numRuns: NUM_RUNS.standard },
    )(
      "navOptions.replace === true forces replaceState",
      (toState: State, fromState: State | undefined, equal: boolean) => {
        const router = makeMockRouter(equal);
        const navOptions: NavigationOptions = { replace: true };

        expect(
          shouldReplaceHistory(navOptions, toState, fromState, router),
        ).toBe(true);
      },
    );
  });

  describe("fromState === undefined — always returns true", () => {
    test.prop([arbNavigationOptions, arbState, fc.boolean()], {
      numRuns: NUM_RUNS.standard,
    })(
      "first navigation (no fromState) forces replaceState",
      (navOptions: NavigationOptions, toState: State, equal: boolean) => {
        const optsWithoutReplace: NavigationOptions = {
          ...navOptions,
          replace: undefined,
        };
        const router = makeMockRouter(equal);

        expect(
          shouldReplaceHistory(optsWithoutReplace, toState, undefined, router),
        ).toBe(true);
      },
    );
  });

  describe("reload && areStatesEqual — returns true", () => {
    test.prop([arbState], { numRuns: NUM_RUNS.standard })(
      "reload to same state forces replaceState",
      (state: State) => {
        const router = makeMockRouter(true);
        const navOptions: NavigationOptions = {
          replace: false,
          reload: true,
        };

        expect(shouldReplaceHistory(navOptions, state, state, router)).toBe(
          true,
        );
      },
    );
  });

  describe("normal navigation — returns false", () => {
    test.prop([arbState, arbState], { numRuns: NUM_RUNS.standard })(
      "non-replace, non-reload, different states returns false",
      (toState: State, fromState: State) => {
        const router = makeMockRouter(false);
        const navOptions: NavigationOptions = {
          replace: false,
          reload: false,
        };

        expect(
          shouldReplaceHistory(navOptions, toState, fromState, router),
        ).toBe(false);
      },
    );
  });
});
