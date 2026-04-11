import { test } from "@fast-check/vitest";

import {
  arbSimpleRouteName,
  arbParamValue,
  arbLoaderData,
  createSsrDataRouter,
  NUM_RUNS,
} from "./helpers";

// =============================================================================
// Loader Invocation: called once per start()
// =============================================================================

describe("loader invocation: loader called exactly once per start()", () => {
  test.prop([arbParamValue], { numRuns: NUM_RUNS.standard })(
    "loader fires once when route matches",
    async (id) => {
      let callCount = 0;

      const { router } = createSsrDataRouter({
        "users.profile": async () => {
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
        "users.profile": async () => {
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
        "users.profile": async (params) => {
          receivedParams = { ...params };

          return null;
        },
      });

      await router.start(`/users/${id}`);

      expect(receivedParams).toHaveProperty("id", id);

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
        home: async () => data,
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
        "users.profile": async () => "should-not-load",
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
        "users.profile": async () => ({ id }),
      });

      const state = await router.start(`/users/${id}`);

      expect(state.context.data).toStrictEqual({ id });

      unsubscribe();

      router.stop();
    },
  );
});
