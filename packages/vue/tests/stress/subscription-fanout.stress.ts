import { flushPromises } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defineComponent, h, ref, nextTick } from "vue";

import {
  createStressRouter,
  mountWithProvider,
  navigateSequentially,
  roundRobinRoutes,
} from "./helpers";
import { useRoute } from "../../src/composables/useRoute";
import { useRouteNode } from "../../src/composables/useRouteNode";

import type { Router } from "@real-router/core";

describe("subscription-fanout stress tests (Vue)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("1.1: 50 useRouteNode on different nodes + 100 navigations — each re-renders only when its node is navigated to", async () => {
    const renderCounts: number[] = Array.from<number>({ length: 50 }).fill(0);

    const subscribers = Array.from({ length: 50 }, (_, i) => {
      const index = i;

      return defineComponent({
        name: `Sub${i}`,
        setup() {
          const { route } = useRouteNode(`route${i}`);

          return () => {
            if (route.value) {
              renderCounts[index]++;
            }

            return h("div");
          };
        },
      });
    });

    mountWithProvider(router, () =>
      subscribers.map((Sub, i) => h(Sub, { key: i })),
    );

    const countsAfterMount = [...renderCounts];

    await router.navigate("users.list");
    await nextTick();
    await flushPromises();

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    for (let i = 0; i < 50; i++) {
      const delta = renderCounts[i] - countsAfterMount[i];

      expect(delta).toBeGreaterThanOrEqual(2);
      expect(delta).toBeLessThanOrEqual(10);
    }
  });

  it("1.2: 20 useRoute + 30 useRouteNode('') consumers + 100 navigations — each re-renders on every navigation", async () => {
    await router.navigate("users.list");
    await nextTick();
    await flushPromises();

    let routeRenders = 0;
    let rootNodeRenders = 0;

    const RouteConsumer = defineComponent({
      name: "RouteConsumer",
      setup() {
        const { route } = useRoute();

        return () => {
          if (route.value) {
            routeRenders++;
          }

          return h("div");
        };
      },
    });

    const RootNodeConsumer = defineComponent({
      name: "RootNodeConsumer",
      setup() {
        const { route } = useRouteNode("");

        return () => {
          if (route.value) {
            rootNodeRenders++;
          }

          return h("div");
        };
      },
    });

    mountWithProvider(router, () => [
      ...Array.from({ length: 20 }, (_, i) =>
        h(RouteConsumer, { key: `r-${i}` }),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        h(RootNodeConsumer, { key: `n-${i}` }),
      ),
    ]);

    const routeAfterMount = routeRenders;
    const rootAfterMount = rootNodeRenders;

    const routeNames = Array.from({ length: 10 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    expect(routeRenders - routeAfterMount).toBe(20 * 100);
    expect(rootNodeRenders - rootAfterMount).toBe(30 * 100);
  });

  it("1.4: mount/unmount 10 components concurrently with navigation — no errors thrown", async () => {
    let errorThrown: unknown = null;

    const showRef = ref(true);

    const NodeComp = defineComponent({
      name: "NodeComp",
      props: { nodeName: { type: String, required: true } },
      setup(props) {
        useRouteNode(props.nodeName);

        return () => h("div");
      },
    });

    const Toggle = defineComponent({
      name: "Toggle",
      setup() {
        return () =>
          h("div", [
            showRef.value
              ? Array.from({ length: 10 }, (_, i) => {
                  const key = i;
                  const nodeName = `route${i % 5}`;

                  return h(NodeComp, { key, nodeName });
                })
              : null,
          ]);
      },
    });

    mountWithProvider(router, () => h(Toggle));

    try {
      for (let i = 0; i < 10; i++) {
        showRef.value = !showRef.value;
        await nextTick();
        await router.navigate(`route${(i % 5) + 1}`);
        await nextTick();
        await flushPromises();
      }
    } catch (error) {
      errorThrown = error;
    }

    expect(errorThrown).toBeNull();
  });
});
