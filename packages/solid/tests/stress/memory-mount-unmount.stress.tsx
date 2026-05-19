import { createRouter } from "@real-router/core";
import { render, cleanup } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  RouterProvider,
  useRouteNode,
  useRouterTransition,
  RouterErrorBoundary,
} from "@real-router/solid";

import { createStressRouter, forceGC, getHeapUsedBytes, MB } from "./helpers";

import type { Router, Route } from "@real-router/core";
import type { JSX, Component } from "solid-js";

const originalWrite = process.stdout.write.bind(process.stdout);

function logBaseline(
  pattern: string,
  iterations: number,
  deltaBytes: number,
  notes = "",
): void {
  const deltaKb = (deltaBytes / 1024).toFixed(1);
  const perIter = iterations > 0 ? (deltaBytes / iterations).toFixed(0) : "n/a";
  const line = `[memory-baseline] solid/${pattern} iters=${iterations} delta=${deltaKb}KB per-iter=${perIter}B ${notes}\n`;

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
    cleanup();
    router.stop();
  });

  it("Pattern A: useRouterTransition × 1000 mount/unmount", () => {
    const TransitionConsumer: Component = () => {
      useRouterTransition();

      return null;
    };

    const mountOnce = (): ReturnType<typeof render> =>
      render(() => (
        <RouterProvider router={router}>
          <TransitionConsumer />
        </RouterProvider>
      ));

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

    expect(delta).toBeLessThan(4500 * iterations);
  });

  it("Pattern B: useRouteNode × 100 + 50 navigations", async () => {
    const NodeConsumer: Component<{ nodeName: string }> = (props) => {
      useRouteNode(props.nodeName);

      return null;
    };

    const mountTree = (): ReturnType<typeof render> =>
      render(() => (
        <RouterProvider router={router}>
          {Array.from({ length: 100 }, () => (
            <NodeConsumer nodeName="users" />
          ))}
        </RouterProvider>
      ));

    const routes = ["users.list", "route1", "users.view", "route2"];

    {
      const w = mountTree();

      w.unmount();
    }

    const before = stabilizeHeap();

    const trees: ReturnType<typeof render>[] = [];

    for (let i = 0; i < 10; i++) {
      trees.push(mountTree());
    }

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[i % routes.length], { id: String(i) });
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

    // Solid has cached shared node source baseline ~260 B/iter.
    expect(delta).toBeLessThan(500 * 10 * 100);
  });

  // §7.2 audit scenario #8 — RouterErrorBoundary mount/unmount **во время
  // ошибки**. Pattern C below covers the no-error path (500 fresh routers,
  // but `RouterErrorBoundary` never receives an error). The MED gap was:
  // do error subscriptions / dismissedVersion state survive mount/unmount
  // when the boundary is actively showing fallback?
  //
  // This pattern triggers a guard rejection on every iteration BEFORE
  // mounting, so the boundary mounts into an active-error state, then
  // unmounts. Repeating this 200 times exercises:
  //   - `createDismissableError` subscription lifecycle under error
  //   - Solid `<Show>` over signal that's already truthy at mount
  //   - `resetError` references in cached singleton snapshot are released
  it("Pattern D: 200 RouterErrorBoundary mount/unmount while error is active (§7.2 #8)", async () => {
    const makeRoutes = (): Route[] => [
      { name: "home", path: "/" },
      {
        name: "guarded",
        path: "/guarded",
        // GuardFnFactory shape: factory(router, getDep) → GuardFn.
        // Returning `false` from the GuardFn blocks navigation.
        canActivate: () => () => false,
      },
    ];

    const ErrorConsumer: Component = () => (
      <RouterErrorBoundary
        fallback={(): JSX.Element => <div data-testid="err-fallback" />}
        onError={(): void => {}}
      >
        <div />
      </RouterErrorBoundary>
    );

    const iterations = 200;

    // Warm-up: build caches once so the first measured iteration doesn't
    // inflate the baseline.
    const warmRouter = createRouter(makeRoutes(), { defaultRoute: "home" });

    await warmRouter.start("/");
    await warmRouter.navigate("guarded").catch(() => {});

    {
      const h = render(() => (
        <RouterProvider router={warmRouter}>
          <ErrorConsumer />
        </RouterProvider>
      ));

      h.unmount();
    }

    warmRouter.stop();

    const before = stabilizeHeap();

    for (let i = 0; i < iterations; i++) {
      const r = createRouter(makeRoutes(), { defaultRoute: "home" });

      await r.start("/");
      // Trigger the guard rejection BEFORE mount — boundary will mount into
      // an active-error snapshot from `createDismissableError`.
      await r.navigate("guarded").catch(() => {});

      const h = render(() => (
        <RouterProvider router={r}>
          <ErrorConsumer />
        </RouterProvider>
      ));

      h.unmount();
      r.stop();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline(
      "errorboundary-200-with-active-error",
      iterations,
      delta,
      "(§7.2 #8 — fresh routers + guard-rejected pre-mount)",
    );

    // 200 fresh routers + per-iter error/cleanup churn. §7.4 audit note —
    // the original "no numeric bound + `expect(typeof delta).toBe('number')`"
    // pattern is a non-assertion (always passes). The contract IS bounded:
    // each iteration tears down a fresh router, so per-iter retention
    // should be at most a few KB (subscriber bookkeeping). Budget at 60MB
    // covers GC variance + jsdom DOM allocator drift on 200 iterations;
    // a real leak (e.g. orphaned error subscriptions or undisposed
    // dismissable-source listeners) would blow past it.
    expect(delta).toBeLessThan(60 * MB);
  }, 60_000);

  it("Pattern C: 500 RouterErrorBoundary with fresh routers", async () => {
    const makeRoutes = (): Route[] => [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ];

    const ErrorConsumer: Component = () => (
      <RouterErrorBoundary
        fallback={(): JSX.Element => <div />}
        onError={(): void => {}}
      >
        <div />
      </RouterErrorBoundary>
    );

    const iterations = 500;

    const warmRouter = createRouter(makeRoutes(), { defaultRoute: "home" });

    await warmRouter.start("/");

    {
      const h = render(() => (
        <RouterProvider router={warmRouter}>
          <ErrorConsumer />
        </RouterProvider>
      ));

      h.unmount();
    }

    warmRouter.stop();

    const before = stabilizeHeap();

    for (let i = 0; i < iterations; i++) {
      const r = createRouter(makeRoutes(), { defaultRoute: "home" });

      await r.start("/");

      const h = render(() => (
        <RouterProvider router={r}>
          <ErrorConsumer />
        </RouterProvider>
      ));

      h.unmount();
      r.stop();
    }

    const after = stabilizeHeap();

    const delta = after - before;

    logBaseline("errorboundary-500-fresh-routers", iterations, delta);

    // §7.4 audit note: original `expect(typeof delta).toBe("number")` was
    // a non-assertion. 500 fresh routers fully stopped + RouterErrorBoundary
    // mount/unmount cycles — every router is GC-eligible by iteration end,
    // so heap should not retain >100MB. Budget mirrors React/Preact equivalents.
    expect(delta).toBeLessThan(100 * MB);
  });
});
