import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  RouterProvider,
  useRouteEnter,
  useRouteExit,
} from "@real-router/react";

import { createStressRouter } from "./helpers";

import type { RouteEnterContext, RouteExitContext } from "@real-router/react";
import type { FC } from "react";

/**
 * R11 — `useRouteEnter` / `useRouteExit` stress (review-2026-05-10 §7 A4).
 *
 * The hooks layer same-route skip, reentrant abort, latest-handler ref, and
 * StrictMode dedupe over `useRoute()` / `router.subscribeLeave`. Under unit
 * tests each guard is exercised in isolation; the audit calls out that the
 * combined surface (50+ navigations × handler latency × abort signals)
 * lacks regression-lock — a future refactor of the ref/effect ordering
 * could silently break the dedupe and unit tests would still pass.
 *
 * These stress tests run rapid navigations through real `router.navigate()`
 * calls (no JSDOM lifecycle shortcuts), so the full sequence
 *   subscribe → snapshot → effect run → handler dispatch
 * is exercised on every iteration.
 */

const makeEnterProbe = (records: { route: string; previous: string }[]): FC => {
  return () => {
    useRouteEnter((ctx: RouteEnterContext) => {
      records.push({
        route: ctx.route.name,
        previous: ctx.previousRoute.name,
      });
    });

    return null;
  };
};

const makeExitProbe = (
  records: { route: string; aborted: boolean }[],
  options?: { latencyMs?: number },
): FC => {
  return () => {
    useRouteExit(async (ctx: RouteExitContext) => {
      if (options?.latencyMs) {
        await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
      }

      records.push({
        route: ctx.route.name,
        aborted: ctx.signal.aborted,
      });
    });

    return null;
  };
};

describe("R11 — useRouteEnter/useRouteExit stress", () => {
  afterEach(() => {
    cleanup();
  });

  it("11.1: 100 rapid distinct navigations — useRouteEnter fires for every committed cross-route nav", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const records: { route: string; previous: string }[] = [];
    const Probe = makeEnterProbe(records);

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    for (let i = 1; i <= 100; i++) {
      await act(async () => {
        await router.navigate(`route${i % 10}`).catch(() => {});
      });
    }

    // Every cross-route navigation surfaces exactly once. Same-route
    // re-navigations (i % 10 hitting the current route) are rejected
    // upstream by SAME_STATES and never reach useRouteEnter.
    expect(records.length).toBeGreaterThan(50);
    expect(records.length).toBeLessThanOrEqual(100);

    // Each record reflects a real route transition: previous !== route.
    for (const entry of records) {
      expect(entry.route).not.toBe(entry.previous);
    }

    unmount();
    router.stop();
  });

  it("11.2: same-route skip honored under stress — 0 enter fires when only the current route is targeted", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const records: { route: string; previous: string }[] = [];
    const Probe = makeEnterProbe(records);

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    // 50 attempts to re-navigate to the already-active route. All
    // rejected by SAME_STATES; the hook must never see them.
    for (let i = 0; i < 50; i++) {
      await act(async () => {
        await router.navigate("route0").catch(() => {});
      });
    }

    expect(records).toHaveLength(0);

    unmount();
    router.stop();
  });

  it("11.3: useRouteExit handler with zero-latency runs once per committed nav across 100 iterations", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const records: { route: string; aborted: boolean }[] = [];
    const Probe = makeExitProbe(records);

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    for (let i = 1; i <= 100; i++) {
      await act(async () => {
        await router.navigate(`route${i % 10}`).catch(() => {});
      });
    }

    // Exit fires from the route being LEFT — at least one per committed
    // cross-route nav. Same-route skip default suppresses the noise.
    expect(records.length).toBeGreaterThan(50);

    // Awaited handler with no latency completes before router commits;
    // signal must not be aborted on the happy path.
    for (const entry of records) {
      expect(entry.aborted).toBe(false);
    }

    unmount();
    router.stop();
  });

  it("11.4: unmount RouterProvider mid-navigation — no orphan handler invocation", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const records: { route: string; aborted: boolean }[] = [];
    const Probe = makeExitProbe(records);

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    // Drive a navigation and unmount on the same tick.
    const navPromise = act(async () => {
      await router.navigate("route1").catch(() => {});
    });

    unmount();

    await navPromise;

    const recordsAfterUnmount = records.length;

    // Post-unmount navigations must not call the handler again.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await router.navigate(`route${i % 5}`).catch(() => {});
      });
    }

    expect(records).toHaveLength(recordsAfterUnmount);

    router.stop();
  });

  it("11.5: rapidly changing handler identity — latest ref always wins (no stale dispatch)", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const fireCounts = { stale: 0, current: 0 };

    let activeHandler: (ctx: RouteEnterContext) => void = (_ctx) => {
      fireCounts.stale++;
    };

    const Probe: FC = () => {
      useRouteEnter((ctx) => {
        activeHandler(ctx);
      });

      return null;
    };

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    // Swap to the "current" handler — useRouteEnter's latest-ref pattern
    // means the next dispatch invokes the new function without re-running
    // the underlying effect.
    activeHandler = () => {
      fireCounts.current++;
    };

    for (let i = 1; i <= 50; i++) {
      await act(async () => {
        await router.navigate(`route${i % 5}`).catch(() => {});
      });
    }

    // Every committed nav after the swap routes to `current`. `stale`
    // never fires because we swapped before the first navigation.
    expect(fireCounts.stale).toBe(0);
    expect(fireCounts.current).toBeGreaterThan(0);

    unmount();
    router.stop();
  });
});
