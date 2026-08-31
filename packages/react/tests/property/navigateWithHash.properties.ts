// packages/react/tests/property/navigateWithHash.properties.ts

/**
 * Property-based tests for `navigateWithHash` (#532).
 *
 * The helper wraps `router.navigate(name, params, search, opts)` — the query
 * channel took slot 3 in RFC-4 M2 (#1548) — with same-route different-hash
 * detection.
 *
 * The `describe("Invariant N: …")` blocks below are the list; the notes here
 * cover the ones whose REASON is not obvious from the assertion, and do not
 * claim to be all of them.
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
 * - **Ask and navigate agree (#1925):** whenever the helper announces
 *   `hashChange: true` it has told subscribers "same location, different
 *   fragment", so the query handed to `router.navigate` must be the one the
 *   predicate was asked about.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbHash, arbParams, arbRouteName, NUM_RUNS } from "./helpers";
import { navigateWithHash, shallowEqual } from "../../src/dom-utils";

import type {
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/core";

interface NavigateCall {
  name: string;
  params: Params;
  // Slot 3 was dropped on the floor here until #1925 — which is exactly why the
  // domain of these properties could not see that the helper asks the predicate
  // about one query and navigates with another.
  search: unknown;
  opts: NavigationOptions & { hash?: string; hashChange?: boolean };
}

function makeRouter(
  current:
    | { name: string; params: Params; hash: string; search?: unknown }
    | undefined,
): { router: Router; calls: NavigateCall[]; asked: unknown[] } {
  const asked: unknown[] = [];
  const calls: NavigateCall[] = [];

  const router = {
    getState: () =>
      current === undefined
        ? undefined
        : ({
            name: current.name,
            params: current.params,
            search: current.search ?? {},
            context: { url: { hash: current.hash } },
          } as unknown as State),
    // Part of the contract since #1555: the helper asks the router "is this the
    // same location?" instead of comparing the bags itself. This arbitrary-built
    // state shares the caller's provenance, so `shallowEqual` answers exactly what
    // the real predicate answers — the properties below stay about the hash delta
    // and the opts it assembles, which is what they were always about.
    isActiveRoute: (name: string, params: Params, search?: unknown) => {
      asked.push(search);

      return current?.name === name && shallowEqual(current.params, params);
    },
    navigate: (
      name: string,
      params: Params,
      search: unknown,
      opts?: NavigationOptions & { hash?: string; hashChange?: boolean },
    ) => {
      calls.push({ name, params, search, opts: opts ?? {} });

      return Promise.resolve({ name, params } as unknown as State);
    },
  } as unknown as Router;

  return { router, calls, asked };
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

  // ── #1925 ─────────────────────────────────────────────────────────────────
  //
  // The class-guard: whenever the helper announces `hashChange: true`, it has
  // told subscribers "same location, different fragment" — so the query it
  // navigates with must be the one it ASKED the predicate about. Written as an
  // equality between the two, so it discriminates without hard-coding either
  // value and holds for every shape of `routeSearch`.
  //
  // This is a DOMAIN extension, not a second property: the mock above dropped
  // slot 3 entirely, so no existing invariant here could see the divergence.
  describe("Invariant 8: the bypass navigates with the query it asked about", () => {
    const arbSearch = fc.dictionary(
      fc.stringMatching(/^[a-z]{1,6}$/),
      fc.stringMatching(/^[a-z0-9]{1,6}$/),
      { minKeys: 1, maxKeys: 3 },
    );

    test.prop(
      [
        arbRouteName,
        arbHash,
        arbHash,
        arbSearch,
        fc.option(arbSearch, { nil: undefined }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "asked query === navigated query whenever hashChange is announced",
      (routeName, currentHash, newHash, currentSearch, routeSearch) => {
        fc.pre(currentHash !== newHash);

        const { router, calls, asked } = makeRouter({
          name: routeName,
          params: {},
          hash: currentHash,
          search: currentSearch,
        });

        void navigateWithHash(router, routeName, {}, routeSearch, newHash);

        expect(calls).toHaveLength(1);
        // Anti-vacuity, two separate claims. The COUNT — a second consult would
        // mean the helper asks twice and the two answers could differ; today
        // nothing violates it, so this assertion is a natural short-circuit of
        // the one below rather than an independent killer, and it is kept for
        // the claim it makes, not for a mutant it catches.
        expect(asked).toHaveLength(1);
        // The DOMAIN — a non-empty query, or the equality below is satisfied by
        // two `undefined`s and pins nothing. This one discriminates: collapsing
        // the generated query to `{}` reds it.
        expect(Object.keys(asked[0] as object).length).toBeGreaterThan(0);

        expect(calls[0].opts.hashChange).toBe(true);
        expect(calls[0].search).toStrictEqual(asked[0]);
      },
    );

    // CONTROL — no bypass, no claim of sameness, no substitution. The link
    // navigates with exactly what it named.
    test.prop([arbRouteName, arbHash, arbSearch], {
      numRuns: NUM_RUNS.thorough,
    })(
      "without a hash change the caller's query passes through untouched",
      (routeName, hash, currentSearch) => {
        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash,
          search: currentSearch,
        });

        void navigateWithHash(router, routeName, {}, undefined, hash);

        expect(calls).toHaveLength(1);
        expect(calls[0].opts.hashChange).toBeUndefined();
        expect(calls[0].search).toBeUndefined();
      },
    );
  });
});
