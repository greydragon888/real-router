import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import {
  errorCodes,
  events,
  getPluginApi,
  RouterError,
} from "@real-router/core";

import {
  createFixtureRouter,
  createStartedRouter,
  arbNavigableRoute,
  arbIdParam,
  NUM_RUNS,
} from "./helpers";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

describe("pluginApi.buildNavigationState Properties", () => {
  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "path matches buildPath for valid route",
    (params) => {
      const router = createFixtureRouter();
      const pluginApi = getPluginApi(router);

      const state = pluginApi.buildNavigationState("users.view", params);
      const path = router.buildPath("users.view", params);

      expect(state).toBeDefined();
      expect(state!.path).toBe(path);
    },
  );

  it("returns undefined for unknown route", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const state = pluginApi.buildNavigationState("nonexistent", {});

    expect(state).toBeUndefined();
  });

  it("forward resolved: forwardTo route resolves to target", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const state = pluginApi.buildNavigationState("oldUsers", {});

    expect(state).toBeDefined();
    expect(state!.name).toBe("users");
  });
});

describe("pluginApi.addEventListener Properties", () => {
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "TRANSITION_SUCCESS event delivered on navigate",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = createFixtureRouter();
      const pluginApi = getPluginApi(router);
      const listener = vi.fn();

      pluginApi.addEventListener(events.TRANSITION_SUCCESS, listener);

      await router.start("/");
      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      expect(listener).toHaveBeenCalled();

      router.stop();
    },
  );

  it("unsubscribe prevents future event delivery", async () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);
    const listener = vi.fn();

    const unsub = pluginApi.addEventListener(
      events.TRANSITION_SUCCESS,
      listener,
    );

    unsub();

    await router.start("/");
    await router.navigate("admin.settings");

    expect(listener).not.toHaveBeenCalled();

    router.stop();
  });

  it("TRANSITION_START event fires before TRANSITION_SUCCESS", async () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);
    const order: string[] = [];
    let recording = false;

    pluginApi.addEventListener(events.TRANSITION_START, () => {
      if (recording) {
        order.push("start");
      }
    });
    pluginApi.addEventListener(events.TRANSITION_SUCCESS, () => {
      if (recording) {
        order.push("success");
      }
    });

    await router.start("/");

    recording = true;

    await router.navigate("admin.settings");

    expect(order).toStrictEqual(["start", "success"]);

    router.stop();
  });

  it("ROUTER_START and ROUTER_STOP events fire on lifecycle", async () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);
    const startListener = vi.fn();
    const stopListener = vi.fn();

    pluginApi.addEventListener(events.ROUTER_START, startListener);
    pluginApi.addEventListener(events.ROUTER_STOP, stopListener);

    await router.start("/");

    expect(startListener).toHaveBeenCalledTimes(1);

    router.stop();

    expect(stopListener).toHaveBeenCalledTimes(1);
  });
});

describe("pluginApi.addInterceptor Properties", () => {
  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "interceptor wraps buildPath",
    (params) => {
      const router = createFixtureRouter();
      const pluginApi = getPluginApi(router);

      pluginApi.addInterceptor("buildPath", (next, route, routeParams) => {
        return `/prefix${next(route, routeParams)}`;
      });

      const path = router.buildPath("users.view", params);

      expect(path.startsWith("/prefix")).toBe(true);
    },
  );

  it("multiple interceptors execute in LIFO order", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);
    const order: number[] = [];

    pluginApi.addInterceptor("buildPath", (next, route, params) => {
      order.push(1);

      return next(route, params);
    });
    pluginApi.addInterceptor("buildPath", (next, route, params) => {
      order.push(2);

      return next(route, params);
    });

    router.buildPath("home");

    expect(order).toStrictEqual([2, 1]);
  });

  it("unsubscribe removes interceptor", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const unsub = pluginApi.addInterceptor(
      "buildPath",
      (next, route, params) => {
        return `/intercepted${next(route, params)}`;
      },
    );

    expect(router.buildPath("home").startsWith("/intercepted")).toBe(true);

    unsub();

    expect(router.buildPath("home").startsWith("/intercepted")).toBe(false);
  });

  it("addInterceptor on disposed router throws", async () => {
    const router = await createStartedRouter();
    const pluginApi = getPluginApi(router);

    router.dispose();

    expect(() => {
      pluginApi.addInterceptor("buildPath", (next, route, params) =>
        next(route, params),
      );
    }).toThrowError(RouterError);
  });
});

describe("pluginApi.extendRouter Properties", () => {
  it("extension is accessible on router", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const remove = pluginApi.extendRouter({
      myCustom: () => 42,
    });

    expect((router as unknown as Record<string, () => number>).myCustom()).toBe(
      42,
    );

    remove();
  });

  it("conflict with existing property throws PLUGIN_CONFLICT", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    expect(() => {
      pluginApi.extendRouter({ buildPath: () => "/fake" });
    }).toThrowError(
      expect.objectContaining({ code: errorCodes.PLUGIN_CONFLICT }),
    );
  });

  it("cleanup removes extensions", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const remove = pluginApi.extendRouter({
      tempMethod: () => "temp",
    });

    expect(
      (router as unknown as Record<string, unknown>).tempMethod,
    ).toBeDefined();

    remove();

    expect(
      (router as unknown as Record<string, unknown>).tempMethod,
    ).toBeUndefined();
  });

  it("idempotent cleanup: second call is no-op", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const remove = pluginApi.extendRouter({
      ext: () => "value",
    });

    remove();

    expect(() => {
      remove();
    }).not.toThrowError();
  });

  it("extendRouter on disposed router throws", async () => {
    const router = await createStartedRouter();
    const pluginApi = getPluginApi(router);

    router.dispose();

    expect(() => {
      pluginApi.extendRouter({ foo: "bar" });
    }).toThrowError(RouterError);
  });
});

describe("pluginApi.setRootPath / getRootPath Properties", () => {
  it("roundtrip: set then get returns same value", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    pluginApi.setRootPath("/app");

    expect(pluginApi.getRootPath()).toBe("/app");
  });

  it("default rootPath is empty string", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    expect(pluginApi.getRootPath()).toBe("");
  });
});

describe("pluginApi.getOptions Properties", () => {
  it("returns frozen options object", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const options = pluginApi.getOptions();

    expect(Object.isFrozen(options)).toBe(true);
  });

  it("returns same reference on repeated calls", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const options1 = pluginApi.getOptions();
    const options2 = pluginApi.getOptions();

    expect(options1).toBe(options2);
  });
});

describe("pluginApi.matchPath Properties", () => {
  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "matchPath(buildPath(name, params)) finds the route",
    (params) => {
      const router = createFixtureRouter();
      const pluginApi = getPluginApi(router);

      const path = router.buildPath("users.view", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe("users.view");
    },
  );

  it("matchPath returns undefined for unknown path", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const matched = pluginApi.matchPath("/this/does/not/exist");

    expect(matched).toBeUndefined();
  });
});
