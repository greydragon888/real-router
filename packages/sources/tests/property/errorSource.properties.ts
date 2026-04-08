import { fc, test } from "@fast-check/vitest";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect, vi } from "vitest";

import {
  arbRouteName,
  arbDestroyCount,
  createStartedRouter,
  NUM_RUNS,
  paramsForRoute,
} from "./helpers";
import { createErrorSource } from "../../src";

// Routes that can have guards added for error generation
const arbGuardableRoute = fc.constantFrom(
  "users.list",
  "users.view",
  "users.edit",
  "admin.dashboard",
  "admin.settings",
  "search",
);

describe("createErrorSource — version monotonicity", () => {
  test.prop([fc.array(arbGuardableRoute, { minLength: 1, maxLength: 5 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "error snapshot version increments monotonically on each error",
    async (routes) => {
      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      for (const route of routes) {
        lifecycle.addActivateGuard(route, () => () => false);
      }

      const source = createErrorSource(router);
      let previousVersion = source.getSnapshot().version;

      for (const route of routes) {
        await router.navigate(route, paramsForRoute(route)).catch(() => {});

        const currentVersion = source.getSnapshot().version;

        expect(currentVersion).toBeGreaterThan(previousVersion);

        previousVersion = currentVersion;
      }

      router.stop();
      source.destroy();
    },
  );
});

describe("createErrorSource — error cleared on success", () => {
  test.prop([arbGuardableRoute, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "error cleared on TRANSITION_SUCCESS",
    async (errorRoute, successRoute) => {
      fc.pre(errorRoute !== successRoute && successRoute !== "home");

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(errorRoute, () => () => false);

      const source = createErrorSource(router);

      await router
        .navigate(errorRoute, paramsForRoute(errorRoute))
        .catch(() => {});

      expect(source.getSnapshot().error).not.toBeNull();

      await router.navigate(successRoute, paramsForRoute(successRoute));

      expect(source.getSnapshot().error).toBeNull();
      expect(source.getSnapshot().toRoute).toBeNull();
      expect(source.getSnapshot().fromRoute).toBeNull();

      router.stop();
      source.destroy();
    },
  );
});

describe("createErrorSource — snapshot reference stability", () => {
  test.prop([arbGuardableRoute, fc.integer({ min: 2, max: 10 })], {
    numRuns: NUM_RUNS.standard,
  })(
    "same error reference preserved until next error",
    async (errorRoute, readCount) => {
      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(errorRoute, () => () => false);

      const source = createErrorSource(router);

      await router
        .navigate(errorRoute, paramsForRoute(errorRoute))
        .catch(() => {});

      const firstSnapshot = source.getSnapshot();

      for (let i = 1; i < readCount; i++) {
        expect(source.getSnapshot()).toBe(firstSnapshot);
      }

      router.stop();
      source.destroy();
    },
  );
});

describe("createErrorSource — destroy", () => {
  test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
    "destroy is idempotent",
    async (destroyCount) => {
      const router = await createStartedRouter();
      const source = createErrorSource(router);

      for (let i = 0; i < destroyCount; i++) {
        expect(() => {
          source.destroy();
        }).not.toThrow();
      }

      router.stop();
    },
  );

  test.prop([arbGuardableRoute], { numRuns: NUM_RUNS.standard })(
    "post-destroy: listeners not notified on new errors",
    async (errorRoute) => {
      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(errorRoute, () => () => false);

      const source = createErrorSource(router);
      const listener = vi.fn();

      source.subscribe(listener);
      source.destroy();

      await router
        .navigate(errorRoute, paramsForRoute(errorRoute))
        .catch(() => {});

      expect(listener).not.toHaveBeenCalled();

      router.stop();
    },
  );

  test.prop([arbGuardableRoute], { numRuns: NUM_RUNS.standard })(
    "post-destroy: getSnapshot returns last snapshot before destroy",
    async (errorRoute) => {
      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(errorRoute, () => () => false);

      const source = createErrorSource(router);

      await router
        .navigate(errorRoute, paramsForRoute(errorRoute))
        .catch(() => {});

      const lastSnapshot = source.getSnapshot();

      source.destroy();

      expect(source.getSnapshot()).toBe(lastSnapshot);

      router.stop();
    },
  );
});
