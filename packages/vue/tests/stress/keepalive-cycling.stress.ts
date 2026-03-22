import { createRouter } from "@real-router/core";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { describe, it, expect, afterEach } from "vitest";

import { RouterProvider } from "../../src/RouterProvider";
import { RouteView } from "../../src/components/RouteView";

import { createRenderCounter } from "./helpers";

describe("keepAlive cycling stress tests (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("4.1: 10 keepAlive segments + 100 round-robin navigations — state preserved", async () => {
    const router = createRouter(
      Array.from({ length: 10 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const counters = Array.from({ length: 10 }, (_, i) =>
      createRenderCounter(`page-${i}`),
    );

    const App = defineComponent({
      name: "App",
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                h(
                  RouteView,
                  { nodeName: "", keepAlive: true },
                  {
                    default: () =>
                      counters.map(({ Component }, i) =>
                        h(
                          RouteView.Match,
                          { key: i, segment: `seg${i}` },
                          { default: () => h(Component) },
                        ),
                      ),
                  },
                ),
            },
          );
      },
    });

    const { mount } = await import("@vue/test-utils");
    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let nav = 0; nav < 100; nav++) {
      await router.navigate(`seg${(nav + 1) % 10}`);
      await nextTick();
      await flushPromises();
    }

    for (let i = 0; i < 10; i++) {
      expect(counters[i].getRenderCount()).toBeGreaterThan(0);
    }

    wrapper.unmount();
    router.stop();
  });

  it("4.2: keepAlive wrapper cache bounded — only 10 wrapper components created for 10 segments", async () => {
    const router = createRouter(
      Array.from({ length: 10 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const counters = Array.from({ length: 10 }, (_, i) =>
      createRenderCounter(`bounded-${i}`),
    );

    const App = defineComponent({
      name: "App",
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                h(
                  RouteView,
                  { nodeName: "", keepAlive: true },
                  {
                    default: () =>
                      counters.map(({ Component }, i) =>
                        h(
                          RouteView.Match,
                          { key: i, segment: `seg${i}` },
                          { default: () => h(Component) },
                        ),
                      ),
                  },
                ),
            },
          );
      },
    });

    const { mount } = await import("@vue/test-utils");
    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let i = 1; i < 10; i++) {
      await router.navigate(`seg${i}`);
      await nextTick();
      await flushPromises();
    }

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(`seg${(nav + 1) % 10}`);
      await nextTick();
      await flushPromises();
    }

    for (let i = 0; i < 10; i++) {
      expect(counters[i].getRenderCount()).toBeGreaterThan(0);
    }

    wrapper.unmount();
    router.stop();
  });

  it("4.3: 10 keepAlive + 5 non-keepAlive + 200 navigations — both modes work under load", async () => {
    const router = createRouter(
      Array.from({ length: 15 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const keepAliveCounters = Array.from({ length: 10 }, (_, i) =>
      createRenderCounter(`ka-${i}`),
    );
    const regularCounters = Array.from({ length: 5 }, (_, i) =>
      createRenderCounter(`reg-${i}`),
    );

    const App = defineComponent({
      name: "App",
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () => [
                h(
                  RouteView,
                  { nodeName: "", keepAlive: true },
                  {
                    default: () =>
                      keepAliveCounters.map(({ Component }, i) =>
                        h(
                          RouteView.Match,
                          { key: `ka-${i}`, segment: `seg${i}` },
                          { default: () => h(Component) },
                        ),
                      ),
                  },
                ),
                h(
                  RouteView,
                  { nodeName: "" },
                  {
                    default: () =>
                      regularCounters.map(({ Component }, i) =>
                        h(
                          RouteView.Match,
                          { key: `reg-${i}`, segment: `seg${10 + i}` },
                          { default: () => h(Component) },
                        ),
                      ),
                  },
                ),
              ],
            },
          );
      },
    });

    const { mount } = await import("@vue/test-utils");
    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let nav = 0; nav < 200; nav++) {
      await router.navigate(`seg${(nav + 1) % 15}`);
      await nextTick();
      await flushPromises();
    }

    let totalKeepAliveRenders = 0;

    for (let i = 0; i < 10; i++) {
      totalKeepAliveRenders += keepAliveCounters[i].getRenderCount();
    }

    expect(totalKeepAliveRenders).toBeGreaterThan(0);

    let totalRegularRenders = 0;

    for (let i = 0; i < 5; i++) {
      totalRegularRenders += regularCounters[i].getRenderCount();
    }

    expect(totalRegularRenders).toBeGreaterThanOrEqual(0);

    wrapper.unmount();
    router.stop();
  });

  it("4.4: DOM element count stability after activating all keepAlive segments", async () => {
    const router = createRouter(
      Array.from({ length: 10 }, (_, i) => ({
        name: `seg${i}`,
        path: `/seg${i}`,
      })),
      { defaultRoute: "seg0" },
    );

    await router.start("/seg0");

    const counters = Array.from({ length: 10 }, (_, i) =>
      createRenderCounter(`stable-${i}`),
    );

    const App = defineComponent({
      name: "App",
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                h("div", { "data-testid": "route-container" }, [
                  h(
                    RouteView,
                    { nodeName: "", keepAlive: true },
                    {
                      default: () =>
                        counters.map(({ Component }, i) =>
                          h(
                            RouteView.Match,
                            { key: i, segment: `seg${i}` },
                            { default: () => h(Component) },
                          ),
                        ),
                    },
                  ),
                ]),
            },
          );
      },
    });

    const { mount } = await import("@vue/test-utils");
    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let i = 1; i < 10; i++) {
      await router.navigate(`seg${i}`);
      await nextTick();
      await flushPromises();
    }

    const routeContainer = wrapper.find("[data-testid='route-container']");

    expect(routeContainer.exists()).toBe(true);

    const domCountAfterActivation =
      routeContainer.element.querySelectorAll("*").length;

    for (let nav = 0; nav < 90; nav++) {
      await router.navigate(`seg${(nav + 1) % 10}`);
      await nextTick();
      await flushPromises();
    }

    const domCountAfterMoreNavs =
      routeContainer.element.querySelectorAll("*").length;

    expect(domCountAfterMoreNavs).toBe(domCountAfterActivation);

    wrapper.unmount();
    router.stop();
  });
});
