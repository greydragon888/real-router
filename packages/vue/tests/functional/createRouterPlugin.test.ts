import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { createApp, defineComponent, h, inject } from "vue";

import { useRoute } from "../../src/composables/useRoute";
import { useRouter } from "../../src/composables/useRouter";
import { RouterKey, NavigatorKey, RouteKey } from "../../src/context";
import { createRouterPlugin } from "../../src/createRouterPlugin";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

describe("createRouterPlugin", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return a Vue plugin with install method", () => {
    const plugin = createRouterPlugin(router);

    expect(plugin).toBeDefined();
    expect(plugin.install).toBeTypeOf("function");
  });

  it("should provide RouterKey", () => {
    let injectedRouter: Router | undefined;

    const TestComponent = defineComponent({
      setup() {
        injectedRouter = inject(RouterKey);

        return () => h("div");
      },
    });

    mount(TestComponent, {
      global: { plugins: [[createRouterPlugin(router)]] },
    });

    expect(injectedRouter).toBe(router);
  });

  it("should provide NavigatorKey", () => {
    let injectedNavigator: unknown;

    const TestComponent = defineComponent({
      setup() {
        injectedNavigator = inject(NavigatorKey);

        return () => h("div");
      },
    });

    mount(TestComponent, {
      global: { plugins: [[createRouterPlugin(router)]] },
    });

    expect(injectedNavigator).toBeDefined();
    expect(injectedNavigator).toHaveProperty("navigate");
  });

  it("should provide RouteKey with reactive route state", () => {
    let routeContext: RouteContext | undefined;

    const TestComponent = defineComponent({
      setup() {
        routeContext = inject(RouteKey);

        return () => h("div");
      },
    });

    void router.start();

    mount(TestComponent, {
      global: { plugins: [[createRouterPlugin(router)]] },
    });

    expect(routeContext).toBeDefined();
    expect(routeContext).toHaveProperty("navigator");
    expect(routeContext).toHaveProperty("route");
    expect(routeContext).toHaveProperty("previousRoute");
    expect(routeContext!.route.value).toBeDefined();
    expect(routeContext!.route.value?.name).toBe("test");
  });

  it("should update route ref on navigation", async () => {
    let routeContext: RouteContext | undefined;

    const TestComponent = defineComponent({
      setup() {
        routeContext = inject(RouteKey);

        return () => h("div");
      },
    });

    void router.start();

    mount(TestComponent, {
      global: { plugins: [[createRouterPlugin(router)]] },
    });

    expect(routeContext!.route.value?.name).toBe("test");

    await router.navigate("home");

    expect(routeContext!.route.value?.name).toBe("home");
    expect(routeContext!.previousRoute.value?.name).toBe("test");
  });

  it("should work with composables (useRouter, useRoute)", () => {
    let capturedRouter: Router | undefined;
    let capturedRoute: unknown;

    const TestComponent = defineComponent({
      setup() {
        capturedRouter = useRouter();
        capturedRoute = useRoute();

        return () => h("div");
      },
    });

    void router.start();

    mount(TestComponent, {
      global: { plugins: [[createRouterPlugin(router)]] },
    });

    expect(capturedRouter).toBe(router);
    expect(capturedRoute).toBeDefined();
  });

  it("should work with app.use() pattern", () => {
    let injectedRouter: Router | undefined;

    const TestComponent = defineComponent({
      setup() {
        injectedRouter = inject(RouterKey);

        return () => h("div");
      },
    });

    const app = createApp(TestComponent);

    app.use(createRouterPlugin(router));
    app.mount(document.createElement("div"));

    expect(injectedRouter).toBe(router);

    app.unmount();
  });
});
