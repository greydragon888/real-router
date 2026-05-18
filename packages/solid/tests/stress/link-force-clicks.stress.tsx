import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

/**
 * §7.2 audit scenario #13 — Concurrent Link clicks с `{force: true}`.
 *
 * `<Link routeOptions={{ force: true }}>` bypasses core's `SAME_STATES`
 * guard, so every click triggers a real transition even when the target
 * route equals the current one. Concurrent clicks therefore stress:
 *   - FSM serialization (no deadlock when N clicks land in the same tick)
 *   - subscribeLeave + onTransitionSuccess plumbing under repeat fire
 *   - subscriber-list churn (createDismissableError, route source listeners)
 *
 * The Link click handler calls `navigateWithHash` which fires
 * `router.navigate(...).catch(() => {})`. Promises are intentionally
 * fire-and-forget — the test must NOT observe unhandled rejections from
 * back-pressured `SAME_STATES` rejections that the helper does not
 * suppress.
 */
describe("L1 — concurrent Link clicks with force:true (§7.2 #13)", () => {
  it("L1.1: 300 same-route force clicks — FSM stable, heap bounded", async () => {
    const router = createStressRouter(3);

    await router.start("/route0");

    render(() => (
      <RouterProvider router={router}>
        <Link
          routeName="route1"
          routeOptions={{ force: true }}
          data-testid="link"
        >
          Force
        </Link>
      </RouterProvider>
    ));

    const link = screen.getByTestId("link");

    // Navigate to the target ONCE so subsequent force-clicks become
    // same-route force-bypass cycles (the worst case for SAME_STATES).
    await router.navigate("route1");

    const heapBefore = takeHeapSnapshot();
    const CLICKS = 300;

    // Synchronously dispatch N click events back-to-back. Each schedules
    // a microtask (router.navigate is async). Settling the queue after
    // the loop verifies the FSM serialized them without deadlock.
    for (let i = 0; i < CLICKS; i++) {
      fireEvent.click(link);
    }

    // Drain the navigation promises. We do not await each call site (the
    // Link's `.catch(() => {})` already swallows rejections), but we must
    // tick the event loop so any scheduled work runs to completion.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // FSM still consistent: state is the force-target.
    expect(router.getState()?.name).toBe("route1");

    // Router still navigable to a sibling — proves the FSM wasn't locked.
    await router.navigate("route2");

    expect(router.getState()?.name).toBe("route2");

    // Heap budget: 300 navigation promises + transition events;
    // 15MB is generous, a real listener leak would dwarf it.
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);

    router.stop();
  }, 60_000);

  it("L1.2: 200 cross-route force clicks across 5 Links — all complete cleanly", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    render(() => (
      <RouterProvider router={router}>
        <Link
          routeName="route0"
          routeOptions={{ force: true }}
          data-testid="l-0"
        >
          0
        </Link>
        <Link
          routeName="route1"
          routeOptions={{ force: true }}
          data-testid="l-1"
        >
          1
        </Link>
        <Link
          routeName="route2"
          routeOptions={{ force: true }}
          data-testid="l-2"
        >
          2
        </Link>
        <Link
          routeName="route3"
          routeOptions={{ force: true }}
          data-testid="l-3"
        >
          3
        </Link>
        <Link
          routeName="route4"
          routeOptions={{ force: true }}
          data-testid="l-4"
        >
          4
        </Link>
      </RouterProvider>
    ));

    const links = [0, 1, 2, 3, 4].map((i) => screen.getByTestId(`l-${i}`));
    const CLICKS = 200;

    for (let i = 0; i < CLICKS; i++) {
      fireEvent.click(links[i % 5]);
    }

    // Drain — multiple ticks because each click queues a microtask chain.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    // Final state must be a real route (any of 0..4) — never undefined.
    const finalState = router.getState();

    expect(finalState).toBeDefined();
    expect(finalState?.name).toMatch(/^route[0-4]$/);

    router.stop();
  }, 60_000);
});
