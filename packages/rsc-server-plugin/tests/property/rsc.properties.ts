import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, cloneRouter } from "@real-router/core/api";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

import {
  arbSimpleRouteName,
  arbParamValue,
  arbReactNode,
  createRscRouter,
  node,
  NUM_RUNS,
  ROUTES,
} from "./helpers";
import { getSsrRscMode, rscServerPluginFactory } from "../../src";

import type { RscLoaderFactoryMap, RscSsrMode } from "../../src";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

const arbRscSsrMode: fc.Arbitrary<RscSsrMode> = fc.constantFrom<RscSsrMode>(
  "full",
  "client-only",
);

// =============================================================================
// Loader Invocation: called once per start()
// =============================================================================

describe("loader invocation: loader called exactly once per start()", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader fires once when route matches",
    async (id) => {
      let callCount = 0;

      const { router } = createRscRouter({
        "users.profile": () => async () => {
          callCount++;

          return node("Profile", { id });
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

      const { router } = createRscRouter({
        "users.profile": () => async () => {
          callCount++;

          return node("Profile");
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

      const { router } = createRscRouter({
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
// Data Retrieval: state.context.rsc returns loader result
// =============================================================================

describe("data retrieval: state.context.rsc returns loader result after start()", () => {
  test.prop([arbReactNode], { numRuns: NUM_RUNS.thorough })(
    "state.context.rsc returns exactly the loader resolved value",
    async (rsc) => {
      const { router } = createRscRouter({
        home: () => async () => rsc,
      });

      const state = await router.start("/");

      expect(state.context.rsc).toStrictEqual(rsc);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "state.context.rsc is undefined when route has no loader",
    async (routeName) => {
      const { router } = createRscRouter({
        "users.profile": () => async () => node("Should-not-load"),
      });

      const pathMap: Record<string, string> = {
        home: "/",
        "users.list": "/users",
      };
      const path = pathMap[routeName] ?? `/${routeName}`;

      const state = await router.start(path);

      expect(state.context.rsc).toBeUndefined();

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
      const { router, unsubscribe } = createRscRouter({
        "users.profile": () => async () => node("Profile", { id }),
      });

      const state = await router.start(`/users/${id}`);

      expect(state.context.rsc).toStrictEqual(node("Profile", { id }));

      unsubscribe();

      router.stop();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "double unsubscribe does not throw",
    async (id) => {
      const { router, unsubscribe } = createRscRouter({
        "users.profile": () => async () => node("Profile", { id }),
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
      const { router, unsubscribe } = createRscRouter({
        "users.profile": () => async () => node("Profile", { id }),
      });

      await router.start(`/users/${id}`);
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
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

          return () => Promise.resolve(node("Hacked"));
        },
      };
      const loaders = Object.create(proto) as RscLoaderFactoryMap;

      const { router } = createRscRouter(loaders);
      const state = await router.start(`/users/${paramValue}`);

      expect(protoCalled).toBe(false);
      expect(state.context.rsc).toBeUndefined();

      router.stop();
    },
  );
});

// =============================================================================
// Per-instance isolation: independent rsc across clones
// =============================================================================

describe("isolation: cloned routers have independent rsc payloads", () => {
  test.prop([arbParamValue, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "two clones with same factory produce independent rsc",
    async (id1, id2) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const loaders: RscLoaderFactoryMap = {
        "users.profile": () => async (params) =>
          node("Profile", { userId: params.id }),
      };

      const clone1 = cloneRouter(base);

      clone1.usePlugin(rscServerPluginFactory(loaders));
      const state1 = await clone1.start(`/users/${id1}`);

      const clone2 = cloneRouter(base);

      clone2.usePlugin(rscServerPluginFactory(loaders));
      const state2 = await clone2.start(`/users/${id2}`);

      expect(state1.context.rsc).toStrictEqual(
        node("Profile", { userId: id1 }),
      );
      expect(state2.context.rsc).toStrictEqual(
        node("Profile", { userId: id2 }),
      );

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

      const { router } = createRscRouter({
        "users.profile": () => {
          factoryCallCount++;

          return async () => node("Profile", { id });
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
        rscServerPluginFactory(input as unknown as RscLoaderFactoryMap),
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
      rscServerPluginFactory({
        [key]: value,
      } as unknown as RscLoaderFactoryMap),
    ).toThrow(TypeError);
  });
});

// =============================================================================
// Composition: rsc-server-plugin + ssr-data-plugin coexist on the same router
// =============================================================================
//
// Invariant 14: registering both plugins on a single router populates
// `state.context.rsc` (ReactNode) and `state.context.data` (JSON) independently
// for the same `start()` call. The two namespace claims are distinct (`"rsc"` vs
// `"data"`) so the core's `claimContextNamespace` collision detector permits
// concurrent ownership. Verifies that:
//
//   - rsc loader runs and writes `state.context.rsc`
//   - data loader runs and writes `state.context.data`
//   - neither loader sees the other's namespace mutation
//   - neither plugin's teardown affects the other's claim
//
// This is the canonical use-case for SSR + RSC apps that ship both
// HTML-bound JSON state (e.g. user preferences) AND a Server Component tree.

describe("composition: rsc-server-plugin + ssr-data-plugin coexist", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "both namespaces populate independently for the same start()",
    async (id) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const router = cloneRouter(base);

      const rscLoaders: RscLoaderFactoryMap = {
        "users.profile": () => async (params) =>
          node("Profile", { userId: params.id }),
      };
      const dataLoaders: DataLoaderFactoryMap = {
        "users.profile": () => async (params) => ({
          jsonId: params.id,
          source: "ssr-data",
        }),
      };

      const unsubRsc = router.usePlugin(rscServerPluginFactory(rscLoaders));
      const unsubData = router.usePlugin(ssrDataPluginFactory(dataLoaders));

      const state = await router.start(`/users/${id}`);

      expect(state.context.rsc).toStrictEqual(node("Profile", { userId: id }));
      expect(state.context.data).toStrictEqual({
        jsonId: id,
        source: "ssr-data",
      });

      unsubRsc();
      unsubData();
      router.dispose();
    },
  );

  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "tearing down one plugin leaves the other's namespace re-claimable but does not break it",
    async (id) => {
      const base = createRouter(ROUTES, { defaultRoute: "home" });
      const router = cloneRouter(base);

      const rscLoaders: RscLoaderFactoryMap = {
        "users.profile": () => async (params) =>
          node("Profile", { userId: params.id }),
      };
      const dataLoaders: DataLoaderFactoryMap = {
        "users.profile": () => async (params) => ({ jsonId: params.id }),
      };

      const unsubRsc = router.usePlugin(rscServerPluginFactory(rscLoaders));

      router.usePlugin(ssrDataPluginFactory(dataLoaders));

      // Tear down the rsc plugin only.
      unsubRsc();

      // ssr-data-plugin's "data" claim must remain held — confirm by
      // (a) running a fresh start() and seeing data populate
      // (b) verifying that re-claiming "rsc" is allowed (rsc plugin teardown freed it),
      //     while re-claiming "data" still throws (ssr-data-plugin still holds it).
      const state = await router.start(`/users/${id}`);

      expect(state.context.rsc).toBeUndefined();
      expect(state.context.data).toStrictEqual({ jsonId: id });

      const api = getPluginApi(router);

      expect(() => api.claimContextNamespace("rsc")).not.toThrow();
      expect(() => api.claimContextNamespace("data")).toThrow();

      router.dispose();
    },
  );
});

// =============================================================================
// SSR Mode invariants (RSC: only "full" | "client-only" allowed)
// =============================================================================

describe("ssr mode: getSsrRscMode reflects the resolved mode", () => {
  test.prop([arbRscSsrMode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "string-form ssr → getSsrRscMode returns the same mode",
    async (mode, id) => {
      const { router } = createRscRouter({
        "users.profile": {
          ssr: mode,
          loader: () => () => node("Profile", { id }),
        },
      });

      const state = await router.start(`/users/${id}`);

      expect(getSsrRscMode(state)).toBe(mode);

      router.stop();
    },
  );
});

describe("ssr mode: client-only skips the loader", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader is never invoked when mode='client-only'",
    async (id) => {
      let callCount = 0;

      const { router } = createRscRouter({
        "users.profile": {
          ssr: "client-only",
          loader: () => () => {
            callCount++;

            return node("WontRun");
          },
        },
      });

      const state = await router.start(`/users/${id}`);

      expect(callCount).toBe(0);
      expect(state.context.rsc).toBeUndefined();
      expect(getSsrRscMode(state)).toBe("client-only");

      router.stop();
    },
  );
});

describe("ssr mode: function-form resolver runs once per start()", () => {
  test.prop([arbRscSsrMode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "resolver invoked exactly once with the resolved state",
    async (mode, id) => {
      let resolverCalls = 0;

      const { router } = createRscRouter({
        "users.profile": {
          ssr: () => {
            resolverCalls++;

            return mode;
          },
          loader: () => () => node("Profile", { id }),
        },
      });

      await router.start(`/users/${id}`);

      expect(resolverCalls).toBe(1);

      router.stop();
    },
  );
});

describe("ssr mode: short form === { loader }", () => {
  test.prop([arbReactNode, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "short-form factory and { loader: factory } produce identical rsc + mode='full'",
    async (payload, id) => {
      const baseShort = createRouter(ROUTES, { defaultRoute: "home" });
      const baseObject = createRouter(ROUTES, { defaultRoute: "home" });

      baseShort.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => () => payload,
        }),
      );

      baseObject.usePlugin(
        rscServerPluginFactory({
          "users.profile": { loader: () => () => payload },
        }),
      );

      const stateShort = await baseShort.start(`/users/${id}`);
      const stateObject = await baseObject.start(`/users/${id}`);

      expect(stateShort.context.rsc).toStrictEqual(stateObject.context.rsc);
      expect(getSsrRscMode(stateShort)).toBe("full");
      expect(getSsrRscMode(stateObject)).toBe("full");

      baseShort.stop();
      baseObject.stop();
    },
  );
});
