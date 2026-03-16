import { fc, test } from "@fast-check/vitest";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect, vi } from "vitest";

import {
  arbDestroyCount,
  arbNavigationSeq,
  arbRouteName,
  createStartedRouter,
  NUM_RUNS,
  paramsForRoute,
} from "./helpers";
import { createTransitionSource } from "../../src";

describe("createTransitionSource — state machine", () => {
  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "initial snapshot is IDLE regardless of prior router state",
    async (navSeq) => {
      const router = await createStartedRouter();

      for (const nav of navSeq) {
        await router.navigate(nav.name, nav.params).catch(() => {});
      }

      const source = createTransitionSource(router);

      expect(source.getSnapshot()).toStrictEqual({
        isTransitioning: false,
        toRoute: null,
        fromRoute: null,
      });

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.async })(
    "isTransitioning is true and toRoute set at TRANSITION_START",
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

      const source = createTransitionSource(router);

      void router.navigate(routeName, paramsForRoute(routeName));
      await Promise.resolve();

      const snapshot = source.getSnapshot();

      expect(snapshot.isTransitioning).toBe(true);
      expect(snapshot.toRoute?.name).toStrictEqual(routeName);

      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "snapshot returns to IDLE after each successful navigation",
    async (navSeq) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);

      for (const nav of navSeq) {
        await router.navigate(nav.name, nav.params).catch(() => {});

        expect(source.getSnapshot()).toStrictEqual({
          isTransitioning: false,
          toRoute: null,
          fromRoute: null,
        });
      }

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "snapshot returns to IDLE after guard rejection (TRANSITION_ERROR)",
    async (routeName) => {
      fc.pre(routeName !== "home");

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(routeName, () => () => false);

      const source = createTransitionSource(router);

      await router
        .navigate(routeName, paramsForRoute(routeName))
        .catch(() => {});

      expect(source.getSnapshot()).toStrictEqual({
        isTransitioning: false,
        toRoute: null,
        fromRoute: null,
      });

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.async })(
    "snapshot returns to IDLE after navigation cancel (TRANSITION_CANCEL)",
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

      const source = createTransitionSource(router);

      const cancelTarget =
        routeName === "admin.settings" ? "users.list" : "admin.settings";

      const p1 = router.navigate(routeName, paramsForRoute(routeName));

      await Promise.resolve();

      const p2 = router.navigate(cancelTarget);

      resolveGuard(true);
      await p2;
      await p1.catch(() => {});

      expect(source.getSnapshot()).toStrictEqual({
        isTransitioning: false,
        toRoute: null,
        fromRoute: null,
      });

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbRouteName, arbRouteName], { numRuns: NUM_RUNS.async })(
    "fromRoute at TRANSITION_START matches the prior router state",
    async (firstRoute, secondRoute) => {
      fc.pre(firstRoute !== "home");
      fc.pre(firstRoute !== secondRoute);

      const router = await createStartedRouter();

      await router.navigate(firstRoute, paramsForRoute(firstRoute));

      const lifecycle = getLifecycleApi(router);
      let resolveGuard!: (value: boolean) => void;

      lifecycle.addActivateGuard(secondRoute, () => () => {
        return new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        });
      });

      const source = createTransitionSource(router);

      void router.navigate(secondRoute, paramsForRoute(secondRoute));
      await Promise.resolve();

      expect(source.getSnapshot().fromRoute?.name).toStrictEqual(firstRoute);

      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "all IDLE snapshots are the same object reference (Object.is)",
    async (navSeq) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);
      const initialIdle = source.getSnapshot();

      for (const nav of navSeq) {
        await router.navigate(nav.name, nav.params).catch(() => {});

        expect(Object.is(source.getSnapshot(), initialIdle)).toBe(true);
      }

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.async })(
    "listener is invoked on each transition state change",
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

      const source = createTransitionSource(router);
      const listener = vi.fn();

      source.subscribe(listener);

      void router.navigate(routeName, paramsForRoute(routeName));
      await Promise.resolve();

      expect(listener).toHaveBeenCalledTimes(1);

      resolveGuard(true);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);

      router.stop();
      source.destroy();
    },
  );
});

