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
  return { ...state, transition: { ...state.transition } };
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
        await router.navigate(routeName, paramsForRoute(routeName), undefined, {
          reload: true,
        });
      } catch {
        // ignore — some route names may emit ROUTE_NOT_FOUND for invalid params
      }

      const next = router.getState()!;

      router.stop();

      // Use fc.pre (instead of a silent `if`) so fast-check sees discards and
      // can shrink toward inputs that actually exercise the reload branch.
      fc.pre(prev !== next);
      fc.pre(prev.path === next.path);
      fc.pre(next.transition.reload === true);

      expect(stabilizeState(prev, next)).toBe(next);
    },
  );
});

describe("stabilizeState — hash-aware (#532)", () => {
  // Build path-equal states that differ only in `state.context.url.hash`.
  // The stabilizer must surface `next` when hash differs, and return `prev`
  // when both path and hash match.
  function withHash(base: State, hash: string | undefined): State {
    const context = { ...base.context, url: { hash } };

    return { ...base, context, transition: { ...base.transition } };
  }

  test.prop(
    [
      arbRouteName,
      fc.string({ minLength: 0, maxLength: 8 }).filter((s) => !s.includes("#")),
      fc.string({ minLength: 0, maxLength: 8 }).filter((s) => !s.includes("#")),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "same path, different hash → returns next",
    async (routeName, hashA, hashB) => {
      fc.pre(hashA !== hashB);

      const baseState = await makeStateFromRouter(routeName);
      const prev = withHash(baseState, hashA);
      const next = withHash(baseState, hashB);

      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(next);
    },
  );

  test.prop(
    [
      arbRouteName,
      fc.string({ minLength: 0, maxLength: 8 }).filter((s) => !s.includes("#")),
    ],
    { numRuns: NUM_RUNS.standard },
  )("same path, same hash → returns prev (dedup)", async (routeName, hash) => {
    const baseState = await makeStateFromRouter(routeName);
    const prev = withHash(baseState, hash);
    const next = withHash(baseState, hash);

    expect(prev).not.toBe(next);
    expect(prev.path).toBe(next.path);
    expect(stabilizeState(prev, next)).toBe(prev);
  });

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "prev has hash, next doesn't (or vice versa) → returns next",
    async (routeName) => {
      const baseState = await makeStateFromRouter(routeName);
      const withHashState = withHash(baseState, "anchor");
      const withoutHashState = withHash(baseState, undefined);

      // Either direction must surface `next`: removing or adding a hash
      // changes effective URL identity, so render must update.
      expect(stabilizeState(withHashState, withoutHashState)).toBe(
        withoutHashState,
      );
      expect(stabilizeState(withoutHashState, withHashState)).toBe(
        withHashState,
      );
    },
  );
});

function withReload(base: State, reload: boolean): State {
  return {
    ...base,
    transition: { ...base.transition, reload },
  };
}

describe("stabilizeState — reload-aware (broader PBT)", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "fully-synthetic reload state: prev.path === next.path, next.reload=true → returns next",
    async (routeName) => {
      const baseState = await makeStateFromRouter(routeName);
      const prev = withReload(baseState, false);
      const next = withReload(baseState, true);

      expect(prev).not.toBe(next);
      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(next);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "synthetic non-reload state: prev.path === next.path → returns prev (dedup)",
    async (routeName) => {
      const baseState = await makeStateFromRouter(routeName);
      const prev = withReload(baseState, false);
      const next = withReload(baseState, false);

      expect(prev).not.toBe(next);
      expect(stabilizeState(prev, next)).toBe(prev);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "reload-bypass is one-way: prev.reload=true alone doesn't bypass dedup",
    async (routeName) => {
      const baseState = await makeStateFromRouter(routeName);
      const prev = withReload(baseState, true);
      const next = withReload(baseState, false);

      // Only `next.transition.reload === true` triggers the bypass. A trailing
      // non-reload nav after a reload must dedup normally.
      expect(stabilizeState(prev, next)).toBe(prev);
    },
  );
});

describe("stabilizeState — transitivity, defensive read, hash×reload (audit §2/§6 MEDIUM)", () => {
  function withHash(base: State, hash: string | undefined): State {
    const ctx = base.context;
    const url = (ctx.url as Record<string, unknown> | undefined) ?? {};

    return {
      ...base,
      context: { ...ctx, url: { ...url, hash } },
    };
  }

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "transitivity for path-equal triples: stab(stab(a, b), c) === stab(a, b) (all path-equal, no reload)",
    async (routeName) => {
      const base = await makeStateFromRouter(routeName);
      const a = clonePathEquivalent(base);
      const b = clonePathEquivalent(base);
      const c = clonePathEquivalent(base);

      // Path-equal triple, no reload — stabilizer must always collapse to the
      // first state ref. Chained calls in createRouteSource rely on this so a
      // sequence of N idempotent navigations produces ONE snapshot ref.
      const left = stabilizeState(stabilizeState(a, b), c);
      const right = stabilizeState(a, stabilizeState(b, c));

      expect(left).toBe(a);
      expect(right).toBe(a);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "hash flip beats reload=false: same path + hash diff → returns next regardless of reload",
    async (routeName) => {
      const base = await makeStateFromRouter(routeName);
      const prev = withReload(withHash(base, "alpha"), false);
      const next = withReload(withHash(base, "beta"), false);

      expect(stabilizeState(prev, next)).toBe(next);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "hash same + reload=true: reload wins, returns next",
    async (routeName) => {
      const base = await makeStateFromRouter(routeName);
      const prev = withReload(withHash(base, "shared"), false);
      const next = withReload(withHash(base, "shared"), true);

      expect(stabilizeState(prev, next)).toBe(next);
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "hash undefined ↔ '' is observable: stabilizer treats them as different (cross-plugin semantics)",
    async (routeName) => {
      const base = await makeStateFromRouter(routeName);
      // hash-plugin runtime: no `url` namespace at all → readContextHash → undefined.
      // browser-plugin runtime: writes `{ hash: "" }` → readContextHash → "".
      // The stabilizer's behaviour on this mismatch determines whether a
      // cross-plugin transition de-duplicates or emits a fresh state.
      const ctxA: Record<string, unknown> = { ...(base.context as object) };

      delete ctxA.url;
      const prev = { ...base, context: ctxA } as State;
      const next = withHash(base, "");

      // Path equal, hash undefined vs "" differs → returns next.
      expect(stabilizeState(prev, next)).toBe(next);
    },
  );

  test("defensive read: malformed state without `.transition` does not throw", () => {
    // Synthetic state lacking the mandatory `transition` field — a plugin
    // misbehaving (or a future fork) shouldn't crash readReloadFlag.
    const malformed = {
      path: "/x",
      name: "x",
      params: {},
      context: {},
    } as unknown as State;
    const malformedNext = {
      path: "/x",
      name: "x",
      params: {},
      context: {},
    } as unknown as State;

    // Path equal, no transition → defensive false on both → returns prev.
    expect(() => stabilizeState(malformed, malformedNext)).not.toThrow();
    expect(stabilizeState(malformed, malformedNext)).toBe(malformed);
  });
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
