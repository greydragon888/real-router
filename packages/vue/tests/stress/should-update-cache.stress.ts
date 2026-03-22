import { flushPromises } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { describe, it, expect, afterEach } from "vitest";

import { useRouteNode } from "../../src/composables/useRouteNode";

import { createStressRouter, mountWithProvider, forceGC } from "./helpers";

describe("V6 — shouldUpdateCache growth (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("6.1: 200 unique useRouteNode(name) — all render, no crash on navigation", async () => {
    const router = createStressRouter(200);

    await router.start("/route0");

    const renderCounts: number[] = Array.from<number>({ length: 200 }).fill(0);

    const subscribers = Array.from({ length: 200 }, (_, i) =>
      defineComponent({
        name: `Sub${i}`,
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

    mountWithProvider(router, () =>
      subscribers.map((Sub, i) => h(Sub, { key: i })),
    );

    await nextTick();
    await flushPromises();

    for (let i = 0; i < 200; i++) {
      expect(renderCounts[i]).toBeGreaterThan(0);
    }

    await router.navigate("route1");
    await nextTick();
    await flushPromises();

    await router.navigate("route100");
    await nextTick();
    await flushPromises();

    expect(router.getState()?.name).toBe("route100");

    router.stop();
  });

  it("6.2: same nodeName × 100 components — cache hit, consistent state", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const routeCaptures: (string | undefined)[] = Array.from<
      string | undefined
    >({
      length: 100,
    }).fill(undefined);

    const subscribers = Array.from({ length: 100 }, (_, i) =>
      defineComponent({
        name: `UsersSub${i}`,
        setup() {
          const { route } = useRouteNode("users");

          return () => {
            void route.value;
            routeCaptures[i] = route.value?.name;

            return h("div");
          };
        },
      }),
    );

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

  it("6.3: router stop + GC → new router works independently", async () => {
    const router = createStressRouter(50);

    await router.start("/route0");

    const subscribers = Array.from({ length: 50 }, (_, i) =>
      defineComponent({
        name: `Sub${i}`,
        setup() {
          useRouteNode(`route${i}`);

          return () => h("div");
        },
      }),
    );

    const wrapper = mountWithProvider(router, () =>
      subscribers.map((Sub, i) => h(Sub, { key: i })),
    );

    await nextTick();
    await flushPromises();

    wrapper.unmount();
    router.stop();
    forceGC();

    const router2 = createStressRouter(50);

    await router2.start("/route0");

    let renderCount = 0;

    const NewConsumer = defineComponent({
      name: "NewConsumer",
      setup() {
        const { route } = useRouteNode("route0");

        return () => {
          void route.value;
          renderCount++;

          return h("div");
        };
      },
    });

    mountWithProvider(router2, () => h(NewConsumer));

    await nextTick();
    await flushPromises();

    expect(renderCount).toBeGreaterThan(0);

    await router2.navigate("route1");
    await nextTick();
    await flushPromises();

    expect(renderCount).toBeGreaterThan(1);

    router2.stop();
  });

  it("6.4: 2 routers × 50 nodeNames — isolated caches, no cross-talk", async () => {
    const router1 = createStressRouter(50);
    const router2 = createStressRouter(50);

    await router1.start("/route0");
    await router2.start("/route0");

    let r1Renders = 0;
    let r2Renders = 0;

    const r1Subscribers = Array.from({ length: 50 }, (_, i) =>
      defineComponent({
        name: `R1Sub${i}`,
        setup() {
          const { route } = useRouteNode(`route${i}`);

          return () => {
            void route.value;
            r1Renders++;

            return h("div");
          };
        },
      }),
    );

    const r2Subscribers = Array.from({ length: 50 }, (_, i) =>
      defineComponent({
        name: `R2Sub${i}`,
        setup() {
          const { route } = useRouteNode(`route${i}`);

          return () => {
            void route.value;
            r2Renders++;

            return h("div");
          };
        },
      }),
    );

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
});
