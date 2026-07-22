// packages/svelte/tests/property/navigateWithHash.properties.ts

/**
 * Property-based tests for `navigateWithHash` (#532).
 *
 * The helper wraps `router.navigate(name, params, opts)` with same-route
 * different-hash detection. The invariants:
 *
 * - **Same route + same hash → pass-through:** `opts.force` / `opts.hashChange`
 *   must NOT be set by the helper. Adding them would force an extra
 *   transition where core's SAME_STATES would correctly reject.
 * - **Same route + different hash → auto-bypass:** `opts.force=true` and
 *   `opts.hashChange=true` must be set so subscribers can disambiguate via
 *   `state.context.url.hashChanged`. Without this, hash-only navigation
 *   would silently no-op against core's SAME_STATES check.
 * - **Different route → no hash bypass:** the auto-force logic must NOT
 *   fire on cross-route navigations, even if the hash matches — those go
 *   through the normal navigation path.
 * - **opts.hash propagation:** when `hash !== undefined`, it must appear in
 *   the opts object handed to `router.navigate`; `hash === undefined` must
 *   leave the key absent so plugins can distinguish "no hash intent" from
 *   "explicit empty hash".
 * - **No current state:** `router.getState() === undefined` short-circuits
 *   the same-route logic entirely — straight pass-through.
 *
 * Closes review §2.2 HIGH/LOW gaps for `navigateWithHash` (#532 critical
 * business logic was not covered by property tests).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS, arbHash, arbRouteName, arbRouteNameWide } from "./helpers";
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
  describe("Invariant 1: Same route + same hash → no force / no hashChange", () => {
    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.thorough })(
      "current state matches → opts pass through unchanged",
      (routeName, hash) => {
        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash,
        });

        void navigateWithHash(router, routeName, {}, hash);

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

  describe("Invariant 2: Same route + different hash → force + hashChange", () => {
    test.prop([arbRouteName, arbHash, arbHash], { numRuns: NUM_RUNS.thorough })(
      "different current/new hash → auto-bypass SAME_STATES",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);
        // arbHash never yields undefined; the helper's "preserve current"
        // branch (hash === undefined) is exercised separately in Invariant 6.

        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, routeName, {}, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // Conjunction matters: a regression that sets only `force` (without
        // `hashChange`) would still pass two separate `toBe(true)` checks if
        // they were split — `toMatchObject` locks both flags as a unit.
        expect(opts).toMatchObject({ force: true, hashChange: true });
        expect(opts.hash).toBe(newHash);
      },
    );
  });

  describe("Invariant 3: Different route → no auto-bypass even if hash differs", () => {
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

        void navigateWithHash(router, targetName, {}, newHash);

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

        void navigateWithHash(router, targetName, {}, undefined);

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

        void navigateWithHash(router, targetName, {}, hash);

        expect(calls).toHaveLength(1);
        expect(calls[0].opts.hash).toBe(hash);
      },
    );
  });

  describe("Invariant 5: No current state → straight navigate (no force logic)", () => {
    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.standard })(
      "router.getState() === undefined → opts pass through",
      (routeName, hash) => {
        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(router, routeName, {}, hash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe(hash);
      },
    );
  });

  describe("Invariant 6: Same route + hash=undefined → hash preserved, no force", () => {
    // When `hash` is `undefined` the helper computes `newHash = hash ?? currentHash`,
    // making newHash === currentHash. The condition `currentHash !== newHash` is
    // false → no force / no hashChange. This is the "preserve current hash" path:
    // passing undefined signals "don't change the fragment", so there is nothing
    // to bypass in core's SAME_STATES check.
    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.standard })(
      "same route + undefined hash → force and hashChange absent",
      (routeName, currentHash) => {
        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, routeName, {}, undefined);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // Preservation path: no bypass flags, no opts.hash (undefined not forwarded).
        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBeUndefined();
      },
    );
  });

  // Closes review §2.4 "arbRouteName narrow domain" — the `constantFrom` set
  // only covers 1–2-deep names. The same-route hash-change branch is depth-
  // agnostic, but the lookup-by-name + `current?.name === routeName` strict-
  // equality check must hold for deeply nested names too. Running Invariant 2
  // over wide-depth names exercises the matcher under broader inputs.
  describe("Invariant 8: Wide-depth route names exercise the matcher", () => {
    test.prop([arbRouteNameWide, arbHash, arbHash], {
      numRuns: NUM_RUNS.standard,
    })(
      "deeply nested route + different hash → force + hashChange",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);

        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, routeName, {}, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBe(true);
        expect(opts.hash).toBe(newHash);
      },
    );
  });

  describe("Invariant 7: extraOptions pass-through is shallow-merged with hash", () => {
    // When the consumer passes `{ replace: true }` alongside `hash="x"`, the
    // helper must merge both into the final opts handed to `router.navigate`.
    // Without this, programmatic same-route hash navigation would lose flags
    // the consumer set explicitly (e.g. `replace: true` for history rewriting).
    test.prop([arbRouteName, arbHash, fc.boolean()], {
      numRuns: NUM_RUNS.standard,
    })(
      "extraOptions fields survive the hash merge",
      (routeName, hash, replace) => {
        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(router, routeName, {}, hash, { replace });

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts as {
          replace?: boolean;
          hash?: string;
        };

        expect(opts.replace).toBe(replace);
        expect(opts.hash).toBe(hash);
      },
    );
  });

  // Closes review §5.3 row 8: same route name but different params must NOT
  // trigger the auto-bypass. The branch guard is
  // `shallowEqual(current.params, routeParams)` — if it's false, neither
  // force nor hashChange are added, even if route names match.
  describe("Invariant 9: Same route + different params → no auto-bypass", () => {
    test.prop(
      [
        arbRouteName,
        arbHash,
        arbHash,
        fc.string({ minLength: 1, maxLength: 8 }),
      ],
      {
        numRuns: NUM_RUNS.thorough,
      },
    )(
      "params shallow-not-equal → opts.force / opts.hashChange unset",
      (routeName, currentHash, newHash, paramValue) => {
        fc.pre(currentHash !== newHash);

        const { router, calls } = makeRouter({
          name: routeName,
          params: { id: "current" },
          hash: currentHash,
        });

        // Same route name, different params.id — shallowEqual returns false,
        // branch skipped.
        void navigateWithHash(router, routeName, { id: paramValue }, newHash);

        fc.pre(paramValue !== "current"); // ensure non-equal

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        // hash is still propagated — only the auto-bypass is gated.
        expect(opts.hash).toBe(newHash);
      },
    );
  });

  // Closes review §5.3 row 7: defensive `(current.context as { url?: ... })?.url?.hash ?? ""`
  // path. If a state has no `context.url` (router started without a URL
  // plugin — memory-only setup), currentHash falls back to "" and the
  // same-route different-hash logic still operates correctly.
  describe("Invariant 10: current.context.url absent → defensive '' fallback", () => {
    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.standard })(
      "no context.url + non-empty hash on same route → force + hashChange (currentHash defaults to '')",
      (routeName, newHash) => {
        fc.pre(newHash !== "");
        // Manual router build to omit context.url entirely.
        const calls: NavigateCall[] = [];
        const router = {
          getState: () =>
            ({
              name: routeName,
              params: {},
              context: {}, // no url field at all
            }) as unknown as State,
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

        void navigateWithHash(router, routeName, {}, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // currentHash defaulted to "" (defensive); newHash !== "" so
        // currentHash !== newHash → auto-bypass fires.
        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBe(true);
        expect(opts.hash).toBe(newHash);
      },
    );

    test("no context.url + hash=undefined on same route → no force (preserve)", () => {
      const calls: NavigateCall[] = [];
      const router = {
        getState: () =>
          ({
            name: "home",
            params: {},
            context: {},
          }) as unknown as State,
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

      void navigateWithHash(router, "home", {}, undefined);

      expect(calls).toHaveLength(1);

      const opts = calls[0].opts;

      // hash=undefined + currentHash="" (defensive) → newHash="", equal,
      // no force. `opts.hash` is not added because `hash === undefined`.
      expect(opts.force).toBeUndefined();
      expect(opts.hashChange).toBeUndefined();
      expect(opts.hash).toBeUndefined();
    });
  });

  // Closes review §5.3 row 6: when consumer passes `force: true` in
  // extraOptions, the helper's `{ ...extraOptions }` copies it. The
  // auto-bypass branch then unconditionally re-assigns `force = true` on
  // a hash mismatch (idempotent). On no mismatch the consumer's `force`
  // survives untouched. Same for `hashChange`. Locks the last-write-wins
  // contract: auto-bypass cannot DOWNGRADE consumer's flags to false.
  describe("Invariant 11: extraOptions.force already set — last-write-wins, no downgrade", () => {
    test.prop([arbRouteName, arbHash, arbHash], {
      numRuns: NUM_RUNS.standard,
    })(
      "consumer force=true + same route + different hash → force stays true (idempotent)",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);

        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, routeName, {}, newHash, {
          force: true,
        });

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBe(true);
      },
    );

    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.standard })(
      "consumer force=true + same route + same hash → force stays true (no auto-bypass to fire)",
      (routeName, hash) => {
        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash,
        });

        void navigateWithHash(router, routeName, {}, hash, {
          force: true,
        });

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // No mismatch → branch skipped → consumer's force survives untouched.
        expect(opts.force).toBe(true);
        // hashChange was NOT set by consumer or by branch.
        expect(opts.hashChange).toBeUndefined();
      },
    );

    test.prop([arbRouteName, arbRouteName, arbHash, arbHash], {
      numRuns: NUM_RUNS.standard,
    })(
      "consumer force=true + different route → force stays true (auto-bypass branch skipped)",
      (currentName, targetName, currentHash, newHash) => {
        fc.pre(currentName !== targetName);

        const { router, calls } = makeRouter({
          name: currentName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, targetName, {}, newHash, {
          force: true,
        });

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBeUndefined();
      },
    );
  });

  // Closes review §5.3 row 5: when current state has empty hash AND consumer
  // passes hash=undefined, the helper preserves the empty hash:
  // newHash = undefined ?? "" = "" === currentHash → no force, opts.hash
  // not added. This is the "already at no-fragment, no nav-intent" path.
  describe("Invariant 12: hash=undefined + currentHash='' on same route → no force, no opts.hash", () => {
    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "same route + currentHash='' + hash=undefined → preserved without flags",
      (routeName) => {
        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: "",
        });

        void navigateWithHash(router, routeName, {}, undefined);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        // `hash === undefined` → key not added to opts.
        expect(opts.hash).toBeUndefined();
      },
    );

    test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
      "same route + currentHash='' + hash='' → equal, no force",
      (routeName) => {
        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: "",
        });

        void navigateWithHash(router, routeName, {}, "");

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // hash="" → explicitly forwarded; currentHash="" → equal → no force.
        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe("");
      },
    );
  });
});
