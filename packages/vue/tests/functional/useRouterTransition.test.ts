import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { useRouterTransition } from "../../src/composables/useRouterTransition";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";
import type { RouterTransitionSnapshot } from "@real-router/sources";
import type { ShallowRef } from "vue";

function mountWithRouter(
  router: Router,
  composable: () => ShallowRef<RouterTransitionSnapshot>,
) {
  let result: ShallowRef<RouterTransitionSnapshot>;
  const App = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    },
  });

  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => h(App) }),
    }),
  );

  return {
    get result() {
      return result!;
    },
    wrapper,
  };
}

describe("useRouterTransition", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("isTransitioning === false initially", () => {
    const { result } = mountWithRouter(router, () => useRouterTransition());

    expect(result.value.isTransitioning).toBe(false);
  });

  it("isTransitioning === true upon TRANSITION_START", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const { result } = mountWithRouter(router, () => useRouterTransition());

    void router.navigate("dashboard");
    await Promise.resolve();
    await flushPromises();

    expect(result.value.isTransitioning).toBe(true);

    resolveGuard(true);
    await flushPromises();
  });

  it("isTransitioning === false upon TRANSITION_SUCCESS", async () => {
    const { result } = mountWithRouter(router, () => useRouterTransition());

    await router.navigate("dashboard");
    await flushPromises();

    expect(result.value.isTransitioning).toBe(false);
  });

  it("isTransitioning === false upon TRANSITION_ERROR", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const { result } = mountWithRouter(router, () => useRouterTransition());

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(result.value.isTransitioning).toBe(false);
  });

  it("toRoute and fromRoute === null when no transition", () => {
    const { result } = mountWithRouter(router, () => useRouterTransition());

    expect(result.value.toRoute).toBeNull();
    expect(result.value.fromRoute).toBeNull();
  });

  it("SSR: always returns IDLE_SNAPSHOT", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);

    const { result } = mountWithRouter(freshRouter, () =>
      useRouterTransition(),
    );

    expect(result.value.isTransitioning).toBe(false);
    expect(result.value.toRoute).toBeNull();
    expect(result.value.fromRoute).toBeNull();
  });
});
