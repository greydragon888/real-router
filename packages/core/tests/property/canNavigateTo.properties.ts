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
} from "./helpers";

import type { Router } from "@real-router/core";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

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

      expect(router.canNavigateTo(route, getParamsForRoute(route))).toBe(true);

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

      expect(router.canNavigateTo(route, getParamsForRoute(route))).toBe(true);

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

      expect(router.canNavigateTo(route, getParamsForRoute(route))).toBe(false);

      router.stop();
    },
  );

  // #725 — the predicate must answer, never throw, on incomplete input. Routes
  // with required path params (e.g. users.view "/users/:id") used to throw a
  // raw buildPath Error when called with empty params; they now resolve to false.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "missing required params resolve to false instead of throwing",
    async (route) => {
      const router = createFixtureRouter();

      await router.start("/");

      let result: boolean | undefined;

      expect(() => {
        result = router.canNavigateTo(route, {});
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

      router.canNavigateTo(route, getParamsForRoute(route));

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

      const params = getParamsForRoute(route);
      const first = router.canNavigateTo(route, params);

      expect(router.canNavigateTo(route, params)).toBe(first);
      expect(router.canNavigateTo(route, params)).toBe(first);

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
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "sound — canNavigateTo(to)=true implies navigate(to) resolves (ex-same-state)",
    async (from, to, guard) => {
      const params = getParamsForRoute(to);

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
      if (from !== to && a.canNavigateTo(to, params)) {
        let resolved: boolean;

        try {
          await b.navigate(to, params);
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
});
