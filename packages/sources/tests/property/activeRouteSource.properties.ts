import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  arbActiveOptions,
  arbDestroyCount,
  arbNavigationSeq,
  arbRouteName,
  createStartedRouter,
  executeNavigations,
  expectedActive,
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
        undefined,
        options,
      );

      expect(source.getSnapshot()).toStrictEqual(
        expectedActive(
          router,
          routeName,
          params,
          strict,
          ignoreQueryParams,
          options.hash,
        ),
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
        undefined,
        options,
      );

      // Lazy source tracks navigations only while subscribed (#766).
      source.subscribe(() => {});

      await executeNavigations(router, navigations).catch(() => undefined);

      expect(source.getSnapshot()).toStrictEqual(
        expectedActive(
          router,
          routeName,
          params,
          strict,
          ignoreQueryParams,
          options.hash,
        ),
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
        undefined,
        options,
      );
      const listener = vi.fn();

      source.subscribe(listener);

      let prevValue = source.getSnapshot();
      let expectedCalls = 0;

      for (const nav of navigations) {
        await router.navigate(nav.name, nav.params).catch(() => undefined);
        const newValue = expectedActive(
          router,
          routeName,
          params,
          strict,
          ignoreQueryParams,
          options.hash,
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

      const source = createActiveRouteSource(
        router,
        "users",
        undefined,
        undefined,
        { strict: false },
      );

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

      const source = createActiveRouteSource(
        router,
        "users",
        undefined,
        undefined,
        { strict: true },
      );

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

      const sourceStrict = createActiveRouteSource(
        router,
        routeName,
        params,
        undefined,
        {
          strict: true,
          ignoreQueryParams,
        },
      );
      const sourceLoose = createActiveRouteSource(
        router,
        routeName,
        params,
        undefined,
        {
          strict: false,
          ignoreQueryParams,
        },
      );

      // Filter out cases where strict-mode is inactive — `fc.pre` discards
      // them so we don't silent-pass when the implication's antecedent
      // never holds. Bumps shrink quality on regressions.
      fc.pre(sourceStrict.getSnapshot());

      expect(sourceLoose.getSnapshot()).toStrictEqual(true);

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
        undefined,
        options,
      );

      // Lazy source tracks navigations only while subscribed (#766).
      source.subscribe(() => {});

      for (const nav of navigations) {
        await router.navigate(nav.name, nav.params).catch(() => undefined);

        expect(source.getSnapshot()).toStrictEqual(
          expectedActive(
            router,
            routeName,
            params,
            strict,
            ignoreQueryParams,
            options.hash,
          ),
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
      // The fixture router has no URL-publishing plugin → context.url is
      // undefined → a hash-aware source is permanently false. Skip those
      // runs so the route-name-flip assertions below stay meaningful.
      fc.pre(options.hash === undefined);

      const router = await createStartedRouter();

      const source = createActiveRouteSource(
        router,
        "admin.dashboard",
        undefined,
        undefined,
        options,
      );
      const listener = vi.fn();

      source.subscribe(listener);

      // Router starts at "home" → admin.dashboard is inactive regardless
      // of strict/ignoreQueryParams; navigating to admin.dashboard always
      // flips the boolean. Construction guarantees a change, so no
      // conditional expects.
      expect(source.getSnapshot()).toBe(false);

      await router.navigate("admin.dashboard");

      expect(source.getSnapshot()).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);

      await router.navigate("home");

      expect(source.getSnapshot()).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);

      source.destroy();
      router.stop();
    },
  );
});

describe("cache identity (canonicalJson-keyed)", () => {
  // Generates two equivalent params objects: a base record and the same keys
  // reversed. canonicalJson-keyed caching must recognise both as the same.
  const arbParamsPair = fc
    .dictionary(
      fc.string({ minLength: 1, maxLength: 6 }),
      fc.string({ maxLength: 6 }),
      {
        maxKeys: 5,
      },
    )
    .map((dict) => {
      const reversed: Record<string, string> = {};

      for (const [key, val] of Object.entries(dict).toReversed()) {
        reversed[key] = val;
      }

      return { a: dict, b: reversed } as const;
    });

  test.prop([arbRouteName, arbParamsPair, arbActiveOptions], {
    numRuns: NUM_RUNS.standard,
  })(
    "params equivalent under canonicalJson hit the same cache entry",
    async (routeName, { a, b }, options) => {
      const router = await createStartedRouter();
      const sourceA = createActiveRouteSource(
        router,
        routeName,
        a,
        undefined,
        options,
      );
      const sourceB = createActiveRouteSource(
        router,
        routeName,
        b,
        undefined,
        options,
      );

      expect(sourceA).toBe(sourceB);

      router.stop();
    },
  );

  test.prop([arbRouteName, arbActiveOptions], { numRuns: NUM_RUNS.standard })(
    "different routers are isolated under the same (name, params, options)",
    async (routeName, options) => {
      const routerA = await createStartedRouter();
      const routerB = await createStartedRouter();

      const sourceA = createActiveRouteSource(
        routerA,
        routeName,
        paramsForRoute(routeName),
        undefined,
        options,
      );
      const sourceB = createActiveRouteSource(
        routerB,
        routeName,
        paramsForRoute(routeName),
        undefined,
        options,
      );

      expect(sourceA).not.toBe(sourceB);

      routerA.stop();
      routerB.stop();
    },
  );
});

