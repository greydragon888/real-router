import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  arbActiveOptions,
  arbDestroyCount,
  arbNavigationSeq,
  arbRouteName,
  createStartedRouter,
  executeNavigations,
  NUM_RUNS,
  paramsForRoute,
} from "./helpers";
import { createActiveRouteSource } from "../../src";

describe("boolean tracking", () => {
  test.prop([arbRouteName, arbActiveOptions], { numRuns: NUM_RUNS.standard })(
    "initial value matches router.isActiveRoute",
    async (routeName, options) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(routeName);
      const strict = options.strict ?? false;
      const ignoreQueryParams = options.ignoreQueryParams ?? true;

      const source = createActiveRouteSource(
        router,
        routeName,
        params,
        options,
      );

      expect(source.getSnapshot()).toStrictEqual(
        router.isActiveRoute(routeName, params, strict, ignoreQueryParams),
      );

      source.destroy();
      router.stop();
    },
  );

  test.prop([arbRouteName, arbNavigationSeq, arbActiveOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "snapshot consistent with router.isActiveRoute after navigations",
    async (routeName, navigations, options) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(routeName);
      const strict = options.strict ?? false;
      const ignoreQueryParams = options.ignoreQueryParams ?? true;

      const source = createActiveRouteSource(
        router,
        routeName,
        params,
        options,
      );

      await executeNavigations(router, navigations).catch(() => undefined);

      expect(source.getSnapshot()).toStrictEqual(
        router.isActiveRoute(routeName, params, strict, ignoreQueryParams),
      );

      source.destroy();
      router.stop();
    },
  );

  test.prop([arbRouteName, arbNavigationSeq, arbActiveOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "listener called only when boolean value changes",
    async (routeName, navigations, options) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(routeName);
      const strict = options.strict ?? false;
      const ignoreQueryParams = options.ignoreQueryParams ?? true;

      const source = createActiveRouteSource(
        router,
        routeName,
        params,
        options,
      );
      const listener = vi.fn();

      source.subscribe(listener);

      let prevValue = source.getSnapshot();
      let expectedCalls = 0;

      for (const nav of navigations) {
        await router.navigate(nav.name, nav.params).catch(() => undefined);
        const newValue = router.isActiveRoute(
          routeName,
          params,
          strict,
          ignoreQueryParams,
        );

        if (newValue !== prevValue) {
          expectedCalls++;
          prevValue = newValue;
        }
      }

      expect(listener).toHaveBeenCalledTimes(expectedCalls);

      source.destroy();
      router.stop();
    },
  );

  test.prop([fc.constantFrom("users.list", "users.view", "users.edit")], {
    numRuns: NUM_RUNS.standard,
  })(
    "strict=false: parent route active when on descendant",
    async (childRoute) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(childRoute);

      await router.navigate(childRoute, params);

      const source = createActiveRouteSource(router, "users", undefined, {
        strict: false,
      });

      expect(source.getSnapshot()).toStrictEqual(true);

      source.destroy();
      router.stop();
    },
  );

  test.prop([fc.constantFrom("users.list", "users.view", "users.edit")], {
    numRuns: NUM_RUNS.standard,
  })(
    "strict=true: parent route inactive when on descendant",
    async (childRoute) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(childRoute);

      await router.navigate(childRoute, params);

      const source = createActiveRouteSource(router, "users", undefined, {
        strict: true,
      });

      expect(source.getSnapshot()).toStrictEqual(false);

      source.destroy();
      router.stop();
    },
  );

  test.prop([arbRouteName, arbNavigationSeq, fc.boolean()], {
    numRuns: NUM_RUNS.standard,
  })(
    "monotonicity: strict=true active implies strict=false active",
    async (routeName, navigations, ignoreQueryParams) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(routeName);

      await executeNavigations(router, navigations).catch(() => undefined);

      const sourceStrict = createActiveRouteSource(router, routeName, params, {
        strict: true,
        ignoreQueryParams,
      });
      const sourceLoose = createActiveRouteSource(router, routeName, params, {
        strict: false,
        ignoreQueryParams,
      });

      if (sourceStrict.getSnapshot()) {
        expect(sourceLoose.getSnapshot()).toStrictEqual(true);
      }

      sourceStrict.destroy();
      sourceLoose.destroy();
      router.stop();
    },
  );
});

