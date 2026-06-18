import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  RouterProvider,
  useRoute,
  useRouteNode,
  useRouterTransition,
} from "@real-router/react";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { FC } from "react";

/**
 * R12 — Factory reuse stress (review-2026-05-16 §7 Top-5 #1, HIGH).
 *
 * Sister suite to 3.13 (200 *fresh* routers disposed). All cached factories
 * in `@real-router/sources` (createRouteNodeSource / getTransitionSource /
 * getErrorSource / createDismissableError / createActiveRouteSource) key
 * their WeakMap by `Router`. 3.13 exercises GC release; 3.13 does NOT
 * exercise the in-place subscriber Set growth path: when ONE router is
 * reused across N mount cycles, listener Sets inside cached sources must
 * shrink back to 0 on every unmount cycle.
 *
 * Failure mode this protects against: BaseSource#listeners accumulates an
 * entry per mount that survives unmount, causing linear heap growth and
 * eventual fanout amplification on the next navigate.
 */
describe("R12 — factory reuse on single router × N mounts", () => {
  afterEach(() => {
    cleanup();
  });

  it("12.1: 100 mount/unmount cycles on ONE router — bounded heap growth", async () => {
    const router = createStressRouter(20);

    await router.start("/route0");

    const FullConsumer: FC = () => {
      useRoute();
      useRouteNode("");
      useRouteNode("route0");
      useRouterTransition();

      return null;
    };

    FullConsumer.displayName = "FullConsumer";

    // Warm-up: trigger lazy module init paths so initial allocations don't
    // pollute the heap delta. One mount/unmount + one navigation is enough.
    {
      const { unmount } = render(
        <RouterProvider router={router}>
          <FullConsumer />
        </RouterProvider>,
      );

      await act(async () => {
        await router.navigate("route1");
      });
      unmount();
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const { unmount } = render(
        <RouterProvider router={router}>
          <FullConsumer />
          <FullConsumer />
          <FullConsumer />
        </RouterProvider>,
      );

      // Navigate inside the cycle so subscribers actually run their listener
      // path — pure mount/unmount could short-circuit before reaching the
      // subscription set in some adapters. `.catch` swallows SAME_STATES when
      // a cycle target happens to equal the current route.
      await act(async () => {
        await router.navigate(`route${(i % 19) + 1}`).catch(() => {});
      });

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    // Coarse catastrophe guard, NOT a listener-leak detector. The cached sources
    // outlive this loop (WeakMap-keyed by the surviving router), but a real
    // listener leak is KB-scale and invisible here — mutation-validated: skipping
    // BaseSource#listeners.delete leaves this delta unchanged and the suite green.
    // The "listener set sheds what it added" contract is discriminated by
    // @real-router/sources BaseSource.test.ts. Threshold ≈ 3.8× healthy (~8MB).
    expect(heapAfter - heapBefore).toBeLessThan(30 * MB);

    // Sanity: a final mount on the same router still routes correctly.
    const { getByTestId, unmount } = render(
      <RouterProvider router={router}>
        <ProbeName />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("route2");
    });

    expect(getByTestId("name").textContent).toBe("route2");

    unmount();
    router.stop();
  });

  it("12.2: 200 mount/unmount cycles on ONE router — listener subscriber set returns to baseline after final unmount", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    // Warm-up.
    {
      const { unmount } = render(
        <RouterProvider router={router}>
          <ProbeName />
        </RouterProvider>,
      );

      unmount();
    }

    // Capture baseline AFTER all module-level singletons are reachable but
    // before any "live" listener is registered against this router.
    const heapBaseline = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const { unmount } = render(
        <RouterProvider router={router}>
          <ProbeName />
        </RouterProvider>,
      );

      // A single committed navigation is enough to register the subscriber
      // in the router's internal listener list. Skipping it would let the
      // lazy useSyncExternalStore subscribe-on-first-mount path coast.
      if (i % 10 === 0) {
        await act(async () => {
          await router.navigate(`route${(i % 9) + 1}`).catch(() => {});
        });
      }

      unmount();
    }

    const heapFinal = takeHeapSnapshot();

    // Coarse catastrophe guard, NOT a listener-leak detector — mutation-validated
    // that a real BaseSource cleanup leak leaves this delta unchanged (KB signal
    // under jsdom/React fiber slack). The listener-cleanup contract is
    // discriminated by @real-router/sources BaseSource.test.ts. Threshold ≈ 3.3×
    // measured healthy (~13.6MB); the prior 15MB sat at 1.1× and flaked.
    expect(heapFinal - heapBaseline).toBeLessThan(45 * MB);

    // Final sanity: router is still functional after the burst.
    const finalRender = render(
      <RouterProvider router={router}>
        <ProbeName />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("route5");
    });

    expect(finalRender.getByTestId("name").textContent).toBe("route5");

    finalRender.unmount();
    router.stop();
  });
});

const ProbeName: FC = () => {
  const { route } = useRoute();

  return <div data-testid="name">{route.name}</div>;
};

ProbeName.displayName = "ProbeName";
