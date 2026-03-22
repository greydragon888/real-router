import { createRouter } from "@real-router/core";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { mountWithProvider } from "./helpers";
import { useRoute } from "../../src/composables/useRoute";
import { useRouteNode } from "../../src/composables/useRouteNode";
import { useRouter } from "../../src/composables/useRouter";
import { RouterProvider } from "../../src/RouterProvider";

import type { Route, Router } from "@real-router/core";

function createDeepRouter(depth: number, breadth: number): Router {
  function buildChildren(prefix: string, level: number): Route[] {
    if (level >= depth) {
      return [];
    }

    return Array.from({ length: breadth }, (_, i) => {
      const name = `${prefix}${i}`;

      return {
        name,
        path: `/${name}`,
        children: buildChildren(name, level + 1),
      };
    });
  }

  const routes: Route[] = [
    { name: "root", path: "/root", children: buildChildren("n", 0) },
    { name: "other", path: "/other" },
  ];

  return createRouter(routes, { defaultRoute: "other" });
}

function buildNodeChain(depth: number): string[] {
  const chain: string[] = ["root"];
  let seg = "n";

  for (let d = 0; d < depth; d++) {
    seg += "0";
    chain.push(`${chain.at(-1)}.${seg}`);
  }

  return chain;
}

describe("V5 — deep component tree + context cascade (Vue)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("5.1: 30 deep useRouteNode — only relevant nodes re-render on navigation", async () => {
    const router = createDeepRouter(30, 1);

    await router.start("/other");

    const chain = buildNodeChain(30);
    const midRoute = chain[15];
    const renderCounts: number[] = Array.from<number>({
      length: chain.length,
    }).fill(0);

    const subscribers = chain.map((nodeName, i) => {
      const index = i;

      return defineComponent({
        name: `NodeSub${i}`,
        setup() {
          const { route } = useRouteNode(nodeName);

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

    await nextTick();
    await flushPromises();

    const afterMount = [...renderCounts];

    await router.navigate(midRoute);
    await nextTick();
    await flushPromises();

    for (let i = 0; i <= 15; i++) {
      expect(renderCounts[i] - afterMount[i]).toBeGreaterThan(0);
    }
    for (let i = 16; i < chain.length; i++) {
      expect(renderCounts[i] - afterMount[i]).toBe(0);
    }

    router.stop();
  });

  it("5.2: 30 deep useRouter (stable) — 0 re-renders from navigation", async () => {
    const router = createDeepRouter(30, 1);
    const chain = buildNodeChain(30);

    await router.start("/other");

    let totalRenders = 0;

    const RouterUser = defineComponent({
      name: "RouterUser",
      setup() {
        useRouter();

        return () => {
          totalRenders++;

          return h("div");
        };
      },
    });

    mountWithProvider(router, () =>
      Array.from({ length: 30 }, (_, i) => {
        const key = i;

        return h(RouterUser, { key });
      }),
    );

    await nextTick();
    await flushPromises();

    const afterMount = totalRenders;

    for (let nav = 0; nav < 50; nav++) {
      const lastChain = chain.at(-1);

      await router.navigate(nav % 2 === 0 ? (lastChain ?? "other") : "other");
      await nextTick();
      await flushPromises();
    }

    expect(totalRenders - afterMount).toBe(0);

    router.stop();
  });

  it("5.3: wide tree + useRoute on leaves — all 25 leaves re-render every navigation", async () => {
    const router = createDeepRouter(2, 5);

    await router.start("/other");

    let leafRenders = 0;

    const LeafConsumer = defineComponent({
      name: "LeafConsumer",
      setup() {
        const { route } = useRoute();

        return () => {
          // Ensure reactivity by accessing route.value
          Boolean(route.value);
          leafRenders++;

          return h("div");
        };
      },
    });

    mountWithProvider(router, () =>
      Array.from({ length: 25 }, (_, i) => {
        const key = i;

        return h(LeafConsumer, { key });
      }),
    );

    await nextTick();
    await flushPromises();

    const afterMount = leafRenders;

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(nav % 2 === 0 ? "root.n0" : "other");
      await nextTick();
      await flushPromises();
    }

    expect(leafRenders - afterMount).toBeGreaterThanOrEqual(25 * 50);

    router.stop();
  });

  it("5.4: nested RouterProviders — router1 navigation doesn't affect router2 state", async () => {
    const router1 = createRouter(
      [
        { name: "r1a", path: "/a" },
        { name: "r1b", path: "/b" },
      ],
      { defaultRoute: "r1a" },
    );
    const router2 = createRouter(
      [
        { name: "r2a", path: "/a" },
        { name: "r2b", path: "/b" },
      ],
      { defaultRoute: "r2a" },
    );

    await router1.start("/a");
    await router2.start("/a");

    let r2RouteCapture: string | undefined;
    let r2RenderCount = 0;

    const R2Consumer = defineComponent({
      name: "R2Consumer",
      setup() {
        const { route } = useRouteNode("");

        return () => {
          if (route.value) {
            r2RouteCapture = route.value.name;
            r2RenderCount++;
          }

          return h("div");
        };
      },
    });

    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router: router1 },
            {
              default: () =>
                h(
                  RouterProvider,
                  { router: router2 },
                  { default: () => h(R2Consumer) },
                ),
            },
          ),
      }),
    );

    await nextTick();
    await flushPromises();

    const r2After = r2RenderCount;

    for (let i = 0; i < 50; i++) {
      await router1.navigate(i % 2 === 0 ? "r1b" : "r1a");
      await nextTick();
      await flushPromises();
    }

    expect(r2RouteCapture).toBe("r2a");
    expect(r2RenderCount - r2After).toBe(0);

    router1.stop();
    router2.stop();
  });
});
