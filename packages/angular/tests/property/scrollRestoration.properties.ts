// @vitest-environment jsdom
// packages/angular/tests/property/scrollRestoration.properties.ts

/**
 * Property-based tests for `createScrollRestoration` from
 * `packages/angular/src/dom-utils/scroll-restore.ts` (git-tracked copy of the
 * shared source).
 *
 * Closes audit-2026-05-16 §6.2 invariant 6 (HIGH):
 *
 *   canonicalJson({a:1, b:2}) === canonicalJson({b:2, a:1})
 *
 * Without this property the internal `keyOf(state)` cannot serve as a stable
 * cache key — two semantically equivalent param sets would land in different
 * sessionStorage slots, and the back/traverse restore would miss the saved
 * scroll position.
 *
 * Because `canonicalJson` and `keyOf` are private helpers we exercise the
 * property through observable behaviour: install scroll-restoration, simulate
 * a navigation that saves a position, fire a second navigation with
 * key-reordered params, and assert sessionStorage contains exactly ONE entry.
 */

import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createScrollRestoration } from "../../src/dom-utils";

import type { Router, State } from "@real-router/core";

interface RouterSubscribeArg {
  route: State;
  previousRoute: State | undefined;
}

function makeMockRouter(initialState: State): {
  router: Router;
  emit: (route: State, previousRoute?: State) => void;
  destroy: () => void;
} {
  let listener: ((arg: RouterSubscribeArg) => void) | undefined;

  const router = {
    getState: () => initialState,
    subscribe: (fn: (arg: RouterSubscribeArg) => void) => {
      listener = fn;

      return () => {
        listener = undefined;
      };
    },
  } as unknown as Router;

  return {
    router,
    emit: (route, previousRoute) => {
      listener?.({ route, previousRoute: previousRoute ?? undefined });
    },
    destroy: () => {
      listener = undefined;
    },
  };
}

function makeState(
  name: string,
  params: Record<string, string | number | boolean>,
): State {
  return {
    name,
    params,
    path: "/x",
    context: { navigation: { direction: "forward", navigationType: "push" } },
    // `transition` is read by the rAF snap (`route.transition.reload/replace`).
    // The previous async-rAF model let that access throw unobserved; firing rAF
    // synchronously (to settle each frame, see beforeEach) surfaces it, so the
    // mock must carry a real (empty) transition slice.
    transition: {},
  } as unknown as State;
}

describe("createScrollRestoration — canonicalJson key-order stability (audit §6.2 #6 HIGH)", () => {
  let storageKey: string;
  let counter = 0;

  beforeEach(() => {
    // Deterministic per-test key (sonarjs/pseudo-random forbids Math.random).
    counter++;
    storageKey = `scrollProp-${counter}`;
    sessionStorage.clear();
    // Fire rAF synchronously so the snap/restore effect settles between the
    // two emits. The capture of `previousRoute` is gated on `scrollSettled`
    // (#782) — two emits in the SAME frame are treated as a transit and the
    // second capture is skipped. Settling each frame models two SEPARATE,
    // committed navigations, which is what this key-stability property tests.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    globalThis.scrollTo({ top: 0, left: 0 });
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  test.prop(
    [
      fc.dictionary(
        fc.stringMatching(/^[a-z]{1,4}$/),
        fc.oneof(
          fc.string({ maxLength: 4 }),
          fc.integer({ min: -100, max: 100 }),
        ),
        { minKeys: 2, maxKeys: 6 },
      ),
    ],
    { numRuns: NUM_RUNS.thorough },
  )(
    "putPos under params={k1,k2,...} and params={kN,...,k1} (reverse order) share a sessionStorage slot",
    (params) => {
      const reversedParams: Record<string, string | number> = {};
      const keys = Object.keys(params);

      for (let i = keys.length - 1; i >= 0; i--) {
        reversedParams[keys[i]] = params[keys[i]];
      }

      const initial = makeState("a", {});
      const stateFirstOrder = makeState("a", params);
      const stateReverseOrder = makeState("a", reversedParams);

      const { router, emit } = makeMockRouter(initial);

      const restoration = createScrollRestoration(router, {
        mode: "restore",
        storageKey,
      });

      // First navigation: `previousRoute === stateFirstOrder` triggers putPos.
      // (route → unrelated state to avoid same-state guards downstream.)
      emit(makeState("b", {}), stateFirstOrder);
      // Second navigation: putPos again, now with `previousRoute` whose params
      // are the SAME values but in reversed insertion order.
      emit(makeState("c", {}), stateReverseOrder);

      const raw = sessionStorage.getItem(storageKey);

      expect(raw).not.toBeNull();

      const stored = JSON.parse(raw!) as Record<string, number>;
      const storedKeys = Object.keys(stored);

      // Both putPos calls collapse to one cache slot — canonicalJson produced
      // an identical serialization for the two key-order variants.
      expect(storedKeys).toHaveLength(1);

      restoration.destroy();
    },
  );

  test.prop(
    [
      fc.dictionary(
        fc.stringMatching(/^[a-z]{1,4}$/),
        fc.string({ maxLength: 4 }),
        { minKeys: 1, maxKeys: 4 },
      ),
      fc.dictionary(
        fc.stringMatching(/^[a-z]{1,4}$/),
        fc.string({ maxLength: 4 }),
        { minKeys: 1, maxKeys: 4 },
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "different param sets (not just reorders) land in different sessionStorage slots",
    (paramsA, paramsB) => {
      // Quick structural check — when the two param maps are structurally
      // identical (same keys, same values), they MUST collide. Otherwise the
      // property below would be checking the wrong contract.
      const sortedJson = (o: Record<string, string>): string =>
        JSON.stringify(
          Object.fromEntries(
            Object.keys(o)
              .toSorted((a, b) => a.localeCompare(b))
              .map((k) => [k, o[k]]),
          ),
        );

      fc.pre(sortedJson(paramsA) !== sortedJson(paramsB));

      const initial = makeState("root", {});
      const stateA = makeState("a", paramsA);
      const stateB = makeState("a", paramsB);

      const { router, emit } = makeMockRouter(initial);
      const restoration = createScrollRestoration(router, {
        mode: "restore",
        storageKey,
      });

      emit(makeState("x", {}), stateA);
      emit(makeState("y", {}), stateB);

      const raw = sessionStorage.getItem(storageKey);

      expect(raw).not.toBeNull();

      const stored = JSON.parse(raw!) as Record<string, number>;

      // Structurally distinct params → two distinct slots.
      expect(Object.keys(stored)).toHaveLength(2);

      restoration.destroy();
    },
  );
});
