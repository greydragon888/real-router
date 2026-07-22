import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import {
  createRouter,
  errorCodes,
  UNKNOWN_ROUTE,
  RouterError,
} from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  createStartedRouter,
  arbNavigableRoute,
  NUM_RUNS,
} from "./helpers";

import type { PluginFactory, Route, State } from "@real-router/core";

function getParamsForRoute(name: string, id = "abc"): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

// =============================================================================
// Deep, param-less route tree + independent model oracle
// =============================================================================
//
// The previous segment properties ran against the ≤2-level fixture with loose
// PROXY oracles (length-monotonicity for ordering, `String.startsWith` for the
// intersection) that (a) barely executed (deactivated/activated had ≤2 elements
// so the ordering loops ran 0-1×) and (b) admitted wrong outputs. The
// intersection test was 100% vacuous: for PARAM-LESS routes
// `computeTransitionPath` always returns `intersection: ""` with the FULL id
// chains (no common-prefix trim) — `if (intersection)` never ran.
//
// A 4-level tree + a MODEL-BASED oracle (independently recompute the expected
// `deactivated`/`activated`/`intersection` from the route names, never via the
// code under test) now asserts the exact arrays via `toStrictEqual`, across
// cross-level and shared-ancestor transitions.
//
// NOTE (follow-up): the non-empty-intersection / partial-chain path
// (`pointOfDifference`, transitionPath.ts) only engages for routes carrying
// state META params (`defaultParams`). Modelling it needs a `segmentParamsEqual`
// oracle and is left as a separate targeted suite; this file covers the dominant
// param-less branch exactly.

/** Nested, param-less route tree `depth` levels deep, `breadth` wide. */
function buildDeepTree(depth: number, breadth: number): Route[] {
  function buildLevel(currentDepth: number, prefix: string): Route[] {
    return Array.from({ length: breadth }, (_, i) => {
      const fullName = `${prefix}level${currentDepth}_${i}`;
      const route: Route = {
        name: prefix ? `level${currentDepth}_${i}` : fullName,
        path: `/level${currentDepth}_${i}`,
      };

      if (currentDepth < depth - 1) {
        route.children = buildLevel(currentDepth + 1, `${fullName}.`);
      }

      return route;
    });
  }

  return buildLevel(0, "");
}

const DEEP_TREE: Route[] = buildDeepTree(4, 2);

/** Every node's FULL dotted name (createDeepRouteTree stores short segment names). */
function collectFullNames(routes: Route[], prefix = ""): string[] {
  const out: string[] = [];

  for (const route of routes) {
    const full = prefix ? `${prefix}.${route.name}` : route.name;

    out.push(full);

    if (route.children) {
      out.push(...collectFullNames(route.children, full));
    }
  }

  return out;
}

const DEEP_NAMES = collectFullNames(DEEP_TREE);
const arbDeepNode = fc.constantFrom(...(DEEP_NAMES as [string, ...string[]]));

/** Independent cumulative segment ids — NOT core's `nameToIDs`. */
function modelIds(name: string): string[] {
  const parts = name.split(".");

  return parts.map((_, i) => parts.slice(0, i + 1).join("."));
}

// Tree with a PARAM-bearing ancestor ("parent" owns :pid) to exercise the
// meta-param branch of computeTransitionPath (`pointOfDifference` /
// `segmentParamsEqual`): a shared ancestor whose NAME matches must still
// re-mount when its OWN param value changes between from and to.
const PARAM_TREE: Route[] = [
  { name: "home", path: "/home" },
  {
    name: "parent",
    path: "/parent/:pid",
    children: [
      { name: "childA", path: "/a" },
      { name: "childB", path: "/b" },
    ],
  },
];

const arbPid = fc.constantFrom("1", "2", "3");

