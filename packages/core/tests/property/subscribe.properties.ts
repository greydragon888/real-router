import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import { createStartedRouter, arbNavigableRoute, NUM_RUNS } from "./helpers";

import type { State } from "@real-router/core";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

describe("subscribe() Event Delivery Properties", () => {
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "route === getState() after navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");
      const listener = vi.fn();

      router.subscribe(listener);

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      expect(listener).toHaveBeenCalled();

      const { route } = listener.mock.calls[0][0] as {
        route: State;
        previousRoute: State | undefined;
      };

      expect(route).toBe(router.getState());

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "previousRoute === getPreviousState() after navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");
      const listener = vi.fn();

      router.subscribe(listener);

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      const { previousRoute } = listener.mock.calls[0][0] as {
        route: State;
        previousRoute: State | undefined;
      };

      expect(previousRoute).toBe(router.getPreviousState());

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "subscriber called exactly once per successful navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");
      const listener = vi.fn();

      router.subscribe(listener);

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      expect(listener).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );

  it("unsubscribe prevents future calls", async () => {
    const router = await createStartedRouter("/");

    const listener = vi.fn();
    const unsubscribe = router.subscribe(listener);

    unsubscribe();

    await router.navigate("admin.settings");

    expect(listener).not.toHaveBeenCalled();

    router.stop();
  });
});
