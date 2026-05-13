import { render } from "@solidjs/testing-library";
import { describe, it, expect, vi } from "vitest";

import {
  RouterProvider,
  useRouteEnter,
  useRouteExit,
} from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

import type { JSX } from "solid-js";

/**
 * §7.2 audit scenario #16 — `useRouteEnter`/`useRouteExit` под stress.
 *
 * Both hooks wrap router events with universal guards: abort + same-route
 * skip + latest-handler ref. Under 100+ rapid navigations, the guards
 * must:
 *   1. Fire the handler on every cross-route nav (no missed events).
 *   2. SKIP the handler on same-route navs (skipSameRoute: true default).
 *   3. Honor the AbortSignal — handler cleanup runs on cancellation.
 *   4. Not leak subscribeLeave listeners across the burst.
 */
function ProbeEnterExit(props: {
  readonly onEnter: () => void;
  readonly onExit: () => void;
}): JSX.Element {
  useRouteEnter(props.onEnter);
  useRouteExit(props.onExit);

  return <div />;
}

describe("E1 — useRouteEnter/useRouteExit under stress (§7.2 #16)", () => {
  it("E1.1: 150 cross-route navigations — enter+exit fire on each, no leak", async () => {
    const router = createStressRouter(20);

    await router.start("/route0");

    const enterSpy = vi.fn();
    const exitSpy = vi.fn();

    render(() => (
      <RouterProvider router={router}>
        <ProbeEnterExit onEnter={enterSpy} onExit={exitSpy} />
      </RouterProvider>
    ));

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 150;

    // Build a sequence that alternates routes — every nav is cross-route.
    for (let i = 0; i < ITERATIONS; i++) {
      const target = `route${(i + 1) % 19}`;

      await router.navigate(target);
    }

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // Both handlers must have fired exactly ITERATIONS times (no missed
    // events, no double-fires, no skipped same-route — every step IS
    // cross-route by construction).
    expect(enterSpy).toHaveBeenCalledTimes(ITERATIONS);
    expect(exitSpy).toHaveBeenCalledTimes(ITERATIONS);

    // Heap budget: 150 navs × 2 hooks → listener churn should be GC'd.
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);

    router.stop();
  }, 60_000);

  it("E1.2: 100 same-route navigations — both handlers SKIP (skipSameRoute default)", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    // Land on a route with params so we can re-navigate "same route" with
    // varying params — same-route detection in core uses (name, params)
    // tuple. To force `skipSameRoute` to engage we keep both identical.
    await router.navigate("users.view", { id: "1" });

    const enterSpy = vi.fn();
    const exitSpy = vi.fn();

    render(() => (
      <RouterProvider router={router}>
        <ProbeEnterExit onEnter={enterSpy} onExit={exitSpy} />
      </RouterProvider>
    ));

    // 100 forced same-route navigations — every transition is real
    // (force: true bypasses SAME_STATES), but the route name+params are
    // unchanged, so the hooks must skip via their internal guard. The
    // very first transition after mount may still fire once for
    // `useRouteEnter` (the hook's createEffect runs on mount-driven
    // `useRoute()` resolution); subsequent ones are guarded out.
    for (let i = 0; i < 100; i++) {
      await router.navigate("users.view", { id: "1" }, { force: true });
    }

    // skipSameRoute default = true → at most ONE fire (the initial
    // post-mount tick); the other 99 must be guarded. A 100× fire would
    // mean the guard is broken — that's the regression this catches.
    expect(enterSpy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(exitSpy.mock.calls.length).toBeLessThanOrEqual(1);

    router.stop();
  }, 60_000);

  it("E1.3: 100 mount/unmount cycles — no listener leak in subscribeLeave queue", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const enterSpy = vi.fn();
    const exitSpy = vi.fn();

    // Probe the internal subscribeLeave bookkeeping by spying. Each mount
    // should call `subscribeLeave` exactly once; each unmount should
    // unsubscribe. After 100 cycles, the active listener count must be 0
    // (proxied here as: a final cross-route nav fires neither spy).
    const subscribeLeaveSpy = vi.spyOn(router, "subscribeLeave");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <ProbeEnterExit onEnter={enterSpy} onExit={exitSpy} />
        </RouterProvider>
      ));

      unmount();
    }

    forceGC();

    // subscribeLeave was called exactly 100 times (once per mount).
    expect(subscribeLeaveSpy).toHaveBeenCalledTimes(100);

    // After all components unmounted, no hooks remain. A navigation now
    // must NOT trigger the spies (proves unsubscribe ran for every mount).
    enterSpy.mockClear();
    exitSpy.mockClear();

    await router.navigate("route1");

    expect(enterSpy).toHaveBeenCalledTimes(0);
    expect(exitSpy).toHaveBeenCalledTimes(0);

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);

    subscribeLeaveSpy.mockRestore();
    router.stop();
  }, 60_000);
});
