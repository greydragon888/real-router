import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defineAsyncComponent, defineComponent, h, nextTick } from "vue";

import {
  createStressRouter,
  mountWithProvider,
  navigateSequentially,
  takeHeapSnapshot,
  MB,
} from "./helpers";
import { RouteView } from "../../src/components/RouteView";

import type { Router } from "@real-router/core";

// V11 — `<RouteView.Match fallback={...}>` wraps matched content in Vue's
// `<Suspense>`. Under rapid navigation between lazy segments, two failure
// modes are possible: (a) the Suspense boundary stays in fallback after a
// nav resolves; (b) listener leak from re-mounted async wrappers. These
// stress scenarios pin both: bounded heap + final DOM state.

function makeAsyncSegment(label: string): {
  Component: ReturnType<typeof defineAsyncComponent>;
  resolve: () => void;
  isResolved: () => boolean;
} {
  let resolveFn!: (component: ReturnType<typeof defineComponent>) => void;
  let resolved = false;
  const promise = new Promise<ReturnType<typeof defineComponent>>((resolve) => {
    resolveFn = resolve;
  });

  const Component = defineAsyncComponent(() => promise);

  return {
    Component,
    resolve: () => {
      resolved = true;
      resolveFn(
        defineComponent({
          setup: () => () =>
            h("div", { "data-testid": label }, `loaded-${label}`),
        }),
      );
    },
    isResolved: () => resolved,
  };
}

describe("V11 — Suspense + lazy components stress (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("11.1: 50 rapid navs across two lazy segments — fallback never sticks after resolve", async () => {
    const lazyA = makeAsyncSegment("a");
    const lazyB = makeAsyncSegment("b");

    const wrapper = mountWithProvider(router, () =>
      h(
        RouteView,
        { nodeName: "" },
        {
          default: () => [
            h(
              RouteView.Match,
              {
                segment: "users",
                fallback: () =>
                  h("div", { "data-testid": "fallback-a" }, "loading-a"),
              },
              { default: () => h(lazyA.Component) },
            ),
            h(
              RouteView.Match,
              {
                segment: "admin",
                fallback: () =>
                  h("div", { "data-testid": "fallback-b" }, "loading-b"),
              },
              { default: () => h(lazyB.Component) },
            ),
          ],
        },
      ),
    );

    // Resolve both async segments before flooding navs.
    lazyA.resolve();
    lazyB.resolve();
    await flushPromises();
    await nextTick();

    const targets = ["users.list", "admin.dashboard"] as const;

    await navigateSequentially(
      router,
      Array.from({ length: 50 }, (_, i) => ({
        name: targets[i % targets.length],
      })),
    );

    // Final state: one fallback gone, one real content rendered. Whichever
    // segment matched last must be the one visible — and never the fallback.
    const finalRouteName = router.getState()?.name ?? "";
    const expectedTestId = finalRouteName.startsWith("users") ? "a" : "b";
    const stuckFallbackA = wrapper.find("[data-testid='fallback-a']").exists();
    const stuckFallbackB = wrapper.find("[data-testid='fallback-b']").exists();

    expect(stuckFallbackA).toBe(false);
    expect(stuckFallbackB).toBe(false);
    expect(wrapper.find(`[data-testid='${expectedTestId}']`).exists()).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("11.2: 100 mount/unmount cycles of a lazy <Match> — bounded heap, no listener accumulation", async () => {
    const lazy = makeAsyncSegment("c");

    // Resolve up front so the Suspense boundary settles immediately on each
    // mount — heap growth must come from the wrapper churn, not from a stuck
    // pending promise.
    lazy.resolve();
    await flushPromises();

    await router.navigate("users.list");
    await nextTick();
    await flushPromises();

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const wrapper = mountWithProvider(router, () =>
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                {
                  segment: "users",
                  fallback: () =>
                    h("div", { "data-testid": "fallback-c" }, "loading-c"),
                },
                { default: () => h(lazy.Component) },
              ),
          },
        ),
      );

      await nextTick();
      await flushPromises();

      wrapper.unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("11.3: fallback shows then resolves on a single lazy segment × 50 cycles — bounded heap", async () => {
    // Per-cycle: mount fresh wrapper with an unresolved lazy segment, navigate
    // into it, assert fallback visible, resolve, assert real content visible,
    // unmount. Stresses the fallback→content swap path that Vue's Suspense
    // takes inside `<RouteView.Match fallback>` without crossing branches
    // mid-resolve (Vue's Suspense unmount-while-pending is unrelated to the
    // router and hits a Vue internal — out of scope here).
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 50; i++) {
      const lazy = makeAsyncSegment(`d-${i}`);

      const wrapper = mountWithProvider(router, () =>
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                {
                  segment: "users",
                  fallback: () =>
                    h(
                      "div",
                      { "data-testid": `fallback-d-${i}` },
                      `loading-d-${i}`,
                    ),
                },
                { default: () => h(lazy.Component) },
              ),
          },
        ),
      );

      await router.navigate("users.list");
      await nextTick();

      expect(wrapper.find(`[data-testid='fallback-d-${i}']`).exists()).toBe(
        true,
      );

      lazy.resolve();
      await flushPromises();
      await nextTick();

      expect(wrapper.find(`[data-testid='fallback-d-${i}']`).exists()).toBe(
        false,
      );
      expect(wrapper.find(`[data-testid='d-${i}']`).exists()).toBe(true);

      wrapper.unmount();

      await router.navigate("route0");
      await nextTick();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });
});