describe("areRoutesRelated filter", () => {
  test.prop([arbRouteName, arbNavigationSeq, arbActiveOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "filter is transparent: snapshot matches oracle after every navigation",
    async (routeName, navigations, options) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(routeName);
      const strict = options.strict ?? false;
      const ignoreQueryParams = options.ignoreQueryParams ?? true;

      const source = createActiveRouteSource(
        router,
        routeName,
        params,
        options,
      );

      for (const nav of navigations) {
        await router.navigate(nav.name, nav.params).catch(() => undefined);

        expect(source.getSnapshot()).toStrictEqual(
          router.isActiveRoute(routeName, params, strict, ignoreQueryParams),
        );
      }

      source.destroy();
      router.stop();
    },
  );

  test.prop([fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS.standard })(
    "listener not called for navigations between unrelated routes",
    async (navCount) => {
      const router = await createStartedRouter();

      const source = createActiveRouteSource(router, "admin.dashboard");
      const listener = vi.fn();

      source.subscribe(listener);

      for (let i = 0; i < navCount; i++) {
        await (i % 2 === 0
          ? router.navigate("search", { q: "test", page: "1" })
          : router.navigate("home"));
      }

      expect(listener).toHaveBeenCalledTimes(0);

      source.destroy();
      router.stop();
    },
  );

  test.prop([arbActiveOptions], { numRuns: NUM_RUNS.standard })(
    "listener called when navigating to and from watched route",
    async (options) => {
      const router = await createStartedRouter();

      const source = createActiveRouteSource(
        router,
        "admin.dashboard",
        undefined,
        options,
      );
      const listener = vi.fn();

      source.subscribe(listener);

      const initiallyActive = source.getSnapshot();

      await router.navigate("admin.dashboard");

      const afterEnter = source.getSnapshot();

      if (afterEnter !== initiallyActive) {
        expect(listener).toHaveBeenCalledTimes(1);
      }

      const callsAfterEnter = listener.mock.calls.length;

      await router.navigate("home");

      const afterExit = source.getSnapshot();

      if (afterExit !== afterEnter) {
        expect(listener).toHaveBeenCalledTimes(callsAfterEnter + 1);
      }

      source.destroy();
      router.stop();
    },
  );
});

describe("destroy (cached shared source — no-op)", () => {
  test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
    "destroy is idempotent on cached source",
    async (destroyCount) => {
      const router = await createStartedRouter();

      const source = createActiveRouteSource(router, "admin");

      expect(() => {
        for (let i = 0; i < destroyCount; i++) {
          source.destroy();
        }
      }).not.toThrow();

      router.stop();
    },
  );

  test.prop([arbRouteName, arbActiveOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "post-destroy getSnapshot still returns current value",
    async (routeName, options) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(routeName);

      const source = createActiveRouteSource(
        router,
        routeName,
        params,
        options,
      );

      source.destroy();

      expect(typeof source.getSnapshot()).toBe("boolean");

      router.stop();
    },
  );

  test.prop([arbRouteName, arbActiveOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "post-destroy subscribe still returns a function",
    async (routeName, options) => {
      const router = await createStartedRouter();
      const params = paramsForRoute(routeName);

      const source = createActiveRouteSource(
        router,
        routeName,
        params,
        options,
      );

      source.destroy();

      const listener = vi.fn();
      const unsubscribe = source.subscribe(listener);

      expect(typeof unsubscribe).toBe("function");

      unsubscribe();

      router.stop();
    },
  );
});
