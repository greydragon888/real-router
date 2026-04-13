import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, cloneRouter } from "@real-router/core/api";

import {
  arbSimpleRouteName,
  arbParamValue,
  arbLoaderData,
  createSsrDataRouter,
  NUM_RUNS,
  ROUTES,
} from "./helpers";
import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderFactoryMap } from "../../src";

// =============================================================================
// Loader Invocation: called once per start()
// =============================================================================

describe("loader invocation: loader called exactly once per start()", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader fires once when route matches",
    async (id) => {
      let callCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": () => async () => {
          callCount++;

          return { id };
        },
      });

      await router.start(`/users/${id}`);

      expect(callCount).toBe(1);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "loader not called when no route matches the loader key",
    async (routeName) => {
      let callCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": () => async () => {
          callCount++;

          return "data";
        },
      });

      const pathMap: Record<string, string> = {
        home: "/",
        "users.list": "/users",
      };
      const path = pathMap[routeName] ?? `/${routeName}`;

      await router.start(path);

      expect(callCount).toBe(0);

      router.stop();
    },
  );
});

// =============================================================================
// Loader Arguments: receives correct route params
// =============================================================================

describe("loader arguments: loader receives correct route params", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader params.id matches the navigated path param",
    async (id) => {
      let receivedParams: Record<string, unknown> = {};

      const { router } = createSsrDataRouter({
        "users.profile": () => async (params) => {
          receivedParams = { ...params };

          return null;
        },
      });

      await router.start(`/users/${id}`);

      expect(receivedParams.id).toBe(id);

      router.stop();
    },
  );
});

// =============================================================================
// Data Retrieval: state.context.data returns loader result
// =============================================================================

describe("data retrieval: state.context.data returns loader result after start()", () => {
  test.prop([arbLoaderData], { numRuns: NUM_RUNS.thorough })(
    "state.context.data returns exactly the loader resolved value",
    async (data) => {
      const { router } = createSsrDataRouter({
        home: () => async () => data,
      });

      const state = await router.start("/");

      expect(state.context.data).toStrictEqual(data);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "state.context.data is undefined when route has no loader",
    async (routeName) => {
      // Register loader for a route we won't navigate to
      const { router } = createSsrDataRouter({
        "users.profile": () => async () => "should-not-load",
      });

      const pathMap: Record<string, string> = {
        home: "/",
        "users.list": "/users",
      };
      const path = pathMap[routeName] ?? `/${routeName}`;

      const state = await router.start(path);

      expect(state.context.data).toBeUndefined();

      router.stop();
    },
  );
});

// =============================================================================
// Teardown: unsubscribe releases claim
// =============================================================================

describe("teardown: unsubscribe completes without error", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "unsubscribe after start does not throw",
    async (id) => {
      const { router, unsubscribe } = createSsrDataRouter({
        "users.profile": () => async () => ({ id }),
      });

      const state = await router.start(`/users/${id}`);

      expect(state.context.data).toStrictEqual({ id });

      unsubscribe();

      router.stop();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "double unsubscribe does not throw",
    async (id) => {
      const { router, unsubscribe } = createSsrDataRouter({
        "users.profile": () => async () => ({ id }),
      });

      await router.start(`/users/${id}`);
      unsubscribe();

      expect(() => {
        unsubscribe();
      }).not.toThrow();

      router.stop();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "namespace claim is re-claimable after unsubscribe",
    async (id) => {
      const { router, unsubscribe } = createSsrDataRouter({
        "users.profile": () => async () => ({ id }),
      });

      await router.start(`/users/${id}`);
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("data"),
      ).not.toThrow();

      router.stop();
    },
  );
});

// =============================================================================
// Prototype safety: inherited properties ignored
// =============================================================================

describe("prototype safety: inherited loader keys are not compiled", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "prototype-inherited factory is never called",
    async (paramValue) => {
      let protoCalled = false;
      const proto = {
        "users.profile": () => {
          protoCalled = true;

          return () => Promise.resolve("hacked");
        },
      };
      const loaders = Object.create(proto) as DataLoaderFactoryMap;

      const { router } = createSsrDataRouter(loaders);
      const state = await router.start(`/users/${paramValue}`);

      expect(protoCalled).toBe(false);
      expect(state.context.data).toBeUndefined();

      router.stop();
    },
  );
});

// =============================================================================
// Per-instance isolation: independent data across clones
// =============================================================================

describe("isolation: cloned routers have independent data", () => {
  test.prop([arbParamValue, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "two clones with same factory produce independent data",
    async (id1, id2) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const loaders: DataLoaderFactoryMap = {
        "users.profile": () => async (params) => ({ userId: params.id }),
      };

      const clone1 = cloneRouter(base);

      clone1.usePlugin(ssrDataPluginFactory(loaders));
      const state1 = await clone1.start(`/users/${id1}`);

      const clone2 = cloneRouter(base);

      clone2.usePlugin(ssrDataPluginFactory(loaders));
      const state2 = await clone2.start(`/users/${id2}`);

      expect(state1.context.data).toStrictEqual({ userId: id1 });
      expect(state2.context.data).toStrictEqual({ userId: id2 });

      clone1.dispose();
      clone2.dispose();
    },
  );
});

// =============================================================================
// Factory invocation: factory called once per usePlugin, not per start
// =============================================================================

describe("factory invocation: factory called exactly once per usePlugin", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "factory function executes once regardless of start count",
    async (id) => {
      let factoryCallCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": () => {
          factoryCallCount++;

          return async () => ({ id });
        },
      });

      await router.start(`/users/${id}`);

      expect(factoryCallCount).toBe(1);

      router.stop();
    },
  );
});

// =============================================================================
// Validation: rejects invalid loaders
// =============================================================================

describe("validation: non-object inputs rejected", () => {
  const arbNonObject = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.string(),
    fc.integer(),
    fc.boolean(),
  );

  test.prop([arbNonObject], { numRuns: NUM_RUNS.standard })(
    "non-object input throws TypeError",
    (input) => {
      expect(() =>
        ssrDataPluginFactory(input as unknown as DataLoaderFactoryMap),
      ).toThrow(TypeError);
    },
  );
});

describe("validation: non-function loader values rejected", () => {
  const arbNonFunctionValue = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  );

  test.prop([fc.string({ minLength: 1, maxLength: 10 }), arbNonFunctionValue], {
    numRuns: NUM_RUNS.standard,
  })("object with non-function value throws TypeError", (key, value) => {
    expect(() =>
      ssrDataPluginFactory({ [key]: value } as unknown as DataLoaderFactoryMap),
    ).toThrow(TypeError);
  });
});
