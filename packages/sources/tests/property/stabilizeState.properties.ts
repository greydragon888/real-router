import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbRouteName,
  createStartedRouter,
  NUM_RUNS,
  paramsForRoute,
} from "./helpers";
import { stabilizeState } from "../../src/stabilizeState.js";

import type { State } from "@real-router/core";

async function makeStateFromRouter(routeName: string): Promise<State> {
  const router = await createStartedRouter();

  await router.navigate(routeName, paramsForRoute(routeName)).catch(() => {});
  const state = router.getState()!;

  router.stop();

  return state;
}

function clonePathEquivalent(state: State): State {
  // Synthesize a state with the same path but fresh object identity. The
  // stabilizer's contract is that path equality (plus context.url.hash and
  // transition.reload) determines render identity — every other field can
  // differ without affecting the stabilization result.
  return { ...state, transition: { ...state.transition } } as State;
}

describe("stabilizeState — invariants", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "reflexivity: stabilizeState(x, x) === x",
    async (routeName) => {
      const state = await makeStateFromRouter(routeName);

      expect(stabilizeState(state, state)).toBe(state);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "path-equivalence: prev.path === next.path → result === prev",
    async (routeName) => {
      const state = await makeStateFromRouter(routeName);
      const clone = clonePathEquivalent(state);

      expect(state).not.toBe(clone);
      expect(state.path).toBe(clone.path);
      expect(stabilizeState(state, clone)).toBe(state);
    },
  );

  test.prop([arbRouteName, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "path-divergence: prev.path !== next.path → result === next",
    async (a, b) => {
      fc.pre(a !== b);

      const prev = await makeStateFromRouter(a);
      const next = await makeStateFromRouter(b);

      fc.pre(prev.path !== next.path);

      expect(stabilizeState(prev, next)).toBe(next);
    },
  );

  test.prop([arbRouteName, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "idempotency: stabilize(a, stabilize(a, b)) === stabilize(a, b)",
    async (a, b) => {
      const prev = await makeStateFromRouter(a);
      const next =
        a === b ? clonePathEquivalent(prev) : await makeStateFromRouter(b);

      const once = stabilizeState(prev, next);
      const twice = stabilizeState(prev, once);

      expect(twice).toBe(once);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "absorption (left nullish): stabilizeState(undefined, state) === state",
    async (routeName) => {
      const state = await makeStateFromRouter(routeName);

      expect(stabilizeState<State | undefined>(undefined, state)).toBe(state);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "absorption (right nullish): stabilizeState(state, undefined) === undefined",
    async (routeName) => {
      const state = await makeStateFromRouter(routeName);

      expect(
        stabilizeState<State | undefined>(state, undefined),
      ).toBeUndefined();
    },
  );
});

describe("stabilizeState — reload-aware (#605)", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "reload flag bypasses dedupe: same path, next.transition.reload=true → returns next",
    async (routeName) => {
      const router = await createStartedRouter();

      await router
        .navigate(routeName, paramsForRoute(routeName))
        .catch(() => {});

      const prev = router.getState()!;

      // Reload navigation against the same target produces a fresh state with
      // transition.reload=true; stabilizer must surface it.
      try {
        await router.navigate(routeName, paramsForRoute(routeName), {
          reload: true,
        });
      } catch {
        // ignore — some route names may emit ROUTE_NOT_FOUND for invalid params
      }

      const next = router.getState()!;

      router.stop();

      if (
        prev !== next &&
        prev.path === next.path &&
        next.transition.reload === true
      ) {
        expect(stabilizeState(prev, next)).toBe(next);
      }
    },
  );
});

describe("stabilizeState — boundary cases (audit §6.1)", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "null first arg with State next: returns next (not-State nullish absorption)",
    async (routeName) => {
      const state = await makeStateFromRouter(routeName);

      // Cast — RouterTransitionSnapshot uses `State | null`, and stabilizeState
      // accepts that via its generic parameter. With prev=null and next=state,
      // the implementation falls through to the path-divergence branch and
      // returns next.
      const result = stabilizeState<State | null>(null, state);

      expect(result).toBe(state);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "null both args: returns null (prev preserved)",
    async () => {
      const result = stabilizeState<State | null>(null, null);

      expect(result).toBeNull();
    },
  );
});
