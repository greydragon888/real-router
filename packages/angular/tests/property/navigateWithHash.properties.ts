// packages/angular/tests/property/navigateWithHash.properties.ts

/**
 * Property-based tests for `navigateWithHash` (#532) from
 * `packages/angular/src/dom-utils/link-utils.ts` (git-tracked copy of the
 * shared source).
 *
 * Closes review-2026-05-10 §6.2 invariant 8 (same-route + same-hash
 * idempotency). The full surface mirrors svelte's coverage so the two
 * adapters cannot drift unnoticed.
 *
 * Invariants:
 * 1. Same route + same hash → no force / no hashChange (Invariant 8 from §6.2)
 * 2. Same route + different hash → force + hashChange
 * 3. Different route → no auto-bypass even if hash differs
 * 4. opts.hash propagation (undefined → not set, defined → forwarded)
 * 5. No current state → straight navigate (no force logic)
 * 6. Same route + hash=undefined → hash preserved, no force
 * 7. extraOptions pass-through is shallow-merged with hash
 * 8. Wide-depth route names exercise the matcher
 * 9. Same route + different params → no auto-bypass
 * 10. current.context.url absent → defensive '' fallback
 * 11. extraOptions.force already set — last-write-wins, no downgrade
 * 12. hash=undefined + currentHash='' on same route → no force, no opts.hash
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
  // Invariant 8 from review §6.2 — regression guard for the
  // `if (currentHash !== newHash)` branch (link-utils.ts:138). A bug there
  // would turn no-op same-link clicks into forced navigation, retriggering
  // every subscriber and re-running every resolver.
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

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe(hash);
      },
    );
  });

  describe("Invariant 2: Same route + different hash → force + hashChange", () => {
    test.prop([arbRouteName, arbHash, arbHash], { numRuns: NUM_RUNS.thorough })(
      "different current/new hash → auto-bypass SAME_STATES",
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

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBeUndefined();
      },
    );
  });

  describe("Invariant 7: extraOptions pass-through is shallow-merged with hash", () => {
    test.prop([arbRouteName, arbHash, fc.boolean()], {
      numRuns: NUM_RUNS.standard,
    })(
      "extraOptions fields survive the hash merge",
      (routeName, hash, replace) => {
        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(router, routeName, {}, hash, { replace });

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts as { replace?: boolean; hash?: string };

        expect(opts.replace).toBe(replace);
        expect(opts.hash).toBe(hash);
      },
    );
  });

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

  describe("Invariant 9: Same route + different params → no auto-bypass", () => {
    test.prop(
      [
        arbRouteName,
        arbHash,
        arbHash,
        fc.string({ minLength: 1, maxLength: 8 }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "params shallow-not-equal → opts.force / opts.hashChange unset",
      (routeName, currentHash, newHash, paramValue) => {
        fc.pre(currentHash !== newHash);
        fc.pre(paramValue !== "current");

        const { router, calls } = makeRouter({
          name: routeName,
          params: { id: "current" },
          hash: currentHash,
        });

        void navigateWithHash(router, routeName, { id: paramValue }, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe(newHash);
      },
    );

    // Audit 2026-05-16 §2.2: the single-`{id: string}` PBT only covers a
    // 1-key shallow-diff. Real routes carry multi-key params (search
    // params, filters, pagination) and numeric values that shallowEqual
    // distinguishes by Object.is — NaN !== NaN (Object.is(NaN,NaN)=true),
    // +0 vs -0 (Object.is(+0,-0)=false). Widen the surface so the
    // shallowEqual integration is exercised across the realistic
    // parameter shapes.
    const arbParamValue: fc.Arbitrary<string | number | boolean> = fc.oneof(
      fc.string({ maxLength: 6 }),
      fc.integer({ min: -100, max: 100 }),
      fc.boolean(),
      fc.constantFrom(0, -0, Number.NaN, Infinity, -Infinity),
    );
    const arbMultiKeyParams: fc.Arbitrary<Record<string, unknown>> =
      fc.dictionary(fc.stringMatching(/^[a-z]{1,4}$/), arbParamValue, {
        minKeys: 1,
        maxKeys: 5,
      });

    test.prop([arbRouteName, arbHash, arbHash, arbMultiKeyParams], {
      numRuns: NUM_RUNS.thorough,
    })(
      "multi-key params + numeric/NaN/±0 — shallow-not-equal → no auto-bypass",
      (routeName, currentHash, newHash, requestedParams) => {
        fc.pre(currentHash !== newHash);

        // Anchor the router's "current" params to a fixed sentinel so the
        // generated params produce a real shallow-diff (no key collision
        // by chance).
        const currentParams = { __anchor: "fixed" };

        const { router, calls } = makeRouter({
          name: routeName,
          params: currentParams as unknown as Params,
          hash: currentHash,
        });

        // Compute the expected shallowEqual verdict the implementation will
        // see — if the generator collapses to {} the anchor key wins and
        // shallowEqual returns false anyway (key-count discriminator).
        void navigateWithHash(
          router,
          routeName,
          requestedParams as unknown as Params,
          newHash,
        );

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        // Cross-params + different-hash should never trigger the same-route
        // auto-bypass (the same-route path is gated by shallowEqual).
        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe(newHash);
      },
    );

    test.prop([arbRouteName, arbHash, arbHash], { numRuns: NUM_RUNS.thorough })(
      "NaN-valued params are stable under shallowEqual (Object.is(NaN,NaN)=true) — different-hash forces, different-param NaN-vs-NaN does NOT differentiate",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);

        const { router, calls } = makeRouter({
          name: routeName,
          params: { score: Number.NaN },
          hash: currentHash,
        });

        // Same NaN on both sides: shallowEqual(params, params) is true →
        // the SAME-route + SAME-params + different-hash branch fires, so
        // force + hashChange MUST be set (Inv 2).
        void navigateWithHash(
          router,
          routeName,
          { score: Number.NaN },
          newHash,
        );

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBe(true);
        expect(opts.hash).toBe(newHash);
      },
    );

    test.prop([arbRouteName, arbHash, arbHash], { numRuns: NUM_RUNS.thorough })(
      "±0 params are distinguished by shallowEqual (Object.is(+0,-0)=false) — params differ → NO auto-bypass even with hash change",
      (routeName, currentHash, newHash) => {
        fc.pre(currentHash !== newHash);

        const { router, calls } = makeRouter({
          name: routeName,
          params: { delta: 0 },
          hash: currentHash,
        });

        // +0 vs -0: shallowEqual returns false (Object.is distinguishes them).
        // params differ → cross-params branch → no force / no hashChange.
        void navigateWithHash(router, routeName, { delta: -0 }, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe(newHash);
      },
    );
  });

  describe("Invariant 10: current.context.url absent → defensive '' fallback", () => {
    test.prop([arbRouteName, arbHash], { numRuns: NUM_RUNS.standard })(
      "no context.url + non-empty hash on same route → force + hashChange (currentHash defaults to '')",
      (routeName, newHash) => {
        fc.pre(newHash !== "");

        const calls: NavigateCall[] = [];
        const router = {
          getState: () =>
            ({
              name: routeName,
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

        void navigateWithHash(router, routeName, {}, newHash);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts;

        expect(opts.force).toBe(true);
        expect(opts.hashChange).toBe(true);
        expect(opts.hash).toBe(newHash);
      },
    );

    test("no context.url + hash=undefined on same route → no force (preserve)", () => {
      const calls: NavigateCall[] = [];
      const router = {
        getState: () =>
          ({ name: "home", params: {}, context: {} }) as unknown as State,
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

      expect(opts.force).toBeUndefined();
      expect(opts.hashChange).toBeUndefined();
      expect(opts.hash).toBeUndefined();
    });
  });

  describe("Invariant 11: extraOptions.force already set — last-write-wins, no downgrade", () => {
    test.prop([arbRouteName, arbHash, arbHash], { numRuns: NUM_RUNS.standard })(
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

        expect(opts.force).toBe(true);
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

        expect(opts.force).toBeUndefined();
        expect(opts.hashChange).toBeUndefined();
        expect(opts.hash).toBe("");
      },
    );
  });

  // Closes review-2026-05-10 §5.1 ⛔ ("rapid concurrent same-route hash
  // navs" MED — #532 tab-style main scenario). Simulates 10+ rapid clicks
  // on tab-style `<a realLink [hash]="…">` links where each click targets
  // the same route+params with a different hash. Each invocation must:
  //   - Reach `router.navigate` (no internal debounce / drop)
  //   - Set `force: true` + `hashChange: true` when hash actually differs
  //     from the THEN-CURRENT context.url.hash
  //   - Forward `opts.hash` verbatim
  // Mutates the fake-router's current state between calls to reflect that
  // a previous navigation committed the new hash before the next click.
  describe("Invariant 13: rapid concurrent same-route hash navigations (#532 tab-storm)", () => {
    test("20 rapid clicks across N tabs — every call reaches router.navigate with correct force/hashChange", () => {
      const tabHashes = ["profile", "account", "billing", "security", "team"];
      const currentState = {
        name: "settings",
        params: {} as Params,
        hash: "profile",
      };
      const calls: NavigateCall[] = [];

      const router = {
        getState: () =>
          ({
            name: currentState.name,
            params: currentState.params,
            context: { url: { hash: currentState.hash } },
          }) as unknown as State,
        navigate: (
          name: string,
          params: Params,
          _search: unknown,
          opts?: NavigationOptions & { hash?: string; hashChange?: boolean },
        ) => {
          calls.push({ name, params, opts: opts ?? {} });
          // Simulate the router COMMITTING the new hash before the next
          // click fires. This is the realistic tab-storm sequence —
          // browser commits each navigation synchronously between user
          // clicks.
          if (opts?.hash !== undefined) {
            currentState.hash = opts.hash;
          }

          return Promise.resolve({ name, params } as unknown as State);
        },
      } as unknown as Router;

      // 20 rapid clicks, cycling through 5 tabs (4 full cycles).
      for (let i = 0; i < 20; i++) {
        const targetHash = tabHashes[i % tabHashes.length];

        void navigateWithHash(router, "settings", {}, targetHash);
      }

      expect(calls).toHaveLength(20);

      // First click targets "profile" which IS the current hash → no force.
      expect(calls[0].opts.force).toBeUndefined();
      expect(calls[0].opts.hashChange).toBeUndefined();
      expect(calls[0].opts.hash).toBe("profile");

      // Subsequent clicks each targeting a different hash than the
      // just-committed one → force + hashChange must be set.
      for (let i = 1; i < 20; i++) {
        const target = tabHashes[i % tabHashes.length];
        const previousTarget = tabHashes[(i - 1) % tabHashes.length];

        if (target === previousTarget) {
          // Adjacent same-target clicks (not in this rotation since
          // tabHashes has 5 unique values) → would expect no force.
          // Defensive in case the rotation pattern changes.
          expect(calls[i].opts.force).toBeUndefined();
        } else {
          expect(calls[i].opts.force).toBe(true);
          expect(calls[i].opts.hashChange).toBe(true);
        }

        expect(calls[i].opts.hash).toBe(target);
      }
    });

    test("repeat-click on the SAME tab → consecutive no-force navigations", () => {
      const currentState = {
        name: "settings",
        params: {} as Params,
        hash: "profile",
      };
      const calls: NavigateCall[] = [];

      const router = {
        getState: () =>
          ({
            name: currentState.name,
            params: currentState.params,
            context: { url: { hash: currentState.hash } },
          }) as unknown as State,
        navigate: (
          name: string,
          params: Params,
          _search: unknown,
          opts?: NavigationOptions & { hash?: string; hashChange?: boolean },
        ) => {
          calls.push({ name, params, opts: opts ?? {} });
          if (opts?.hash !== undefined) {
            currentState.hash = opts.hash;
          }

          return Promise.resolve({ name, params } as unknown as State);
        },
      } as unknown as Router;

      // 10 rapid clicks all on the SAME "profile" tab — every call reaches
      // router.navigate (no internal dedup in `navigateWithHash`), but
      // none should set force/hashChange because hash already matches.
      for (let i = 0; i < 10; i++) {
        void navigateWithHash(router, "settings", {}, "profile");
      }

      expect(calls).toHaveLength(10);

      for (const call of calls) {
        expect(call.opts.force).toBeUndefined();
        expect(call.opts.hashChange).toBeUndefined();
        expect(call.opts.hash).toBe("profile");
      }
    });

    test("synchronous burst before router commits — each call sees stale state, force fires for FIRST nav only after route changes", () => {
      // Realistic scenario: user clicks N times in <1 frame, the router is
      // queuing navigations but state hasn't been committed yet. Each
      // `navigateWithHash` call sees the OLD `currentState.hash`.
      const currentState = {
        name: "settings",
        params: {} as Params,
        hash: "profile",
      };
      const calls: NavigateCall[] = [];

      const router = {
        getState: () =>
          ({
            name: currentState.name,
            params: currentState.params,
            context: { url: { hash: currentState.hash } },
          }) as unknown as State,
        // NOTE: we do NOT commit hash here, simulating queued navigations.
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

      // Burst: 5 clicks for "account" (different from current "profile"),
      // then 5 for "billing".
      for (let i = 0; i < 5; i++) {
        void navigateWithHash(router, "settings", {}, "account");
      }
      for (let i = 0; i < 5; i++) {
        void navigateWithHash(router, "settings", {}, "billing");
      }

      expect(calls).toHaveLength(10);

      // Every call sees the same stale `currentState.hash === "profile"`,
      // so all 10 have force+hashChange set (target != current for each).
      for (let i = 0; i < 5; i++) {
        expect(calls[i].opts.force).toBe(true);
        expect(calls[i].opts.hashChange).toBe(true);
        expect(calls[i].opts.hash).toBe("account");
      }
      for (let i = 5; i < 10; i++) {
        expect(calls[i].opts.force).toBe(true);
        expect(calls[i].opts.hashChange).toBe(true);
        expect(calls[i].opts.hash).toBe("billing");
      }
    });
  });

  // ===========================================================================
  // Audit 2026-05-16 §6.2 #9 (MED) — extraOptions immutability + full pass-through
  // Locks two contracts at once:
  //  - every user-provided field in `extraOptions` survives into the
  //    router.navigate call (no field is dropped silently),
  //  - the helper does not mutate the input `extraOptions` object.
  // ===========================================================================
  describe("Invariant 13: extraOptions full pass-through + non-mutation (audit §6.2 #9)", () => {
    const arbExtraOptions: fc.Arbitrary<NavigationOptions> = fc
      .dictionary(
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.oneof(
          fc.string({ maxLength: 8 }),
          fc.integer({ min: -100, max: 100 }),
          fc.boolean(),
        ),
        { minKeys: 0, maxKeys: 5 },
      )
      .map((d) => d as unknown as NavigationOptions);

    function snapshotEntries(o: object): [string, unknown][] {
      return Object.keys(o as Record<string, unknown>)
        .toSorted((a, b) => a.localeCompare(b))
        .map(
          (k) => [k, (o as Record<string, unknown>)[k]] as [string, unknown],
        );
    }

    test.prop([arbRouteName, fc.option(arbHash), arbExtraOptions], {
      numRuns: NUM_RUNS.thorough,
    })(
      "every user-provided field reaches router.navigate AND extraOptions is not mutated",
      (routeName, hash, extras) => {
        fc.pre(
          !("hash" in (extras as Record<string, unknown>)) &&
            !("force" in (extras as Record<string, unknown>)) &&
            !("hashChange" in (extras as Record<string, unknown>)),
        );

        // structuredClone refuses null-prototype records (fast-check may
        // shrink to `{__proto__: null}`); compare by own-entries snapshot.
        const before = snapshotEntries(extras);
        const { router, calls } = makeRouter(undefined);

        void navigateWithHash(router, routeName, {}, hash ?? undefined, extras);

        expect(snapshotEntries(extras)).toStrictEqual(before);

        expect(calls).toHaveLength(1);

        const opts = calls[0].opts as Record<string, unknown>;

        for (const key of Object.keys(extras)) {
          expect(opts[key]).toStrictEqual(
            (extras as Record<string, unknown>)[key],
          );
        }
      },
    );

    test.prop([arbRouteName, arbHash, arbExtraOptions], {
      numRuns: NUM_RUNS.thorough,
    })(
      "extraOptions retains its shape even when same-route different-hash triggers force+hashChange overlay",
      (routeName, newHash, extras) => {
        fc.pre(
          !("hash" in (extras as Record<string, unknown>)) &&
            !("force" in (extras as Record<string, unknown>)) &&
            !("hashChange" in (extras as Record<string, unknown>)) &&
            newHash !== "",
        );

        const before = snapshotEntries(extras);
        const { router } = makeRouter({
          name: routeName,
          params: {},
          hash: `${newHash}-old`,
        });

        void navigateWithHash(router, routeName, {}, newHash, extras);

        expect(snapshotEntries(extras)).toStrictEqual(before);
      },
    );
  });

  // ===========================================================================
  // Audit 2026-05-16 §5.2 Bug 2 (LOW) — pin: `navigateWithHash` overwrites
  // `extraOptions.force=false` with `force=true` on same-route different-hash
  // (auto-bypass branch). This is intentional per jsdoc on the helper, but
  // the asymmetry vs Inv 11 (`force=true` survives idempotently) is not
  // covered. The pin below documents that consumer's explicit `force: false`
  // is silently upgraded when the auto-bypass branch fires.
  // ===========================================================================
  describe("Invariant 14: extraOptions.force=false overwritten by auto-bypass overlay (Bug 2 pin)", () => {
    test("same route + different hash + consumer extraOptions.force=false → opts.force=true (silent upgrade)", () => {
      const { router, calls } = makeRouter({
        name: "home",
        params: {},
        hash: "old",
      });

      void navigateWithHash(router, "home", {}, "new", {
        force: false,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].opts.force).toBe(true);
      expect(calls[0].opts.hashChange).toBe(true);
    });

    test("same route + same hash + consumer extraOptions.force=false → opts.force=false survives (no auto-bypass fired)", () => {
      const { router, calls } = makeRouter({
        name: "home",
        params: {},
        hash: "same",
      });

      void navigateWithHash(router, "home", {}, "same", {
        force: false,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].opts.force).toBe(false);
      expect(calls[0].opts.hashChange).toBeUndefined();
    });
  });
});
