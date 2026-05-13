import { render } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRoute } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

import type { JSX } from "solid-js";

/**
 * §7.3 audit scenario #21 — `useRoute` throws when the router has no
 * active state (unstarted / stopped / disposed). Under stress: render N
 * components against a router that was stopped before mount, verify each
 * throws cleanly without leaking listeners or transition state.
 *
 * The gotcha is documented in CLAUDE.md:
 *   > useRoute() returns Accessor<{ route: State<P>; previousRoute?: State }> —
 *   > route is non-nullable. The hook throws if the router has no active
 *   > state (unstarted, stopped, disposed) at the point of subscription.
 *
 * Stress dimensions:
 *   1. 100 cycles of (stop + try-mount) — each throw must be the expected
 *      runtime error, not a TypeError / nullref / spurious wrapped error.
 *   2. Heap stable — no orphaned context bindings from failed mounts.
 *   3. Routers in the stopped state remain dispose-safe afterwards.
 */
function Consumer(): JSX.Element {
  useRoute();

  return <div data-testid="consumer" />;
}

describe("UR1 — useRoute throws on stopped router (§7.3 #21)", () => {
  it("UR1.1: 100 cycles of render-after-stop — every mount throws cleanly", async () => {
    const heapBefore = takeHeapSnapshot();
    let observedThrows = 0;
    let unexpectedThrowMessages = 0;

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(2);

      await router.start("/route0");

      // Stop BEFORE rendering — useRoute() will see no active state at
      // subscription time and must throw.
      router.stop();

      try {
        render(() => (
          <RouterProvider router={router}>
            <Consumer />
          </RouterProvider>
        ));
        // Reaching here is the regression — useRoute did not throw.
        unexpectedThrowMessages++;
      } catch (error) {
        observedThrows++;

        // The throw message MUST mention useRoute and lifecycle hint —
        // catching the documented contract.
        const message =
          error instanceof Error ? error.message : String(error);

        if (
          !message.includes("useRoute") ||
          !/no active route|stopped|disposed|unstarted/i.test(message)
        ) {
          unexpectedThrowMessages++;
        }
      }
    }

    expect(observedThrows).toBe(100);
    expect(unexpectedThrowMessages).toBe(0);

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // 100 failed mounts × disposed routers should leave no residual heap.
    // A leak (e.g. provider context retained on error path) would inflate
    // beyond this budget.
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);
  }, 60_000);

  it("UR1.2: alternating start/stop with mount attempts — throw vs success match router state", async () => {
    const router = createStressRouter(2);

    let throws = 0;
    let mounts = 0;
    const unmounters: Array<() => void> = [];

    for (let i = 0; i < 50; i++) {
      // Odd cycles: stopped — must throw.
      // Even cycles: started — must mount.
      if (i % 2 === 0) {
        await router.start("/route0");

        try {
          const { unmount } = render(() => (
            <RouterProvider router={router}>
              <Consumer />
            </RouterProvider>
          ));

          mounts++;
          unmounters.push(unmount);
        } catch {
          throws++;
        }

        // Unmount + stop to prepare for odd cycle.
        unmounters.pop()?.();
        router.stop();
      } else {
        // Router is already stopped from previous even cycle.
        try {
          render(() => (
            <RouterProvider router={router}>
              <Consumer />
            </RouterProvider>
          ));
          mounts++;
        } catch {
          throws++;
        }
      }
    }

    // 25 even cycles (started) → 25 mounts; 25 odd cycles (stopped) → 25 throws.
    expect(mounts).toBe(25);
    expect(throws).toBe(25);
  }, 60_000);
});
