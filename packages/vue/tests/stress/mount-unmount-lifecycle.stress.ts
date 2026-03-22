import { flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref, nextTick } from "vue";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { useRouteNode } from "../../src/composables/useRouteNode";
import { useRoute } from "../../src/composables/useRoute";
import { useRouterTransition } from "../../src/composables/useRouterTransition";
import { Link } from "../../src/components/Link";

import {
  createStressRouter,
  mountWithProvider,
  takeHeapSnapshot,
  MB,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("mount/unmount subscription lifecycle (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("3.1: mount/unmount useRouteNode × 200 cycles — no errors, bounded heap", () => {
    const NodeConsumer = defineComponent({
      name: "NodeConsumer",
      setup() {
        useRouteNode("route0");

        return () => h("div");
      },
    });

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const wrapper = mountWithProvider(router, () => h(NodeConsumer));

      wrapper.unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("3.2: mount/unmount useRoute × 200 cycles — no errors, bounded heap", () => {
    const RouteConsumer = defineComponent({
      name: "RouteConsumer",
      setup() {
        useRoute();

        return () => h("div");
      },
    });

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const wrapper = mountWithProvider(router, () => h(RouteConsumer));

      wrapper.unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("3.3: 50 components mount → navigate × 10 → unmount → remount → navigate × 10", async () => {
    const renderCounts: number[] = Array.from<number>({ length: 50 }).fill(0);

    const consumers = Array.from({ length: 50 }, (_, i) =>
      defineComponent({
        name: `Consumer${i}`,
        setup() {
          useRouteNode(`route${i}`);

          return () => {
            renderCounts[i]++;

            return h("div");
          };
        },
      }),
    );

    const wrapper = mountWithProvider(router, () =>
      consumers.map((C, i) => h(C, { key: i })),
    );

    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i + 1}`);
      await nextTick();
      await flushPromises();
    }

    const countsAfterFirstCycle = [...renderCounts];

    countsAfterFirstCycle.forEach((count) => {
      expect(count).toBeGreaterThan(0);
    });

    wrapper.unmount();

    renderCounts.fill(0);

    const wrapper2 = mountWithProvider(router, () =>
      consumers.map((C, i) => h(C, { key: i })),
    );

    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i % 10}`);
      await nextTick();
      await flushPromises();
    }

    renderCounts.forEach((count) => {
      expect(count).toBeGreaterThan(0);
    });

    wrapper2.unmount();
  });

  it("3.4: conditional toggle 20 useRouteNode × 100 — no errors", async () => {
    const showRef = ref(true);

    const consumers = Array.from({ length: 20 }, (_, i) =>
      defineComponent({
        name: `ToggleConsumer${i}`,
        setup() {
          useRouteNode(`route${i}`);

          return () => h("div");
        },
      }),
    );

    const Toggle = defineComponent({
      name: "Toggle",
      setup() {
        return () =>
          showRef.value ? consumers.map((C, i) => h(C, { key: i })) : null;
      },
    });

    mountWithProvider(router, () => h(Toggle));

    for (let i = 0; i < 100; i++) {
      showRef.value = !showRef.value;
      await nextTick();
    }

    expect(true).toBe(true);
  });

  it("3.5: router stop/restart while 50 components mounted — components receive post-restart navigations", async () => {
    const renderCounts: number[] = Array.from<number>({ length: 50 }).fill(0);

    const consumers = Array.from({ length: 50 }, (_, i) =>
      defineComponent({
        name: `RestartConsumer${i}`,
        setup() {
          const { route } = useRouteNode(`route${i}`);

          return () => {
            void route.value;
            renderCounts[i]++;

            return h("div");
          };
        },
      }),
    );

    mountWithProvider(router, () => consumers.map((C, i) => h(C, { key: i })));

    for (let i = 0; i < 5; i++) {
      await router.navigate(`route${i + 1}`);
      await nextTick();
      await flushPromises();
    }

    const countsAfterFirstPhase = [...renderCounts];

    router.stop();
    await router.start("/route0");
    await nextTick();
    await flushPromises();

    for (let i = 0; i < 5; i++) {
      await router.navigate(`route${i + 1}`);
      await nextTick();
      await flushPromises();
    }

    renderCounts.forEach((count, i) => {
      expect(count).toBeGreaterThanOrEqual(countsAfterFirstPhase[i]);
    });

    const totalAfter = renderCounts.reduce((a, b) => a + b, 0);
    const totalBefore = countsAfterFirstPhase.reduce((a, b) => a + b, 0);

    expect(totalAfter).toBeGreaterThan(totalBefore);
  });

  it("3.6: mount/unmount Link × 200 cycles — no crashes, Link works after cycles", async () => {
    for (let i = 0; i < 200; i++) {
      const wrapper = mountWithProvider(router, () =>
        h(Link, { routeName: "route0" }, { default: () => "L" }),
      );

      wrapper.unmount();
    }

    const wrapper = mountWithProvider(router, () =>
      h(Link, { routeName: "route1" }, { default: () => "go" }),
    );

    const link = wrapper.find("a");

    expect(link.exists()).toBe(true);

    await router.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(router.getState()?.name).toBe("route1");

    wrapper.unmount();
  });

  it("3.7: mount/unmount useRouterTransition × 200 cycles — no crashes", () => {
    const TransitionConsumer = defineComponent({
      name: "TransitionConsumer",
      setup() {
        useRouterTransition();

        return () => h("div");
      },
    });

    for (let i = 0; i < 200; i++) {
      const wrapper = mountWithProvider(router, () => h(TransitionConsumer));

      wrapper.unmount();
    }

    expect(true).toBe(true);
  });
});
