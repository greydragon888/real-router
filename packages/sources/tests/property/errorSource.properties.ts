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
  test.prop([fc.array(arbGuardableRoute, { minLength: 1, maxLength: 25 })], {
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

  test.prop([fc.array(arbGuardableRoute, { minLength: 100, maxLength: 200 })], {
    numRuns: 20,
  })(
    "version monotonicity holds over long sequences (≥100 errors)",
    async (routes) => {
      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      for (const route of new Set(routes)) {
        lifecycle.addActivateGuard(route, () => () => false);
      }

      const source = createErrorSource(router);
      const versions: number[] = [source.getSnapshot().version];

      for (const route of routes) {
        await router.navigate(route, paramsForRoute(route)).catch(() => {});
        versions.push(source.getSnapshot().version);
      }

      // Strictly increasing across the entire sequence — no plateau, no rollback.
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]).toBeGreaterThan(versions[i - 1]);
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

  test.prop([arbGuardableRoute, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "TRANSITION_SUCCESS does NOT advance error.version (only TRANSITION_ERROR does)",
    async (errorRoute, successRoute) => {
      fc.pre(errorRoute !== successRoute && successRoute !== "home");

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(errorRoute, () => () => false);

      const source = createErrorSource(router);

      await router
        .navigate(errorRoute, paramsForRoute(errorRoute))
        .catch(() => {});

      const versionAfterError = source.getSnapshot().version;

      await router.navigate(successRoute, paramsForRoute(successRoute));

      // SUCCESS clears error/toRoute/fromRoute but version is sticky.
      expect(source.getSnapshot().version).toBe(versionAfterError);

      router.stop();
      source.destroy();
    },
  );
});

describe("createErrorSource — TRANSITION_CANCEL leaves snapshot unchanged", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.async })(
    "TRANSITION_CANCEL does not change error snapshot reference",
    async (routeName) => {
      fc.pre(routeName !== "home");

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);
      let resolveGuard!: (value: boolean) => void;

      lifecycle.addActivateGuard(routeName, () => () => {
        return new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        });
      });

      const source = createErrorSource(router);
      const snapshotBeforeCancel = source.getSnapshot();

      const cancelTarget =
        routeName === "admin.settings" ? "users.list" : "admin.settings";

      const p1 = router.navigate(routeName, paramsForRoute(routeName));

      await Promise.resolve();

      const p2 = router.navigate(cancelTarget);

      resolveGuard(true);
      await p2;
      await p1.catch(() => {});

      // CANCEL is not an error → snapshot reference must be unchanged.
      expect(source.getSnapshot()).toBe(snapshotBeforeCancel);

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

// =============================================================================
// Audit 2026-05-16 §6 (MEDIUM) — version persists across SUCCESS
// After the sequence [error, success, error], the second error's version must
// be STRICTLY greater than the first error's version. A `TRANSITION_SUCCESS`
// event resets `error` to `null` but must NOT decrement / reset the version
// counter — otherwise consumers using `version` as a "new error happened"
// signal would miss the second error.
// =============================================================================

describe("createErrorSource — version persists across SUCCESS (audit §6 MEDIUM)", () => {
  test.prop([arbGuardableRoute, arbGuardableRoute, arbGuardableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "[error, success, error]: second-error version is strictly greater than first-error version",
    async (errorRoute1, successRoute, errorRoute2) => {
      // successRoute must NOT be guarded and must differ from the boot route
      // so the SUCCESS event actually fires. Guard only the error routes.
      fc.pre(
        successRoute !== errorRoute1 &&
          successRoute !== errorRoute2 &&
          errorRoute1 !== errorRoute2,
      );

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(errorRoute1, () => () => false);
      lifecycle.addActivateGuard(errorRoute2, () => () => false);

      const source = createErrorSource(router);

      const baselineVersion = source.getSnapshot().version;

      // First error.
      await router
        .navigate(errorRoute1, paramsForRoute(errorRoute1))
        .catch(() => {});

      const firstErrorVersion = source.getSnapshot().version;

      expect(firstErrorVersion).toBeGreaterThan(baselineVersion);
      expect(source.getSnapshot().error).not.toBeNull();

      // Intervening SUCCESS — resets `error` to null but must NOT touch the
      // version counter. successRoute is unguarded so navigation succeeds.
      await router.navigate(successRoute, paramsForRoute(successRoute));

      const afterSuccessVersion = source.getSnapshot().version;

      expect(afterSuccessVersion).toBe(firstErrorVersion);
      expect(source.getSnapshot().error).toBeNull();

      // Second error.
      await router
        .navigate(errorRoute2, paramsForRoute(errorRoute2))
        .catch(() => {});

      const secondErrorVersion = source.getSnapshot().version;

      // STRICTLY greater than the first error — the counter advanced even
      // though SUCCESS was in between.
      expect(secondErrorVersion).toBeGreaterThan(firstErrorVersion);
      expect(source.getSnapshot().error).not.toBeNull();

      source.destroy();
      router.stop();
    },
  );

  test.prop([arbGuardableRoute, arbGuardableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "single SUCCESS between two errors of the same route still advances version",
    async (errorRoute, successRoute) => {
      fc.pre(successRoute !== errorRoute);

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(errorRoute, () => () => false);

      const source = createErrorSource(router);

      await router
        .navigate(errorRoute, paramsForRoute(errorRoute))
        .catch(() => {});
      const v1 = source.getSnapshot().version;

      await router
        .navigate(successRoute, paramsForRoute(successRoute))
        .catch(() => {});

      // SUCCESS does not change version.
      expect(source.getSnapshot().version).toBe(v1);

      // Different params so SAME_STATES is not hit when re-navigating to errorRoute.
      const params2 = paramsForRoute(errorRoute, 999_999);

      await router.navigate(errorRoute, params2).catch(() => {});
      const v2 = source.getSnapshot().version;

      expect(v2).toBeGreaterThan(v1);

      source.destroy();
      router.stop();
    },
  );
});