describe("createTransitionSource — concurrent navigation", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.async })(
    "concurrent cancel: first navigation cancelled, final snapshot is IDLE",
    async (routeName) => {
      fc.pre(routeName !== "home");

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(
        routeName,
        () => (_toState, _fromState, signal) => {
          return new Promise<boolean>((resolve) => {
            if (signal?.aborted) {
              resolve(true);

              return;
            }

            signal?.addEventListener("abort", () => {
              resolve(true);
            });
          });
        },
      );

      const source = createTransitionSource(router);

      const cancelTarget =
        routeName === "admin.settings" ? "users.list" : "admin.settings";

      const p1 = router.navigate(routeName, paramsForRoute(routeName));

      await Promise.resolve();

      expect(source.getSnapshot().toRoute?.name).toStrictEqual(routeName);

      const p2 = router.navigate(cancelTarget);

      await p2;
      await p1.catch(() => {});

      expect(source.getSnapshot()).toStrictEqual({
        isTransitioning: false,
        toRoute: null,
        fromRoute: null,
      });

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "final snapshot is IDLE after all concurrent navigations settle",
    async (navSeq) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);

      const promises = navSeq.map((nav) =>
        router.navigate(nav.name, nav.params).catch(() => {}),
      );

      await Promise.all(promises);

      expect(source.getSnapshot()).toStrictEqual({
        isTransitioning: false,
        toRoute: null,
        fromRoute: null,
      });

      router.stop();
      source.destroy();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.async })(
    "toRoute reflects current navigation target during concurrent transitions",
    async (routeName) => {
      fc.pre(routeName !== "home");

      const router = await createStartedRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(
        routeName,
        () => (_toState, _fromState, signal) => {
          return new Promise<boolean>((resolve) => {
            if (signal?.aborted) {
              resolve(true);

              return;
            }

            signal?.addEventListener("abort", () => {
              resolve(true);
            });
          });
        },
      );

      const source = createTransitionSource(router);

      const p1 = router.navigate(routeName, paramsForRoute(routeName));

      await Promise.resolve();

      const snapshot = source.getSnapshot();

      expect(snapshot.isTransitioning).toBe(true);
      expect(snapshot.toRoute?.name).toStrictEqual(routeName);

      const cancelTarget =
        routeName === "admin.settings" ? "users.list" : "admin.settings";
      const p2 = router.navigate(cancelTarget);

      await p2;
      await p1.catch(() => {});

      expect(source.getSnapshot().isTransitioning).toBe(false);

      router.stop();
      source.destroy();
    },
  );
});

describe("createTransitionSource — destroy", () => {
  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "destroy removes all router event listeners",
    async (navSeq) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);
      const listener = vi.fn();

      source.subscribe(listener);
      source.destroy();

      for (const nav of navSeq) {
        await router.navigate(nav.name, nav.params).catch(() => {});
      }

      expect(listener).not.toHaveBeenCalled();
      expect(source.getSnapshot().isTransitioning).toBe(false);

      router.stop();
    },
  );

  test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
    "destroy is idempotent - N calls do not throw",
    async (destroyCount) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);

      for (let i = 0; i < destroyCount; i++) {
        expect(() => {
          source.destroy();
        }).not.toThrow();
      }

      router.stop();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "post-destroy getSnapshot returns the last snapshot before destroy",
    async (navSeq) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);

      for (const nav of navSeq) {
        await router.navigate(nav.name, nav.params).catch(() => {});
      }

      const lastSnapshot = source.getSnapshot();

      source.destroy();

      expect(source.getSnapshot()).toStrictEqual(lastSnapshot);

      router.stop();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "post-destroy navigation does not update snapshot or throw errors",
    async (navSeq) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);

      source.destroy();

      for (const nav of navSeq) {
        await router.navigate(nav.name, nav.params).catch(() => {});
      }

      expect(source.getSnapshot()).toStrictEqual({
        isTransitioning: false,
        toRoute: null,
        fromRoute: null,
      });

      router.stop();
    },
  );

  test.prop([arbNavigationSeq], { numRuns: NUM_RUNS.standard })(
    "post-destroy subscribe returns no-op unsubscribe, listener not called",
    async (navSeq) => {
      const router = await createStartedRouter();
      const source = createTransitionSource(router);

      source.destroy();

      const listener = vi.fn();
      const unsub = source.subscribe(listener);

      for (const nav of navSeq) {
        await router.navigate(nav.name, nav.params).catch(() => {});
      }

      expect(listener).not.toHaveBeenCalled();

      expect(() => {
        unsub();
      }).not.toThrow();

      router.stop();
    },
  );
});
