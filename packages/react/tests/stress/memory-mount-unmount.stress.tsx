import { createRouter } from "@real-router/core";
import { render, act, cleanup, configure } from "@testing-library/react";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";

import {
  RouterProvider,
  useRouteNode,
  useRouterTransition,
  RouterErrorBoundary,
} from "@real-router/react";

import { createStressRouter, forceGC, getHeapUsedBytes } from "./helpers";

import type { Router, Route } from "@real-router/core";
import type { FC, ReactNode } from "react";

const originalWrite = process.stdout.write.bind(process.stdout);

function logBaseline(
  pattern: string,
  iterations: number,
  deltaBytes: number,
  notes = "",
): void {
  const deltaKb = (deltaBytes / 1024).toFixed(1);
  const perIter = iterations > 0 ? (deltaBytes / iterations).toFixed(0) : "n/a";
  const line = `[memory-baseline] react/${pattern} iters=${iterations} delta=${deltaKb}KB per-iter=${perIter}B ${notes}\n`;

  originalWrite(line);
}

function stabilizeHeap(): number {
  forceGC();
  forceGC();

  return getHeapUsedBytes();
}

describe("memory-mount-unmount baseline", () => {
  let router: Router;

  beforeAll(() => {
    // Setup.ts устанавливает reactStrictMode: true — это даёт двойной mount/unmount
    // и сильно искажает абсолютные цифры. Для чистого замера изолируем тесты.
    configure({ reactStrictMode: false });
  });

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    cleanup();
    router.stop();
  });

  afterAll(() => {
    configure({ reactStrictMode: true });
  });

  it("Pattern A: useRouterTransition × 1000 mount/unmount", () => {
    const TransitionConsumer: FC = () => {
      useRouterTransition();

      return null;
    };

    const mountOnce = (): ReturnType<typeof render> =>
      render(
        <RouterProvider router={router}>
          <TransitionConsumer />
        </RouterProvider>,
      );

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

    // Coarse catastrophe guard — NOT a leak detector. React runtime churn
    // dominates this delta (~68KB/iter ≈ 68MB healthy). Mutation-validated:
    // skipping BaseSource#listeners.delete (a real cleanup leak) leaves the delta
    // unchanged and the suite green — the leak signal is KB-scale, swamped by
    // jsdom/React mount churn. The cleanup contract is discriminated by
    // @real-router/sources BaseSource.test.ts. Threshold ≈ 3× healthy; the prior
    // 75MB sat at ~1.1× and flaked.
    expect(delta).toBeLessThan(210 * 1024 * 1024);
  });

  it("Pattern B: useRouteNode × 100 + 50 navigations", async () => {
    const NodeConsumer: FC<{ nodeName: string }> = ({ nodeName }) => {
      useRouteNode(nodeName);

      return null;
    };

    const mountTree = (): ReturnType<typeof render> =>
      render(
        <RouterProvider router={router}>
          {Array.from({ length: 100 }, (_, i) => (
            <NodeConsumer key={i} nodeName="users" />
          ))}
        </RouterProvider>,
      );

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
      await act(async () => {
        await router.navigate(routes[i % routes.length], { id: String(i) });
      });
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

    // Coarse catastrophe guard, NOT a cache-breakage detector. React runtime
    // allocation dominates this delta (~3.3KB/consumer: fiber + hooks + the
    // useSyncExternalStore subscription), and the "N consumers of one nodeName
    // share one RouteNodeSource" guarantee is GC-masked here — broken sources are
    // created at mount and reclaimed at unmount, so the post-unmount delta does
    // NOT move when the cache breaks. Mutation-confirmed: disabling the
    // createRouteNodeSource cache leaves the delta unchanged (~3.3MB healthy vs
    // ~3.4MB cache-disabled, in isolation). The cache-sharing contract is covered
    // by @real-router/sources functional tests; this only guards against a
    // catastrophic mount/navigate/unmount heap blow-up. Measured healthy: ~2.5MB
    // (full suite) / ~3.3MB (isolated) — threshold set ~9× above so runtime/GC
    // variance never flakes it.
    expect(delta).toBeLessThan(30 * 1024 * 1024);
  });

  it("Pattern C: 500 RouterErrorBoundary with fresh routers", async () => {
    const makeRoutes = (): Route[] => [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ];

    const ErrorConsumer: FC = () => (
      <RouterErrorBoundary
        fallback={(): ReactNode => <div />}
        onError={(): void => {}}
      >
        <div />
      </RouterErrorBoundary>
    );

    const iterations = 500;

    const warmRouter = createRouter(makeRoutes(), { defaultRoute: "home" });

    await warmRouter.start("/");

    {
      const h = render(
        <RouterProvider router={warmRouter}>
          <ErrorConsumer />
        </RouterProvider>,
      );

      h.unmount();
    }

    warmRouter.stop();

    const before = stabilizeHeap();

    for (let i = 0; i < iterations; i++) {
      const r = createRouter(makeRoutes(), { defaultRoute: "home" });

      await r.start("/");

      const h = render(
        <RouterProvider router={r}>
          <ErrorConsumer />
        </RouterProvider>,
      );

      h.unmount();
      r.stop();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline("errorboundary-500-fresh-routers", iterations, delta);

    // Pattern C has no numeric bound — 500 live routers in heap is expected.
    expect(typeof delta).toBe("number");
  });
});