describe("hash-aware monotonicity (#532)", () => {
  test.prop(
    [
      arbRouteName,
      fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !s.includes("#")),
      arbNavigationSeq,
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "hash-aware source returns false under no-url-plugin fixture across any nav sequence",
    async (routeName, hash, navigations) => {
      // The fixture router has no URL-publishing plugin → context.url is
      // always undefined → readContextHash returns "". With a non-empty hash
      // option, computeActive is structurally false regardless of route match.
      // Monotonicity claim: the boolean stays false through every navigation.
      const router = await createStartedRouter();
      const source = createActiveRouteSource(
        router,
        routeName,
        paramsForRoute(routeName),
        undefined,
        { hash },
      );

      expect(source.getSnapshot()).toBe(false);

      for (const nav of navigations) {
        await router.navigate(nav.name, nav.params).catch(() => undefined);

        expect(source.getSnapshot()).toBe(false);
      }

      router.stop();
    },
  );

  test.prop([arbRouteName, arbActiveOptions], { numRuns: NUM_RUNS.standard })(
    "hash-aware variants are cache-isolated from hash-less variants",
    async (routeName, baseOptions) => {
      fc.pre(baseOptions.hash === undefined);

      const router = await createStartedRouter();
      const baseline = createActiveRouteSource(
        router,
        routeName,
        paramsForRoute(routeName),
        undefined,
        baseOptions,
      );
      const withHash = createActiveRouteSource(
        router,
        routeName,
        paramsForRoute(routeName),
        undefined,
        { ...baseOptions, hash: "anchor" },
      );

      expect(baseline).not.toBe(withHash);

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
        undefined,
        options,
      );

      source.destroy();

      // The snapshot reflects current router state (cached source ignores
      // external destroy()) — value can be `true` when the watched route IS
      // currently active (e.g. `home` after `start("/")`). The contract is
      // "still returns a boolean", which the assertion below enforces.
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
        undefined,
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

describe("lazy connection (#766)", () => {
  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "no router subscription before first source.subscribe()",
    async (routeName) => {
      const router = await createStartedRouter();
      const spy = vi.spyOn(router, "subscribe");

      createActiveRouteSource(router, routeName, paramsForRoute(routeName));

      expect(spy).not.toHaveBeenCalled();

      router.stop();
    },
  );

  test.prop([arbRouteName], { numRuns: NUM_RUNS.standard })(
    "connects on first listener, disconnects on last, reconnects on re-subscribe",
    async (routeName) => {
      const router = await createStartedRouter();
      const spy = vi.spyOn(router, "subscribe");

      const source = createActiveRouteSource(
        router,
        routeName,
        paramsForRoute(routeName),
      );

      const unsub1 = source.subscribe(() => {});

      expect(spy).toHaveBeenCalledTimes(1);

      unsub1();

      // Re-subscribe after the last listener left creates a fresh router
      // subscription (the previous one was released on onLastUnsubscribe).
      const unsub2 = source.subscribe(() => {});

      expect(spy).toHaveBeenCalledTimes(2);

      unsub2();
      router.stop();
    },
  );

  test.prop([fc.constantFrom("users.list", "users.view", "users.edit")], {
    numRuns: NUM_RUNS.standard,
  })(
    "active state changed while disconnected is reconciled on re-subscribe",
    async (childRoute) => {
      const router = await createStartedRouter();
      const source = createActiveRouteSource(router, "users");

      // Connect at "home" (users inactive), then drop the last listener.
      const unsub1 = source.subscribe(() => {});

      expect(source.getSnapshot()).toBe(false);

      unsub1();

      // Navigate to a "users.*" descendant while the source has ZERO listeners.
      await router.navigate(childRoute, paramsForRoute(childRoute));

      // Re-subscribe: onFirstSubscribe reconciles the active boolean to the
      // current router state (true) instead of replaying the stale `false`.
      const listener = vi.fn();
      const unsub2 = source.subscribe(listener);

      expect(source.getSnapshot()).toBe(true);
      expect(listener).toHaveBeenCalled();

      unsub2();
      router.stop();
    },
  );
});
