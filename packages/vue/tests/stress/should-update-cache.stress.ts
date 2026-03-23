import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { createStressRouter, mountWithProvider } from "./helpers";
import { useRouteNode } from "../../src/composables/useRouteNode";

describe("V6 — shouldUpdateCache growth (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
