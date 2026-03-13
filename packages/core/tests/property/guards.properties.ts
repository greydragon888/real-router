import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createFixtureRouter, arbNavigableRoute, NUM_RUNS } from "./helpers";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
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
