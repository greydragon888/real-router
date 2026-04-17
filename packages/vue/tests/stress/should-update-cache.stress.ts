import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import {
  createStressRouter,
  forceGC,
  MB,
  mountWithProvider,
  takeHeapSnapshot,
} from "./helpers";
import { useRouteNode } from "../../src/composables/useRouteNode";

describe("V6 — shouldUpdateCache growth (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("6.1: 200 unique useRouteNode consumers + navigation — all fire effects", async () => {
    const router = createStressRouter(200);

    await router.start("/route0");

    const effectCounts: number[] = Array.from<number>({ length: 200 }).fill(0);

    const subscribers = Array.from({ length: 200 }, (_, i) => {
      const index = i;

      return defineComponent({
        name: `UniqueNode${i}`,
        setup() {
          const { route } = useRouteNode(`route${i}`);

          return () => {
            if (route.value) {
              effectCounts[index]++;
            }

            return h("div");
          };
        },
      });
    });

    mountWithProvider(router, () =>
      subscribers.map((Sub, i) => h(Sub, { key: i })),
    );

    await nextTick();
    await flushPromises();

    // Navigate to route1 — only route1 subscriber should fire
    await router.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(effectCounts[1]).toBeGreaterThan(0);

    // Navigate through several routes — each subscriber fires for its route
    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i * 20}`);
      await nextTick();
      await flushPromises();
    }

    // At least the navigated routes should have fired
    for (let i = 0; i < 10; i++) {
      expect(effectCounts[i * 20]).toBeGreaterThan(0);
    }

    router.stop();
  });

  it("6.3: router stop + GC — new router works independently", async () => {
    const router1 = createStressRouter(50);

    await router1.start("/route0");

    let r1Renders = 0;

    const R1Sub = defineComponent({
      name: "R1Sub",
      setup() {
        const { route } = useRouteNode("route1");

        return () => {
          if (route.value) {
            r1Renders++;
          }

          return h("div");
        };
      },
    });

    const wrapper1 = mountWithProvider(router1, () => h(R1Sub));

    await router1.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(r1Renders).toBeGreaterThan(0);

    // Stop and unmount first router
    wrapper1.unmount();
    router1.stop();

    forceGC();

    // Create a new router — should work independently
    const router2 = createStressRouter(50);

    await router2.start("/route0");

    let r2Renders = 0;

    const R2Sub = defineComponent({
      name: "R2Sub",
      setup() {
        const { route } = useRouteNode("route1");

        return () => {
          if (route.value) {
            r2Renders++;
          }

          return h("div");
        };
      },
    });

    mountWithProvider(router2, () => h(R2Sub));

    await router2.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(r2Renders).toBeGreaterThan(0);

    router2.stop();
  });

  it("6.2: same nodeName × 100 components — cache hit, consistent state", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const routeCaptures: (string | undefined)[] = Array.from<
      string | undefined
    >({
      length: 100,
    }).fill(undefined);

    const subscribers = Array.from({ length: 100 }, (_, i) => {
      const index = i;

      return defineComponent({
        name: `UsersSub${i}`,
        setup() {
          const { route } = useRouteNode("users");

          return () => {
            if (route.value) {
              routeCaptures[index] = route.value.name;
            }

            return h("div");
          };
        },
      });
    });

    mountWithProvider(router, () =>
      subscribers.map((Sub, i) => h(Sub, { key: i })),
    );

    await nextTick();
    await flushPromises();

    await router.navigate("users.list");
    await nextTick();
    await flushPromises();

    for (let i = 0; i < 100; i++) {
      expect(routeCaptures[i]).toBe("users.list");
    }

    await router.navigate("route1");
    await nextTick();
    await flushPromises();

    const uniqueValues = new Set(routeCaptures);

    expect(uniqueValues.size).toBe(1);

    router.stop();
  });

  it("6.4: 2 routers × 50 nodeNames — isolated caches, no cross-talk", async () => {
    const router1 = createStressRouter(50);
    const router2 = createStressRouter(50);

    await router1.start("/route0");
    await router2.start("/route0");

    let r1Renders = 0;
    let r2Renders = 0;

    const r1Subscribers = Array.from({ length: 50 }, (_, i) => {
      const index = i;

      return defineComponent({
        name: `R1Sub${i}`,
        setup() {
          const { route } = useRouteNode(`route${index}`);

          return () => {
            if (route.value) {
              r1Renders++;
            }

            return h("div");
          };
        },
      });
    });

    const r2Subscribers = Array.from({ length: 50 }, (_, i) => {
      const index = i;

      return defineComponent({
        name: `R2Sub${i}`,
        setup() {
          const { route } = useRouteNode(`route${index}`);

          return () => {
            if (route.value) {
              r2Renders++;
            }

            return h("div");
          };
        },
      });
    });

    mountWithProvider(router1, () =>
      r1Subscribers.map((Sub, i) => h(Sub, { key: i })),
    );
    mountWithProvider(router2, () =>
      r2Subscribers.map((Sub, i) => h(Sub, { key: i })),
    );

    await nextTick();
    await flushPromises();

    const r1After = r1Renders;
    const r2After = r2Renders;

    await router1.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(r1Renders - r1After).toBeGreaterThan(0);
    expect(r2Renders - r2After).toBe(0);

    const r1Before2 = r1Renders;
    const r2Before2 = r2Renders;

    await router2.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(r2Renders - r2Before2).toBeGreaterThan(0);
    expect(r1Renders - r1Before2).toBe(0);

    router1.stop();
    router2.stop();
  });

  it("6.5: createRouterPlugin × 100 apps without onUnmount — bounded heap (no listener accumulation when GC eligible)", async () => {
    const { createApp, defineComponent, h } = await import("vue");
    const { createRouterPlugin } =
      await import("../../src/createRouterPlugin.js");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(10);

      await router.start("/route0");

      const app = createApp(
        defineComponent({
          setup: () => () => h("div"),
        }),
      );

      // Vue 3.3-3.4 compatibility path: no app.onUnmount available.
      // The router subscription should be cleaned up on app.unmount() via
      // GC of the router (which the test exercises via router.stop()).
      delete (app as unknown as { onUnmount?: unknown }).onUnmount;

      app.use(createRouterPlugin(router));

      const container = document.createElement("div");

      app.mount(container);
      app.unmount();
      router.stop();
    }

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // 100 apps × ~few KB router state should comfortably stay under threshold.
    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });
});
