// packages/react/tests/property/navigateWithHash.properties.ts

/**
 * Property-based tests for `navigateWithHash` (#532).
 *
 * The helper wraps `router.navigate(name, params, opts)` with same-route
 * different-hash detection. The invariants:
 *
 * - **Same route + same hash → pass-through:** opts.force / opts.hashChange
 *   must NOT be set by the helper. Adding them would force an extra
 *   transition where core's SAME_STATES would correctly reject.
 * - **Same route + different hash → auto-bypass:** opts.force=true and
 *   opts.hashChange=true must be set so subscribers can disambiguate via
 *   `state.context.url.hashChanged`. Without this, hash-only navigation
 *   would silently no-op against core's SAME_STATES check.
 * - **Different route → no hash bypass:** the auto-force logic must NOT
 *   fire on cross-route navigations, even if the hash matches — those go
 *   through the normal navigation path.
 * - **opts.hash propagation:** when `hash !== undefined`, it must appear in
 *   the opts object handed to router.navigate.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbHash, arbParams, arbRouteName, NUM_RUNS } from "./helpers";
import { navigateWithHash } from "../../src/dom-utils";

import type {
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/core";

interface NavigateCall {
  name: string;
  params: Params;
  opts: NavigationOptions & { hash?: string; hashChange?: boolean };
}

function makeRouter(
  current: { name: string; params: Params; hash: string } | undefined,
): { router: Router; calls: NavigateCall[] } {
  const calls: NavigateCall[] = [];

  const router = {
    getState: () =>
      current === undefined
        ? undefined
        : ({
            name: current.name,
            params: current.params,
            context: { url: { hash: current.hash } },
          } as unknown as State),
    navigate: (
      name: string,
      params: Params,
      _search: unknown,
      opts?: NavigationOptions & { hash?: string; hashChange?: boolean },
    ) => {
      calls.push({ name, params, opts: opts ?? {} });

      return Promise.resolve({ name, params } as unknown as State);
    },
  } as unknown as Router;

  return { router, calls };
}

describe("navigateWithHash — Property Tests", () => {
  describe("Invariant 1: same route + same hash → no force / no hashChange", () => {
    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.thorough })(
      "current state matches → opts pass through unchanged",
      (routeName, hash) => {
        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash,
        });

        void navigateWithHash(router, routeName, {}, undefined, hash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // Neither flag must be auto-added when there's no hash change.
        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        // hash itself is still propagated to the navigate call.
        expect(opts.hash).toBe(hash);
      },
    );
  });

  describe("Invariant 2: same route + different hash → force + hashChange", () => {
    test.prop([arbRouteName, arbHash, arbHash], { numRuns: NUM_RUNS.thorough })(
      "different current/new hash → auto-bypass SAME_STATES",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);
        // arbHash never yields undefined; the helper's "preserve current"
        // branch (hash === undefined) is exercised separately in Invariant 4.

        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, routeName, {}, undefined, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBe(true);
        expect(opts.hash).toBe(newHash);
      },
    );
  });

  describe("Invariant 3: different route → no auto-bypass even if hash differs", () => {
    test.prop([arbRouteName, arbRouteName, arbHash, arbHash], {
      numRuns: NUM_RUNS.thorough,
    })(
      "cross-route navigation skips the same-route hash logic",
      (currentName, targetName, currentHash, newHash) => {
        fc.pre(currentName !== targetName);

        const { router, calls } = makeRouter({
          name: currentName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, targetName, {}, undefined, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // force/hashChange are exclusively the same-route hash-change signal —
        // cross-route navigation never sets them.
        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe(newHash);
      },
    );
  });

  describe("Invariant 4: opts.hash propagation (undefined → not set, defined → forwarded)", () => {
    test.prop([arbRouteName, arbRouteName], { numRuns: NUM_RUNS.standard })(
      "hash === undefined → opts.hash is undefined (no key added)",
      (currentName, targetName) => {
        const { router, calls } = makeRouter({
          name: currentName,
          params: {},
          hash: "",
        });

        void navigateWithHash(router, targetName, {}, undefined, undefined);

        expect(calls).toHaveLength(1);
        expect(calls[0].opts.hash).toBeUndefined();
      },
    );

    test.prop([arbRouteName, arbRouteName, arbHash], {
      numRuns: NUM_RUNS.standard,
    })(
      "hash defined → opts.hash forwarded verbatim",
      (currentName, targetName, hash) => {
        const { router, calls } = makeRouter({
          name: currentName,
          params: {},
          hash: "",
        });

        void navigateWithHash(router, targetName, {}, undefined, hash);

        expect(calls).toHaveLength(1);
        expect(calls[0].opts.hash).toBe(hash);
      },
    );
  });

  describe("Invariant 6: force + hashChange tandem (XNOR) — both set OR both absent (review §6 HIGH)", () => {
    // Stronger framing of Inv 2/3: across ALL parameter shapes the two
    // flags are linked — a regression that sets one but not the other
    // would slip past Inv 2 (which checks both as separate assertions
    // under a same-route precondition). Here we sample the full surface
    // and assert the XNOR explicitly: a future refactor that splits the
    // flags into two code paths breaks this.
    test.prop(
      [
        arbRouteName, // currentName
        arbRouteName, // targetName
        arbHash, // currentHash
        arbHash, // newHash
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "across all route/hash combinations: opts.force ↔ opts.hashChange",
      (currentName, targetName, currentHash, newHash) => {
        const { router, calls } = makeRouter({
          name: currentName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, targetName, {}, undefined, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;
        const hasForce = opts.force === true;
        const hasHashChange = opts.hashChange === true;

        // XNOR: both set OR both absent. Neither flag is allowed without
        // the other under any input combination.
        expect(hasForce).toBe(hasHashChange);
      },
    );
  });

  describe("Invariant 7: shallow params equality determinism — distinct refs with same shape detect same-route (review §6 MED)", () => {
    // The same-route check uses `shallowEqual(current.params, routeParams)`,
    // not reference equality. Two structurally-identical params objects with
    // different identities must be treated as the same route for the
    // hash-bypass logic. A regression to `current.params === routeParams`
    // would silently skip the auto-force path for any consumer that
    // allocates a fresh params object per render (the common React pattern).
    test.prop([arbRouteName, arbParams, arbHash, arbHash], {
      numRuns: NUM_RUNS.thorough,
    })(
      "same-route same-params different-hash sets force/hashChange across distinct param refs",
      (routeName, params, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);
        // arbHash never yields undefined, so newHash always overrides.

        const currentParams = { ...params };
        const navigationParams = { ...params };

        // Distinct identities, structurally equal — both pass shallowEqual.
        expect(currentParams).not.toBe(navigationParams);

        const { router, calls } = makeRouter({
          name: routeName,
          params: currentParams,
          hash: currentHash,
        });

        void navigateWithHash(
          router,
          routeName,
          navigationParams,
          undefined,
          newHash,
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].opts.force).toBe(true);
        expect(calls[0].opts.hashChange).toBe(true);
      },
    );

    test.prop([arbRouteName, arbParams, arbHash], {
      numRuns: NUM_RUNS.standard,
    })(
      "same-route different-param-values bypass same-route detection (force NOT set)",
      (routeName, params, hash) => {
        // Pick a primitive value not present in params so the difference is
        // observable through shallowEqual.
        const extraKey = "____divergent_key____";
        const currentParams = { ...params, [extraKey]: "a" };
        const navigationParams = { ...params, [extraKey]: "b" };

        const { router, calls } = makeRouter({
          name: routeName,
          params: currentParams,
          hash,
        });

        void navigateWithHash(
          router,
          routeName,
          navigationParams,
          undefined,
          hash,
        );

        expect(calls).toHaveLength(1);
        // params diverge → same-route check fails → no auto-force even
        // though the hash matches.
        expect(calls[0].opts.force).toBeUndefined();
        expect(calls[0].opts.hashChange).toBeUndefined();
      },
    );
  });

  describe("Invariant 5: no current state → straight navigate (no force logic)", () => {
    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.standard })(
      "router.getState() === undefined → opts pass through",
      (routeName, hash) => {
        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(router, routeName, {}, undefined, hash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe(hash);
      },
    );
  });
});
