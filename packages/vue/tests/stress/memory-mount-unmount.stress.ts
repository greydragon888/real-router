import { createRouter } from "@real-router/core";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defineComponent, h, markRaw, nextTick } from "vue";

import {
  createStressRouter,
  mountWithProvider,
  forceGC,
  getHeapUsedBytes,
} from "./helpers";
import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { useRouteNode } from "../../src/composables/useRouteNode";
import { useRouterTransition } from "../../src/composables/useRouterTransition";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router, Route } from "@real-router/core";

const originalWrite = process.stdout.write.bind(process.stdout);

function logBaseline(
  pattern: string,
  iterations: number,
  deltaBytes: number,
  notes = "",
): void {
  const deltaKb = (deltaBytes / 1024).toFixed(1);
  const perIter = iterations > 0 ? (deltaBytes / iterations).toFixed(0) : "n/a";
  const line = `[memory-baseline] vue/${pattern} iters=${iterations} delta=${deltaKb}KB per-iter=${perIter}B ${notes}\n`;

  originalWrite(line);
}

function stabilizeHeap(): number {
  forceGC();
  forceGC();

  return getHeapUsedBytes();
}

describe("memory-mount-unmount baseline", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("Pattern A: useRouterTransition × 1000 mount/unmount", () => {
    const TransitionConsumer = defineComponent({
      name: "TransitionConsumer",
      setup() {
        useRouterTransition();

        return () => h("div");
      },
    });

    const mountOnce = (): ReturnType<typeof mountWithProvider> =>
      mountWithProvider(router, () => h(TransitionConsumer));

    {
      const w = mountOnce();

      w.unmount();
    }

    const before = stabilizeHeap();

    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const h = mountOnce();

      h.unmount();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline("transition-1000", iterations, delta);

    // After cached getTransitionSource: ~2.5KB/iter (baseline 3.9KB).
    expect(delta).toBeLessThan(3500 * iterations);
  });

  it("Pattern B: useRouteNode × 100 + 50 navigations", async () => {
    const NodeConsumer = defineComponent({
      name: "NodeConsumer",
      setup() {
        useRouteNode("users");

        return () => h("div");
      },
    });

    const Tree = defineComponent({
      name: "Tree",
      setup() {
        return () =>
          h(
            "div",
            Array.from({ length: 100 }, (_, i) => h(NodeConsumer, { key: i })),
          );
      },
    });

    const mountTree = (): ReturnType<typeof mountWithProvider> =>
      mountWithProvider(router, () => h(Tree));

    const routes = ["users.list", "route1", "users.view", "route2"];

    {
      const w = mountTree();

      w.unmount();
    }

    const before = stabilizeHeap();

    const trees: ReturnType<typeof mountWithProvider>[] = [];

    for (let i = 0; i < 10; i++) {
      trees.push(mountTree());
    }

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[i % routes.length], { id: String(i) });
      await nextTick();
      await flushPromises();
    }

    for (const t of trees) {
      t.unmount();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline(
      "routenode-100x10-nav-50",
      10 * 100,
      delta,
      "(10 trees × 100 consumers)",
    );

    // Cached RouteNodeSource shares across 1000 consumers, but Vue still
    // allocates shallowRef + 2 computed + RouteContext per consumer.
    // Baseline ~8.3 KB/iter; regression gate.
    expect(delta).toBeLessThan(9500 * 10 * 100);
  });

  it("Pattern C: 500 RouterErrorBoundary with fresh routers", async () => {
    const makeRoutes = (): Route[] => [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ];

    const ErrorConsumer = defineComponent({
      name: "ErrorConsumer",
      setup() {
        return () =>
          h(
            RouterErrorBoundary,
            {
              fallback: () => h("div"),
              onError: () => {},
            },
            { default: () => h("div") },
          );
      },
    });

    const iterations = 500;

    const Root = defineComponent({
      name: "Root",
      props: { router: { type: Object, required: true } },
      setup(props) {
        return () =>
          h(
            RouterProvider,
            { router: props.router as Router },
            { default: () => h(ErrorConsumer) },
          );
      },
    });

    const before = stabilizeHeap();

    for (let i = 0; i < iterations; i++) {
      const r = markRaw(createRouter(makeRoutes(), { defaultRoute: "home" }));

      await r.start("/");

      const w = mount(Root, { props: { router: r } });

      w.unmount();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline("errorboundary-500-fresh-routers", iterations, delta);

    // Pattern C has no numeric bound — 500 live routers in heap is expected.
    expect(typeof delta).toBe("number");
  });
});
