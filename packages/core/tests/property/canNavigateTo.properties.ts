import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  arbNavigableRoute,
  arbSegmentName,
  FIXTURE_ROUTE_NAMES,
  ROUTE_PATHS,
  NUM_RUNS,
  navArgsForRoute,
} from "./helpers";

import type { Params, Router } from "@real-router/core";

/** Register a single sync guard (last-add-wins) on a router. */
function applyGuard(
  router: Router,
  guard: { route: string; kind: string; val: boolean },
): void {
  const lifecycle = getLifecycleApi(router);

  if (guard.kind === "activate") {
    lifecycle.addActivateGuard(guard.route, () => () => guard.val);
  } else {
    lifecycle.addDeactivateGuard(guard.route, () => () => guard.val);
  }
}

/** A sync guard config drawn from the fixture (incl. shared ancestors). */
const arbGuard = fc.record({
  route: fc.constantFrom(...FIXTURE_ROUTE_NAMES),
  kind: fc.constantFrom("activate", "deactivate"),
  val: fc.boolean(),
});

/**
 * A params bag that fights back (#1577). Built here rather than drawn as a
 * fast-check value on purpose: the reporter stringifies counterexamples, and a
 * throwing accessor would then blow up inside the reporter instead of inside
 * the predicate. The labels cover the three surfaces a bag can weaponise —
 * a value getter, a `[[Get]]` trap, and an `ownKeys` trap (which is what
 * `Object.entries` reaches first).
 */
function makeHostileBag(kind: string): Params {
  if (kind === "throwing-getter") {
    const bag = {};

    Object.defineProperty(bag, "id", {
      get() {
        throw new Error("hostile getter");
      },
      enumerable: true,
    });

    return bag;
  }

  if (kind === "proxy-throws-get") {
    return new Proxy(
      { id: "1" },
      {
        get() {
          throw new Error("hostile [[Get]]");
        },
      },
    );
  }

  if (kind === "proxy-throws-ownKeys") {
    return new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile ownKeys");
        },
      },
    );
  }

  return {};
}

