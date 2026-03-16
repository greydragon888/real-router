import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import { errorCodes, UNKNOWN_ROUTE, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  createStartedRouter,
  arbNavigableRoute,
  NUM_RUNS,
} from "./helpers";

import type { PluginFactory, State } from "@real-router/core";

function getParamsForRoute(name: string, id = "abc"): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

describe("navigate() → transition.segments Properties", () => {
  test.prop([arbNavigableRoute, arbNavigableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "partition: deactivated + activated covers all changed segments",
    async (fromRoute, toRoute) => {
      fc.pre(fromRoute !== toRoute);

      const router = createFixtureRouter();

      await router.start(
        router.buildPath(fromRoute, getParamsForRoute(fromRoute)),
      );
      await router.navigate(toRoute, getParamsForRoute(toRoute));

      const { deactivated, activated, intersection } =
        router.getState()!.transition!.segments;

      const fromParts = fromRoute.split(".");
      const toParts = toRoute.split(".");
      const intersectionParts = intersection ? intersection.split(".") : [];

      expect(
        deactivated.length + intersectionParts.length,
      ).toBeGreaterThanOrEqual(fromParts.length - intersectionParts.length);
      expect(activated.length).toBeGreaterThanOrEqual(
        toParts.length - intersectionParts.length,
      );

      router.stop();
    },
  );

  test.prop([arbNavigableRoute, arbNavigableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "intersection is common prefix of fromState.name and toState.name",
    async (fromRoute, toRoute) => {
      fc.pre(fromRoute !== toRoute);

      const router = createFixtureRouter();

      await router.start(
        router.buildPath(fromRoute, getParamsForRoute(fromRoute)),
      );
      await router.navigate(toRoute, getParamsForRoute(toRoute));

      const { intersection } = router.getState()!.transition!.segments;

      if (intersection) {
        expect(fromRoute.startsWith(intersection)).toBe(true);
        expect(toRoute.startsWith(intersection)).toBe(true);
      }

      router.stop();
    },
  );

  test.prop([arbNavigableRoute, arbNavigableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "deactivated is in reverse order (leaf to root)",
    async (fromRoute, toRoute) => {
      fc.pre(fromRoute !== toRoute);

      const router = createFixtureRouter();

      await router.start(
        router.buildPath(fromRoute, getParamsForRoute(fromRoute)),
      );
      await router.navigate(toRoute, getParamsForRoute(toRoute));

      const { deactivated } = router.getState()!.transition!.segments;

      for (let i = 0; i < deactivated.length - 1; i++) {
        expect(deactivated[i].length).toBeGreaterThanOrEqual(
          deactivated[i + 1].length,
        );
      }

      router.stop();
    },
  );

  test.prop([arbNavigableRoute, arbNavigableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "activated is in forward order (root to leaf)",
    async (fromRoute, toRoute) => {
      fc.pre(fromRoute !== toRoute);

      const router = createFixtureRouter();

      await router.start(
        router.buildPath(fromRoute, getParamsForRoute(fromRoute)),
      );
      await router.navigate(toRoute, getParamsForRoute(toRoute));

      const { activated } = router.getState()!.transition!.segments;

      for (let i = 0; i < activated.length - 1; i++) {
        expect(activated[i].length).toBeLessThanOrEqual(
          activated[i + 1].length,
        );
      }

      router.stop();
    },
  );

  it("first navigation: deactivated is empty", async () => {
    const router = await createStartedRouter("/users/abc");
    const { deactivated } = router.getState()!.transition!.segments;

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
