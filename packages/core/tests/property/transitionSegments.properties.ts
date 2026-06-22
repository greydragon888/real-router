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
        await router.navigate(targetRoute, getParamsForRoute(targetRoute), {
          signal: controller.signal,
        });

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
});