describe("canNavigateTo Properties", () => {
  test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
    "unknown route returns false",
    async (unknownRoute) => {
      fc.pre(
        !["home", "users", "admin", "search", "oldUsers"].includes(
          unknownRoute,
        ),
      );

      const router = createFixtureRouter();

      await router.start("/");

      expect(router.canNavigateTo(unknownRoute)).toBe(false);

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "no guards → canNavigateTo returns true for existing routes",
    async (route) => {
      const router = createFixtureRouter();

      await router.start("/");

      expect(router.canNavigateTo(route, ...navArgsForRoute(route))).toBe(true);

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "sync guard returning true → canNavigateTo === true",
    async (route) => {
      fc.pre(route !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(route, () => () => true);

      await router.start("/");

      expect(router.canNavigateTo(route, ...navArgsForRoute(route))).toBe(true);

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "sync guard returning false → canNavigateTo === false",
    async (route) => {
      fc.pre(route !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(route, () => () => false);

      await router.start("/");

      expect(router.canNavigateTo(route, ...navArgsForRoute(route))).toBe(
        false,
      );

      router.stop();
    },
  );

  // TOTALITY (#725, widened by #1577) — the predicate ANSWERS, it never throws,
  // for ANY bag. Routes with required path params (e.g. users.view "/users/:id")
  // used to throw a raw buildPath Error on empty params; #1577 closed the other
  // half, where user code running during resolution (a dynamic `forwardTo`, a
  // `forwardState` interceptor, or the bag's own accessor read by channel
  // separation) escaped as an exception.
  //
  // The bag is chosen by LABEL and built inside the body, never drawn as a
  // value: fast-check stringifies counterexamples, and a hostile getter would
  // throw inside the reporter rather than inside the code under test.
  test.prop(
    [
      arbNavigableRoute,
      fc.constantFrom(
        "empty",
        "throwing-getter",
        "proxy-throws-get",
        "proxy-throws-ownKeys",
      ),
    ],
    { numRuns: NUM_RUNS.fast },
  )(
    "answers for any params bag — hostile accessors included, never throws",
    async (route, bagKind) => {
      const router = createFixtureRouter();

      await router.start("/");

      let result: boolean | undefined;

      expect(() => {
        result = router.canNavigateTo(route, makeHostileBag(bagKind));
      }).not.toThrow();
      expect(typeof result).toBe("boolean");

      router.stop();
    },
  );

  // NO_STATE_MUTATION — the predicate never commits: getState() must stay the
  // same reference across the call (it only reads #state.get()).
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "does not mutate state — getState() is reference-identical across the call",
    async (route) => {
      const router = createFixtureRouter();

      await router.start("/");

      const before = router.getState();

      router.canNavigateTo(route, ...navArgsForRoute(route));

      expect(router.getState()).toBe(before);

      router.stop();
    },
  );

  // DETERMINISM — pure (side-effect-free) guards ⇒ repeated calls agree.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "deterministic — repeated calls return the same verdict for pure guards",
    async (route) => {
      const router = createFixtureRouter();

      await router.start("/");

      const [params, search] = navArgsForRoute(route);
      const first = router.canNavigateTo(route, params, search);

      expect(router.canNavigateTo(route, params, search)).toBe(first);
      expect(router.canNavigateTo(route, params, search)).toBe(first);

      router.stop();
    },
  );

  // SOUNDNESS (the safe half of PARITY) — canNavigateTo is a CONSERVATIVE
  // predicate: it must never report a route as reachable that navigate would
  // then reject. For sync guards, excluding the same-state no-op:
  //     canNavigateTo(to) === true  ⟹  navigate(to) resolves
  // This holds even while #970 is open: over-checking shared-ancestor guards
  // only ever yields extra false-NEGATIVES (can=false while navigate resolves),
  // never false-positives. Twin routers (one queried read-only, one committed)
  // avoid the mutator-first false-green trap. The COMPLETENESS half (navigate
  // resolves ⟹ can=true) is the discriminating property that exposes #970 and
  // rides with that fix.
  test.prop(
    [
      arbNavigableRoute,
      arbNavigableRoute,
      fc.option(arbGuard, { nil: undefined }),
      fc.boolean(),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "sound — canNavigateTo(to)=true implies navigate(to) resolves (ex-same-state)",
    async (from, to, guard, singleBag) => {
      const [pathParams, queryParams] = navArgsForRoute(to);

      // Both spellings of the same intent (#1576). `navArgsForRoute` returns
      // PRE-SEPARATED channels because the channel guard's P1 throws on the
      // legacy single-bag form — which quietly removed that half of the input
      // domain from this property at the exact moment the form became a
      // rejection. Soundness has to cover every shape a caller can hand BOTH
      // entry points, or the predicate is free to out-promise the verb on the
      // shapes the generator stopped producing.
      const [params, search] = singleBag
        ? [{ ...pathParams, ...queryParams }, {}]
        : [pathParams, queryParams];

      // Twin instances: `a` answers the predicate, `b` actually commits.
      const a = createFixtureRouter();
      const b = createFixtureRouter();

      await a.start(ROUTE_PATHS[from]);
      await b.start(ROUTE_PATHS[from]);

      // Apply the guard AFTER start so it governs only the transition under test.
      if (guard) {
        applyGuard(a, guard);
        applyGuard(b, guard);
      }

      // Same-route navigation is the same-state no-op here (params are fixed per
      // route): canNavigateTo returns true by design while navigate rejects
      // SAME_STATES — an intentional divergence, not unsoundness. Every distinct
      // fixture route has a distinct path, so from≠to is never a same-state.
      if (from !== to && a.canNavigateTo(to, params, search)) {
        let resolved: boolean;

        try {
          await b.navigate(to, params, search);
          resolved = true;
        } catch {
          resolved = false;
        }

        expect(resolved).toBe(true);
      }

      a.stop();
      b.stop();
    },
  );

  // COMPLETENESS (the other half of PARITY, closed by #970) — canNavigateTo must
  // not UNDER-report reachability: if navigate(to) resolves from `from`, the
  // predicate must return true. This is the discriminating direction that
  // exposed #970 — a guard on the SHARED ANCESTOR of `from` and `to` is trimmed
  // by navigate (the ancestor stays mounted) but was over-checked by
  // canNavigateTo (meta-less toState → fast path ran the whole chain), so
  // canNavigateTo returned false while navigate resolved. Twin routers (one
  // queried read-only, one committed) avoid the mutator-first false-green trap.
  test.prop(
    [
      arbNavigableRoute,
      arbNavigableRoute,
      fc.option(arbGuard, { nil: undefined }),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "complete — navigate(to) resolving implies canNavigateTo(to)=true (ex-same-state)",
    async (from, to, guard) => {
      const [params, search] = navArgsForRoute(to);

      // Twin instances: `a` answers the predicate, `b` actually commits.
      const a = createFixtureRouter();
      const b = createFixtureRouter();

      await a.start(ROUTE_PATHS[from]);
      await b.start(ROUTE_PATHS[from]);

      if (guard) {
        applyGuard(a, guard);
        applyGuard(b, guard);
      }

      // Same-route is the same-state no-op (params fixed per route): navigate
      // rejects SAME_STATES while canNavigateTo returns true by design. Skip it;
      // distinct fixture routes always have distinct paths, so from≠to is safe.
      if (from !== to) {
        let resolved: boolean;

        try {
          await b.navigate(to, params, search);
          resolved = true;
        } catch {
          resolved = false;
        }

        if (resolved) {
          expect(a.canNavigateTo(to, params, search)).toBe(true);
        }
      }

      a.stop();
      b.stop();
    },
  );
});
