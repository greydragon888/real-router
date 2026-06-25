import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  arbNavigableRoute,
  FIXTURE_ROUTE_NAMES,
  ROUTE_PATHS,
  NUM_RUNS,
} from "./helpers";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

/**
 * Independent cumulative segment ids for a dotted route name — the model oracle,
 * deliberately NOT core's `nameToIDs`. e.g. "users.view" → ["users", "users.view"].
 */
function cumulativeIds(name: string): string[] {
  const parts = name.split(".");

  return parts.map((_, i) => parts.slice(0, i + 1).join("."));
}

describe("Guards + navigate() Interaction Properties", () => {
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "activate guard returning false blocks navigation with CANNOT_ACTIVATE",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(targetRoute, () => () => false);

      await router.start("/");

      try {
        await router.navigate(targetRoute, getParamsForRoute(targetRoute));

        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RouterError);
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "all guards returning true allows navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(targetRoute, () => () => true);

      await router.start("/");
      const state = await router.navigate(
        targetRoute,
        getParamsForRoute(targetRoute),
      );

      expect(state.name).toBe(targetRoute);

      router.stop();
    },
  );

  it("deactivate guards run before activate guards", async () => {
    const router = createFixtureRouter();
    const lifecycle = getLifecycleApi(router);
    const callOrder: string[] = [];

    lifecycle.addDeactivateGuard("home", () => () => {
      callOrder.push("deactivate");

      return true;
    });

    lifecycle.addActivateGuard("admin.settings", () => () => {
      callOrder.push("activate");

      return true;
    });

    await router.start("/");
    await router.navigate("admin.settings");

    expect(callOrder).toStrictEqual(["deactivate", "activate"]);

    router.stop();
  });

  // Generalizes the fixed "deactivate before activate" test above to the full
  // cross-product of from→to over NAVIGABLE_ROUTE_NAMES, asserting the EXACT
  // call order across ALL segments — not just that deactivate precedes activate.
  //
  // Hook Execution Order contract (packages/core/CLAUDE.md):
  //   1. deactivate guards fire innermost→outermost (reverse of the from-chain)
  //   2. activate   guards fire outermost→innermost (forward along the to-chain)
  // Guards run ONLY on the diverging suffix — segments at/below the common
  // ancestor (the intersection) stay mounted and their guards do not fire. For
  // this fixture every shared ancestor (`users`, `admin`) is param-less, so the
  // divergence point is purely name-based and an independent prefix walk over the
  // cumulative segment ids reproduces it exactly (no segmentParamsEqual needed —
  // the only param-bearing routes are leaves, which always diverge by name here).
  test.prop([arbNavigableRoute, arbNavigableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "guards fire deactivate innermost→outermost then activate outermost→innermost",
    async (from, to) => {
      // Same route → SAME_STATES (no transition, no guards). Skip.
      fc.pre(from !== to);

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);
      const callOrder: string[] = [];

      // Attach guards to EVERY segment that can appear in a transition — the
      // navigable leaves AND their intermediate ancestors (`users`, `admin`),
      // which surface as ids in the diverging suffix (e.g. users.view→admin.x
      // deactivates `users`, activates `admin`). FIXTURE_ROUTE_NAMES covers all
      // of them; the `oldUsers` forwardTo alias never appears as a real segment
      // id, so its guard is inert.
      for (const name of FIXTURE_ROUTE_NAMES) {
        lifecycle.addDeactivateGuard(name, () => () => {
          callOrder.push(`D:${name}`);

          return true;
        });
        lifecycle.addActivateGuard(name, () => () => {
          callOrder.push(`A:${name}`);

          return true;
        });
      }

      await router.start(ROUTE_PATHS[from]);
      // Guards attached to `from` may have fired on start (activation chain).
      callOrder.length = 0;

      await router.navigate(to, getParamsForRoute(to));

      // Independent model of the diverging suffix (never via core's nameToIDs).
      const fromIds = cumulativeIds(from);
      const toIds = cumulativeIds(to);
      let i = 0;

      while (
        i < fromIds.length &&
        i < toIds.length &&
        fromIds[i] === toIds[i]
      ) {
        i++;
      }

      // Deactivate the from-suffix leaf→root, then activate the to-suffix
      // root→leaf. Guards only exist for the seven navigable leaf routes plus
      // their ancestors (`users`, `admin`) — every id in these suffixes has a
      // registered guard, so the expected order is the full divergence.
      const expectedDeactivate = fromIds.slice(i).toReversed();
      const expectedActivate = toIds.slice(i);
      const expected = [
        ...expectedDeactivate.map((name) => `D:${name}`),
        ...expectedActivate.map((name) => `A:${name}`),
      ];

      expect(callOrder).toStrictEqual(expected);

      router.stop();
    },
  );

  it("guard receives correct toState and fromState", async () => {
    const router = createFixtureRouter();
    const lifecycle = getLifecycleApi(router);
    let receivedTo: string | undefined;
    let receivedFrom: string | undefined;

    lifecycle.addActivateGuard("admin.settings", () => (toState, fromState) => {
      receivedTo = toState.name;
      receivedFrom = fromState?.name;

      return true;
    });

    await router.start("/");
    await router.navigate("admin.settings");

    expect(receivedTo).toBe("admin.settings");
    expect(receivedFrom).toBe("home");

    router.stop();
  });

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "async guard returning Promise<false> blocks navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(targetRoute, () => async () => false);

      await router.start("/");

      try {
        await router.navigate(targetRoute, getParamsForRoute(targetRoute));

        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RouterError);
        expect((error as RouterError).code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "async guard returning Promise<true> allows navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(targetRoute, () => async () => true);

      await router.start("/");
      const state = await router.navigate(
        targetRoute,
        getParamsForRoute(targetRoute),
      );

      expect(state.name).toBe(targetRoute);

      router.stop();
    },
  );

  it("guard receives AbortSignal as third parameter", async () => {
    const router = createFixtureRouter();
    const lifecycle = getLifecycleApi(router);
    let receivedSignal: AbortSignal | undefined;

    lifecycle.addActivateGuard(
      "admin.settings",
      () => (_toState, _fromState, signal) => {
        receivedSignal = signal;

        return true;
      },
    );

    await router.start("/");
    await router.navigate("admin.settings");

    expect(receivedSignal).toBeInstanceOf(AbortSignal);

    router.stop();
  });
});
