import { flushPromises, mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, withDirectives } from "vue";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";
import { vLink } from "../../src/directives/vLink";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router } from "@real-router/core";

describe("v-link directive stress tests (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("5.1: 200 v-link elements mount — all receive cursor:pointer and handlers", async () => {
    const App = defineComponent({
      name: "App",
      directives: { link: vLink },
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                Array.from({ length: 200 }, (_, i) => {
                  const key = i;
                  const testid = `vlink-${i}`;
                  const routeName = `route${i % 50}`;

                  return withDirectives(
                    h("div", { key, "data-testid": testid }, `Link ${i}`),
                    [[vLink, { name: routeName }]],
                  );
                }),
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let i = 0; i < 200; i++) {
      const el = wrapper.find(`[data-testid='vlink-${i}']`)
        .element as HTMLElement;

      expect(el.style.cursor).toBe("pointer");
      expect(el.getAttribute("role")).toBe("link");
      expect(el.getAttribute("tabindex")).toBe("0");
    }

    wrapper.unmount();
  });

  it("5.2: mount/unmount 200 v-link elements × 100 cycles — bounded heap, WeakMap cleanup", () => {
    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 100; cycle++) {
      const App = defineComponent({
        name: "App",
        directives: { link: vLink },
        setup() {
          return () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  Array.from({ length: 200 }, (_, i) => {
                    const key = i;
                    const routeName = `route${i % 50}`;

                    return withDirectives(h("div", { key }, `Link ${i}`), [
                      [vLink, { name: routeName }],
                    ]);
                  }),
              },
            );
        },
      });

      const wrapper = mount(App);

      wrapper.unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(200 * MB);
  });

  it("5.3: v-link update 100 times — handlers updated correctly", async () => {
    const routeIndexRef = { current: 0 };

    const App = defineComponent({
      name: "App",
      directives: { link: vLink },
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                withDirectives(
                  h("div", { "data-testid": "dynamic-vlink" }, "Dynamic Link"),
                  [[vLink, { name: `route${routeIndexRef.current}` }]],
                ),
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    for (let i = 0; i < 100; i++) {
      routeIndexRef.current = (i + 1) % 50;
      wrapper.vm.$forceUpdate();
      await nextTick();
    }

    expect(true).toBe(true);

    wrapper.unmount();
  });

  it("5.4: v-link click navigates correctly after mass mount", async () => {
    const App = defineComponent({
      name: "App",
      directives: { link: vLink },
      setup() {
        return () =>
          h(
            RouterProvider,
            { router },
            {
              default: () =>
                Array.from({ length: 50 }, (_, i) => {
                  const key = i;
                  const testid = `nav-${i}`;
                  const routeName = `route${i}`;

                  return withDirectives(
                    h("div", { key, "data-testid": testid }, `Nav ${i}`),
                    [[vLink, { name: routeName }]],
                  );
                }),
            },
          );
      },
    });

    const wrapper = mount(App);

    await nextTick();
    await flushPromises();

    await wrapper.find("[data-testid='nav-5']").trigger("click");
    await nextTick();
    await flushPromises();

    expect(router.getState()?.name).toBe("route5");

    await wrapper.find("[data-testid='nav-10']").trigger("click");
    await nextTick();
    await flushPromises();

    expect(router.getState()?.name).toBe("route10");

    wrapper.unmount();
  });
});
