// packages/solid/tests/property/navigateWithHash.properties.ts

/**
 * Property-based tests for `navigateWithHash` (#532) as imported by the Solid
 * adapter via the dom-utils symlink. Mirrors the React property set so any
 * cross-adapter regression in the shared helper is caught on the Solid side.
 *
 * Invariants:
 *
 * - **Same route + same hash → pass-through:** opts.force / opts.hashChange
 *   must NOT be set by the helper. Adding them would force an extra
 *   transition where core's SAME_STATES would correctly reject.
 * - **Same route + different hash → auto-bypass:** opts.force=true and
 *   opts.hashChange=true must be set so subscribers can disambiguate via
 *   `state.context.url.hashChanged`.
 * - **Different route → no hash bypass:** the auto-force logic must NOT
 *   fire on cross-route navigations.
 * - **opts.hash propagation:** when `hash !== undefined`, it must appear in
 *   the opts object handed to router.navigate.
 * - **No current state → straight navigate:** when `getState()` is undefined,
 *   the helper neither force-flags nor hashChange-flags the call.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbHash, arbRouteName, NUM_RUNS } from "./helpers";
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

describe("navigateWithHash — Property Tests (Solid)", () => {
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
    test.prop([arbRouteName, arbHash, arbHash], {
      numRuns: NUM_RUNS.thorough,
    })(
      "different current/new hash → auto-bypass SAME_STATES",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);

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

  describe("Invariant 6: same route + diff hash → helper FORCES force/hashChange, overrides extraOptions", () => {
    // `navigateWithHash` does `const opts = { ...extraOptions }` then assigns
    // `opts.force = true` / `opts.hashChange = true` when the same-route +
    // diff-hash branch fires. So a caller passing `{ force: false }` gets
    // overridden — the auto-bypass takes precedence over the explicit value.
    //
    // This is the documented contract for the `<Link hash>` UX (the helper
    // SHOULD override to make hash-only navigation work). Property-locks
    // the override direction so a future refactor doesn't reverse it.
    test.prop([arbRouteName, arbHash, arbHash], {
      numRuns: NUM_RUNS.thorough,
    })(
      "extraOptions = { force: false, hashChange: false } → still upgraded to true on diff-hash",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);

        const { router, calls } = makeRouter({
          name: routeName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, routeName, {}, undefined, newHash, {
          force: false,
          hashChange: false,
        });

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // The helper's same-route diff-hash branch ALWAYS sets these to true,
        // overriding any caller-provided values.
        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBe(true);
      },
    );

    test.prop([arbRouteName, arbRouteName, arbHash, arbHash], {
      numRuns: NUM_RUNS.standard,
    })(
      "extraOptions = { force: true } on cross-route navigation passes through (no override path fires)",
      (currentName, targetName, currentHash, newHash) => {
        fc.pre(currentName !== targetName);

        const { router, calls } = makeRouter({
          name: currentName,
          params: {},
          hash: currentHash,
        });

        void navigateWithHash(router, targetName, {}, undefined, newHash, {
          force: true,
        });

        expect(calls).toHaveLength(1);

        // Cross-route — same-route hash branch does NOT fire, so `force` is
        // whatever the caller passed (true here, unmodified).
        expect(calls[0].opts.force).toBe(true);
        // `hashChange` is NOT set on cross-route (helper only writes it inside
        // the same-route branch).
        expect(calls[0].opts.hashChange).toBeUndefined();
      },
    );
  });

  describe("Invariant 7: `hash` parameter overrides extraOptions.hash (audit-2026-05-17 §6 Stage-1)", () => {
    // The helper builds `opts = { ...extraOptions }` then conditionally
    // assigns `opts.hash = hash` when the `hash` arg is defined. The arg
    // therefore wins over any pre-existing `hash` in extraOptions. Locking
    // this prevents a refactor that swaps to `if (opts.hash === undefined)
    // opts.hash = hash` (the inverse) from sliding past silently — the
    // inverse would let `extraOptions.hash` silently shadow the explicit
    // `<Link hash="...">` prop.
    test.prop([arbRouteName, arbHash, arbHash], {
      numRuns: NUM_RUNS.thorough,
    })(
      "navigateWithHash(..., hash, { hash: other }) → opts.hash === hash (arg wins)",
      (routeName, argHash, optsHash) => {
        fc.pre(argHash !== optsHash);

        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(router, routeName, {}, undefined, argHash, {
          hash: optsHash,
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].opts.hash).toBe(argHash);
      },
    );

    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.standard })(
      "hash === undefined → extraOptions.hash survives (no override path)",
      (routeName, optsHash) => {
        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(router, routeName, {}, undefined, undefined, {
          hash: optsHash,
        });

        expect(calls).toHaveLength(1);
        // No `hash` arg → the spread-from-extraOptions value remains.
        expect(calls[0].opts.hash).toBe(optsHash);
      },
    );
  });

  describe("Invariant 8: extra options spread fidelity (Mini-sprint F.1 — audit-6 Stage-2)", () => {
    // Locked contract: navigateWithHash builds `opts = { ...extraOptions }`
    // and then conditionally writes `hash` / `force` / `hashChange`. ALL
    // other keys from extraOptions MUST pass through to router.navigate
    // unchanged. A regression that filtered keys (e.g. via a per-key
    // allowlist) or accidentally renamed something would break consumer
    // plugins that piggyback custom navigation options (e.g.
    // `analytics`, `replace`, `preserveQuery`).
    test.prop(
      [
        arbRouteName,
        // Arbitrary set of "foreign" extra options — non-empty so we
        // have something to check fidelity of. Avoid collision with
        // reserved keys (`hash`, `force`, `hashChange`) which DO get
        // overwritten by the helper's same-route branch.
        fc.dictionary(
          fc
            .stringMatching(/^[a-z]{1,8}$/)
            .filter(
              (key) =>
                key !== "hash" && key !== "force" && key !== "hashChange",
            ),
          fc.oneof(
            fc.string({ maxLength: 8 }),
            fc.integer(),
            fc.boolean(),
            fc.constantFrom(null),
          ),
          { minKeys: 1, maxKeys: 4 },
        ),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "all non-reserved extraOptions keys pass through to router.navigate verbatim",
      (routeName, extra) => {
        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(
          router,
          routeName,
          {},
          undefined,
          undefined,
          extra,
        );

        expect(calls).toHaveLength(1);

        for (const key of Object.keys(extra)) {
          expect((calls[0].opts as Record<string, unknown>)[key]).toStrictEqual(
            extra[key],
          );
        }
      },
    );

    test("extra option with reserved-key NAME survives if not overwritten by same-route diff-hash branch", () => {
      // Cross-route navigation does NOT trigger the auto-bypass, so
      // even `force` passed via extraOptions passes through verbatim
      // (no override path fires). Locked.
      const { router, calls } = makeRouter({
        name: "home",
        params: {},
        hash: "",
      });

      void navigateWithHash(router, "other", {}, undefined, undefined, {
        force: true,
        myCustomKey: 42,
      } as NavigationOptions & { myCustomKey?: number });

      expect(calls).toHaveLength(1);
      expect(calls[0].opts.force).toBe(true);
      // `myCustomKey` survives spread.
      expect((calls[0].opts as Record<string, unknown>).myCustomKey).toBe(42);
    });
  });
});