describe("navigate() → transition.segments Properties", () => {
  test.prop([arbDeepNode, arbDeepNode], { numRuns: NUM_RUNS.standard })(
    "transition.segments equal the independently-computed model (param-less branch)",
    async (from, to) => {
      fc.pre(from !== to);

      const router = createRouter(
        [{ name: "home", path: "/home" }, ...DEEP_TREE],
        {
          defaultRoute: "home",
        },
      );

      await router.start("/home");
      await router.navigate(from);

      const state = await router.navigate(to);
      const { deactivated, activated, intersection } =
        state.transition.segments;

      // Independent model of the nested-router transition spec: the common
      // ancestor prefix stays mounted, so only the divergent from-suffix is
      // deactivated (leaf→root) and only the divergent to-suffix is activated
      // (root→leaf); intersection = deepest common ancestor. These routes are
      // param-less, so divergence is purely by name (segment params never
      // differ). Exact arrays catch a missing reverse, a wrong slice, or a
      // mis-computed intersection.
      const f = modelIds(from);
      const t = modelIds(to);
      let i = 0;

      while (i < f.length && i < t.length && f[i] === t[i]) {
        i++;
      }

      expect([...deactivated]).toStrictEqual(f.slice(i).toReversed());
      expect([...activated]).toStrictEqual(t.slice(i));
      expect(intersection).toBe(i > 0 ? f[i - 1] : "");

      router.stop();
    },
  );

  test.prop([arbDeepNode], { numRuns: NUM_RUNS.standard })(
    "first navigation (no fromState): deactivated empty, activated is the full to-chain",
    async (to) => {
      const router = createRouter([...DEEP_TREE], {
        defaultRoute: DEEP_NAMES[0],
      });

      // Start directly at `to` so it IS the first navigation (no fromState).
      await router.start(router.buildPath(to));

      const { deactivated, activated, intersection } =
        router.getState()!.transition.segments;

      expect([...deactivated]).toStrictEqual([]);
      expect([...activated]).toStrictEqual(modelIds(to));
      expect(intersection).toBe("");

      router.stop();
    },
  );

  test.prop([arbPid, arbPid], { numRuns: NUM_RUNS.standard })(
    "meta-param branch: a name-matching ancestor stays mounted IFF its own param is unchanged",
    async (pidFrom, pidTo) => {
      const router = createRouter(PARAM_TREE, { defaultRoute: "home" });

      await router.start("/home");
      await router.navigate("parent.childA", { pid: pidFrom });

      const state = await router.navigate("parent.childB", { pid: pidTo });
      const { deactivated, activated, intersection } =
        state.transition.segments;

      if (pidFrom === pidTo) {
        // Ancestor "parent" param unchanged → it stays the intersection; only
        // the diverging leaf re-mounts (segmentParamsEqual("parent") === true,
        // so pointOfDifference walks past the ancestor to the name divergence).
        expect(intersection).toBe("parent");
        expect([...deactivated]).toStrictEqual(["parent.childA"]);
        expect([...activated]).toStrictEqual(["parent.childB"]);
      } else {
        // Ancestor "parent"'s OWN param changed → segmentParamsEqual("parent")
        // is false, so pointOfDifference stops AT the ancestor: it deactivates +
        // re-activates and the intersection empties, even though its NAME
        // matches. This is the meta-param path the param-less model can't reach.
        expect(intersection).toBe("");
        expect([...deactivated]).toStrictEqual(["parent.childA", "parent"]);
        expect([...activated]).toStrictEqual(["parent", "parent.childB"]);
      }

      router.stop();
    },
  );

  it("first navigation: deactivated is empty", async () => {
    const router = await createStartedRouter("/users/abc");
    const { deactivated } = router.getState()!.transition.segments;

    expect(deactivated).toStrictEqual([]);

    router.stop();
  });

  it("same route navigation → SAME_STATES error", async () => {
    const router = await createStartedRouter("/users/abc");

    await expect(router.navigate("users.view", { id: "abc" })).rejects.toThrow(
      expect.objectContaining({ code: errorCodes.SAME_STATES }),
    );

    router.stop();
  });

  it("navigate to unknown route → ROUTE_NOT_FOUND error", async () => {
    const router = await createStartedRouter("/users/abc");

    await expect(router.navigate("nonexistent")).rejects.toThrow(
      expect.objectContaining({ code: errorCodes.ROUTE_NOT_FOUND }),
    );

    router.stop();
  });

  it("cancellation: concurrent navigate cancels first", async () => {
    vi.useFakeTimers();

    const router = await createStartedRouter("/users/abc");

    // Async guard keeps "home" navigation pending so concurrent navigate can cancel it
    getLifecycleApi(router).addActivateGuard(
      "home",
      () => () =>
        new Promise<boolean>((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 50),
        ),
    );

    const p1 = router.navigate("home");
    const p2 = router.navigate("admin.settings");

    await vi.runAllTimersAsync();

    await expect(p1).rejects.toThrow(RouterError);

    try {
      await p1;
    } catch (error) {
      expect((error as RouterError).code).toBe(errorCodes.TRANSITION_CANCELLED);
    }

    await p2;

    expect(router.getState()!.name).toBe("admin.settings");

    router.stop();
    vi.useRealTimers();
  });

  it("reload: true bypasses SAME_STATES", async () => {
    const router = await createStartedRouter("/users/abc");

    const state = await router.navigate(
      "users.view",
      { id: "abc" },
      undefined,
      { reload: true },
    );

    expect(state.name).toBe("users.view");

    router.stop();
  });

  it("state consistency: resolved state === getState()", async () => {
    const router = await createStartedRouter("/users/abc");

    const resolvedState = await router.navigate("admin.settings");

    expect(resolvedState).toBe(router.getState());

    router.stop();
  });

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "AbortSignal cancellation: aborting signal rejects with TRANSITION_CANCELLED",
    async (targetRoute) => {
      fc.pre(targetRoute !== "users.view");

      const router = await createStartedRouter("/users/abc");
      const controller = new AbortController();

      controller.abort();

      try {
        await router.navigate(
          targetRoute,
          getParamsForRoute(targetRoute),
          undefined,
          {
            signal: controller.signal,
          },
        );

        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RouterError);
        expect((error as RouterError).code).toBe(
          errorCodes.TRANSITION_CANCELLED,
        );
      }

      router.stop();
    },
  );

  it("force replace from UNKNOWN_ROUTE: navigate forces replace:true in opts", async () => {
    const router = createFixtureRouter({ allowNotFound: true });

    await router.start("/nonexistent-path");

    expect(router.getState()!.name).toBe(UNKNOWN_ROUTE);

    const receivedOpts = vi.fn();

    const plugin: PluginFactory = () => ({
      onTransitionSuccess(
        _toState: State,
        _fromState: State | undefined,
        opts,
      ) {
        receivedOpts(opts);
      },
    });

    router.usePlugin(plugin);

    await router.navigate("home");

    expect(receivedOpts).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true }),
    );

    router.stop();
  });

  // N-8: forceReplaceFromUnknown must OVERRIDE an explicit `{ replace: false }`,
  // not merely fill in undefined opts. The test above passes undefined opts, so
  // the override branch (caller asked for replace:false, core forces it true)
  // never executed. A regression that "respected the caller" would push a 404
  // into history. Other caller opts (reload) must survive the force.
  test.prop(
    [
      arbNavigableRoute,
      fc.constantFrom(
        undefined,
        { replace: false },
        { replace: false, reload: true },
      ),
    ],
    { numRuns: NUM_RUNS.fast },
  )(
    "from UNKNOWN_ROUTE: replace is forced true even over an explicit {replace:false}, other opts preserved",
    async (target, opts) => {
      const router = createFixtureRouter({ allowNotFound: true });

      await router.start("/nonexistent-path");

      expect(router.getState()!.name).toBe(UNKNOWN_ROUTE);

      const state = await router.navigate(
        target,
        getParamsForRoute(target),
        undefined,
        opts,
      );

      // Forced regardless of the caller's explicit `replace: false`.
      expect(state.transition.replace).toBe(true);

      // A non-replace option set by the caller rides through untouched.
      if (opts && "reload" in opts) {
        expect(state.transition.reload).toBe(true);
      }

      router.stop();
    },
  );

  // N-8/§6.5: the `isSameNavigation` bypass matrix. Re-navigating to the CURRENT
  // route rejects SAME_STATES — UNLESS `reload` OR `force` is set. The `force`
  // branch of `isSameNavigation` had no property coverage at all.
  test.prop(
    [
      arbNavigableRoute,
      fc.constantFrom(
        {},
        { reload: true },
        { force: true },
        { reload: true, force: true },
      ),
    ],
    { numRuns: NUM_RUNS.fast },
  )(
    "same-route navigate rejects SAME_STATES iff neither reload nor force is set",
    async (target, opts) => {
      const params = getParamsForRoute(target);
      const router = createFixtureRouter();

      await router.start(router.buildPath(target, params));

      expect(router.getState()?.name).toBe(target);

      if ("reload" in opts || "force" in opts) {
        const state = await router.navigate(target, params, undefined, opts);

        expect(state.name).toBe(target);
      } else {
        await expect(
          router.navigate(target, params, undefined, opts),
        ).rejects.toMatchObject({ code: errorCodes.SAME_STATES });
      }

      router.stop();
    },
  );

  // N-9: a sync guard (`() => true`) and an async guard
  // (`() => Promise.resolve(true)`) drive navigate down its two distinct code
  // paths (optimistic-sync vs async-tail). The COMMITTED state must be
  // structurally identical regardless of which path ran — a race or ordering bug
  // in the async tail would diverge here.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "sync vs async activation guard produce a structurally identical final state",
    async (target) => {
      fc.pre(target !== "home");

      const params = getParamsForRoute(target);

      const syncRouter = createFixtureRouter();
      const asyncRouter = createFixtureRouter();

      await syncRouter.start("/");
      await asyncRouter.start("/");

      getLifecycleApi(syncRouter).addActivateGuard(target, () => () => true);
      getLifecycleApi(asyncRouter).addActivateGuard(
        target,
        () => () => Promise.resolve(true),
      );

      const sync = await syncRouter.navigate(target, params);
      const async = await asyncRouter.navigate(target, params);

      expect(async.name).toBe(sync.name);
      expect(async.path).toBe(sync.path);
      expect(async.params).toStrictEqual(sync.params);
      expect([...async.transition.segments.activated]).toStrictEqual([
        ...sync.transition.segments.activated,
      ]);
      expect([...async.transition.segments.deactivated]).toStrictEqual([
        ...sync.transition.segments.deactivated,
      ]);
      expect(async.transition.segments.intersection).toBe(
        sync.transition.segments.intersection,
      );

      syncRouter.stop();
      asyncRouter.stop();
    },
  );

  // N-10/§6.3: a PRE-aborted external signal propagates its abort REASON onto
  // the rejection (`#abortPreviousNavigation` throws TRANSITION_CANCELLED with
  // `{ reason: externalSignal.reason }`). The existing AbortSignal property pins
  // only the code. Generalizes the fixed-route functional test (abort-signal
  // test 14) over arbitrary navigable targets. NOTE: holds for the PRE-aborted
  // path only — a mid-flight abort yields a bare TRANSITION_CANCELLED (the
  // reason then lives on signal.reason, not the rejection).
  test.prop([arbNavigableRoute, fc.string({ minLength: 1, maxLength: 30 })], {
    numRuns: NUM_RUNS.fast,
  })(
    "pre-aborted signal propagates the abort reason onto the TRANSITION_CANCELLED rejection",
    async (target, message) => {
      fc.pre(target !== "users.view");

      const router = await createStartedRouter("/users/abc");
      const controller = new AbortController();
      const reason = new Error(message);

      controller.abort(reason);

      const error = await router
        .navigate(target, getParamsForRoute(target), undefined, {
          signal: controller.signal,
        })
        .catch((error_: unknown) => error_);

      expect(error).toBeInstanceOf(RouterError);
      expect(error).toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
        reason,
      });

      router.stop();
    },
  );
});
