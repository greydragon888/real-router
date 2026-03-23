import { createRouter } from "@real-router/core";
import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import {
  createStressRouter,
  mountWithProvider,
  createRenderCounter,
} from "./helpers";
import { Link } from "../../src/components/Link";
import { RouteView } from "../../src/components/RouteView";
import { useRouteNode } from "../../src/composables/useRouteNode";
import { useRouterTransition } from "../../src/composables/useRouterTransition";
import { RouterProvider } from "../../src/RouterProvider";

describe("combined SPA simulation (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("8.1: full app — 5 RouteView + 30 Links + 10 useRouteNode + 200 navigations", async () => {
    const routes = Array.from({ length: 5 }, (_, i) => ({
      name: `page${i}`,
      path: `/page${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "page0" });

    await router.start("/page0");

    const sidebarRenders = Array.from<number>({ length: 10 }).fill(0);

    const sidebarSubs = Array.from({ length: 10 }, (_, i) => {
      const nodeName = i < 5 ? `page${i}` : "";

      return defineComponent({
        name: `SidebarSub${i}`,
        setup() {
          const { route } = useRouteNode(nodeName);

          return () => {
            if (route.value) {
              sidebarRenders[i]++;
            }

            return null;
          };
        },
      });
    });

    const { mount } = await import("@vue/test-utils");

    const navLinks = Array.from({ length: 30 }, (_, i) => {
      const routeName = `page${i % 5}`;

      return h(Link, { key: i, routeName }, { default: () => `Link ${i}` });
    });

    const routeMatches = routes.map((r) =>
      h(
        RouteView.Match,
        { key: r.name, segment: r.name },
        {
          default: () => h("div", { "data-testid": r.name }, r.name),
        },
      ),
    );

    const sidebarElements = sidebarSubs.map((Sub, i) =>
      h(Sub, { key: `sidebar-${i}` }),
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
                h("nav", navLinks),
                h("main", [
                  h(
                    RouteView,
                    { nodeName: "" },
                    {
                      default: () => routeMatches,
                    },
                  ),
                ]),
                ...sidebarElements,
              ],
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let nav = 0; nav < 200; nav++) {
      await router.navigate(`page${(nav + 1) % 5}`);
      await nextTick();
      await flushPromises();
    }

    expect(router.getState()?.name).toBe(`page${200 % 5}`);

    for (let i = 5; i < 10; i++) {
      expect(sidebarRenders[i]).toBeGreaterThanOrEqual(200);
    }

    wrapper.unmount();
    router.stop();
  });

  it("8.2: nav menu — 50 Links + transition progress + 100 navigations", async () => {
    const routes = Array.from({ length: 50 }, (_, i) => ({
      name: `item${i}`,
      path: `/item${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "item0" });

    await router.start("/item0");

    let progressRenders = 0;

    const Progress = defineComponent({
      name: "Progress",
      setup() {
        const transition = useRouterTransition();

        return () => {
          // Ensure reactivity by accessing transition.value
          Boolean(transition.value);
          progressRenders++;

          return null;
        };
      },
    });

    const { mount } = await import("@vue/test-utils");

    const navLinks2 = routes.map((r, i) => {
      const routeName = r.name;

      return h(Link, { key: i, routeName }, { default: () => r.name });
    });

    const App = defineComponent({
      name: "App",
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () => [h(Progress), h("nav", navLinks2)],
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    const afterMount = progressRenders;

    for (let nav = 0; nav < 100; nav++) {
      await router.navigate(`item${(nav % 49) + 1}`);
      await nextTick();
      await flushPromises();
    }

    expect(progressRenders - afterMount).toBeGreaterThanOrEqual(100);

    wrapper.unmount();
    router.stop();
  });

  it("8.3: tab layout — 5 keepAlive tabs + 30 Links + 200 navigations", async () => {
    const routes = Array.from({ length: 5 }, (_, i) => ({
      name: `tab${i}`,
      path: `/tab${i}`,
    }));
    const router = createRouter(routes, { defaultRoute: "tab0" });

    await router.start("/tab0");

    const tabCounters = Array.from({ length: 5 }, (_, i) =>
      createRenderCounter(`tab-${i}`),
    );

    const tabNavLinks = Array.from({ length: 30 }, (_, i) =>
      h(
        Link,
        { key: i, routeName: `tab${i % 5}` },
        { default: () => `Tab ${i}` },
      ),
    );

    const tabMatches = tabCounters.map(({ Component }, i) => {
      const segment = `tab${i}`;

      return h(
        RouteView.Match,
        { key: i, segment },
        { default: () => h(Component) },
      );
    });

    const { mount } = await import("@vue/test-utils");

    const App = defineComponent({
      name: "App",
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () => [
                h("nav", tabNavLinks),
                h(
                  RouteView,
                  { nodeName: "", keepAlive: true },
                  {
                    default: () => tabMatches,
                  },
                ),
              ],
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let nav = 0; nav < 200; nav++) {
      await router.navigate(`tab${(nav + 1) % 5}`);
      await nextTick();
      await flushPromises();
    }

    for (let i = 0; i < 5; i++) {
      expect(tabCounters[i].getRenderCount()).toBeGreaterThan(0);
    }

    wrapper.unmount();
    router.stop();
  });

  it("8.4: mount → 50 nav → unmount → remount → 50 nav — correct after remount", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    let renderCount = 0;

    const App = defineComponent({
      name: "App",
      setup() {
        useRouteNode("");

        return () => {
          renderCount++;

          return null;
        };
      },
    });

    const wrapper = mountWithProvider(router, () => h(App));

    for (let i = 0; i < 50; i++) {
      await router.navigate(`route${(i % 49) + 1}`);
      await nextTick();
      await flushPromises();
    }

    const countAfterFirst = renderCount;

    expect(countAfterFirst).toBeGreaterThan(0);

    wrapper.unmount();

    renderCount = 0;

    const wrapper2 = mountWithProvider(router, () => h(App));

    for (let i = 0; i < 50; i++) {
      await router.navigate(`route${((i + 1) % 49) + 1}`);
      await nextTick();
      await flushPromises();
    }

    expect(renderCount).toBeGreaterThan(0);
    expect(router.getState()?.name).toBeDefined();

    wrapper2.unmount();
    router.stop();
  });
});
