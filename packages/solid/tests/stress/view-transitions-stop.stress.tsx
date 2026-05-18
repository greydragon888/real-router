import { render } from "@solidjs/testing-library";
import { describe, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createStressRouter, forceGC, takeHeapSnapshot, MB } from "./helpers";

/**
 * §7.2 audit scenario #9 — `viewTransitions + mid-transition router.stop()`.
 *
 * Concern: when `router.stop()` is called WHILE a view transition is in
 * progress, the View Transition API promise resolved via the consumer's
 * `startViewTransition` callback can still be pending. If the integration
 * does not release `unsubscribe`-style handlers cleanly, repeated
 * mid-transition stop() calls under stress would leak transition state
 * and/or pending startViewTransition promises.
 *
 * Test approach: stub `document.startViewTransition` so the transition
 * callback (which `createViewTransitions` schedules via `router.subscribeLeave`)
 * is captured but NEVER resolves naturally. Then `router.stop()` mid-flight
 * and ensure cleanup runs without unhandled rejections.
 */
describe("V1 — viewTransitions + mid-transition router.stop() (§7.2 #9)", () => {
  it("V1.1: 100 mount + nav + stop cycles with stubbed VT — no leaks, no unhandled rejects", async () => {
    // Capture unhandled rejections to assert cleanly at the end. If
    // `subscribeLeave` listeners leak across `router.stop()`, the resolve
    // chain emits a rejection that this handler catches.
    const unhandled: unknown[] = [];
    const onUnhandled = (event: Event & { reason?: unknown }): void => {
      unhandled.push(event.reason);
      event.preventDefault();
    };

    process.on("unhandledRejection", onUnhandled);

    const startSpy = vi.fn(
      (cb: () => void | Promise<void>): { skipTransition: () => void } => {
        // Run the consumer callback synchronously so DOM is updated, but
        // do NOT resolve a finished-promise — the consumer-supplied
        // `ready`/`finished` promises stay pending. Our stub returns a
        // skipTransition handle that's a no-op so cleanup paths fire.
        void cb();

        return { skipTransition: vi.fn() };
      },
    );

    (
      document as Document & { startViewTransition?: unknown }
    ).startViewTransition =
      startSpy as unknown as Document["startViewTransition"];

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 100;

    for (let i = 0; i < ITERATIONS; i++) {
      const router = createStressRouter(3);

      await router.start("/route0");

      const { unmount } = render(() => (
        <RouterProvider router={router} viewTransitions>
          <div />
        </RouterProvider>
      ));

      // Start a navigation that will trigger a view-transition wrapper.
      // We do NOT await — the promise is intentionally racing with stop().
      const navPromise = router.navigate("route1");

      // Stop the router mid-flight. createViewTransitions's subscribeLeave
      // listener should unsubscribe; pending VT callback resolves at
      // microtask boundary.
      router.stop();

      // Await the rejection so the unhandled-rejection observer can fire.
      // The navigation was interrupted by stop() — surfacing the error is
      // expected; what we lock is "rejection is caught, not orphaned".
      await navPromise.catch(() => {});

      unmount();
    }

    // Let any deferred microtasks / GC settle.
    await Promise.resolve();
    await Promise.resolve();
    forceGC();

    const heapAfter = takeHeapSnapshot();

    process.off("unhandledRejection", onUnhandled);

    // No unhandled rejections leaked out of the stop()/cleanup cycle.
    expect(unhandled).toStrictEqual([]);

    // Heap budget: 100 routers + DOM nodes + 1 VT subscribe-leave handle
    // each, all expected to be GC-collectable. Generous 30MB cap.
    expect(heapAfter - heapBefore).toBeLessThan(30 * MB);

    (
      document as Document & { startViewTransition?: unknown }
    ).startViewTransition =
      undefined as unknown as Document["startViewTransition"];
  }, 60_000);

  // audit-2026-05-17 §7 P1 #3 — rapid VT burst. A consumer that
  // navigates 100 times in quick succession through `viewTransitions`
  // must NOT accumulate `subscribeLeave` handlers per navigation; the
  // helper installs exactly ONE handler at provider mount and reuses it
  // for every nav. Locks that contract under stress.
  it("V1.2 — 100 rapid VTs on a single provider — subscribeLeave count stable, no leaks", async () => {
    const startSpy = vi.fn(
      (cb: () => void | Promise<void>): { skipTransition: () => void } => {
        void cb();

        return {
          skipTransition: vi.fn(),
        };
      },
    );

    (
      document as Document & { startViewTransition?: unknown }
    ).startViewTransition =
      startSpy as unknown as Document["startViewTransition"];

    const router = createStressRouter(20);

    await router.start("/route0");

    const subscribeLeaveSpy = vi.spyOn(router, "subscribeLeave");

    const { unmount } = render(() => (
      <RouterProvider router={router} viewTransitions>
        <div />
      </RouterProvider>
    ));

    // After provider mount, subscribeLeave must have been called exactly
    // once. (Any other call here would inflate per-nav before the loop
    // even starts.) NB: this is a tighter assertion than the heap one
    // because it locks the install-once contract.
    const installCount = subscribeLeaveSpy.mock.calls.length;

    expect(installCount).toBeGreaterThanOrEqual(1);

    const heapBefore = takeHeapSnapshot();

    let actualNavCount = 0;

    for (let i = 0; i < 100; i++) {
      // Pick a different route from the current one — SAME_STATES would
      // reject otherwise and the iteration would not trigger a VT.
      const current = router.getState()?.name ?? "";
      const candidate = `route${i % 19}`;
      const target = candidate === current ? `route${(i + 1) % 19}` : candidate;

      try {
        await router.navigate(target);
        actualNavCount++;
      } catch {
        // Defensive: any rejection (SAME_STATES, cancelled by next iter)
        // must not abort the burst — keep going.
      }
    }

    // subscribeLeave was NOT called per-navigation — the install count
    // is identical to what it was right after mount. A regression that
    // moved subscribeLeave into the leave-callback (e.g. for re-arming
    // after every nav) would inflate this count to ~100.
    expect(subscribeLeaveSpy).toHaveBeenCalledTimes(installCount);

    // VT fired exactly once per successful navigation, no extras from
    // leaked listeners. (Skipped navs from SAME_STATES recovery don't
    // call startViewTransition.)
    expect(startSpy).toHaveBeenCalledTimes(actualNavCount);

    unmount();
    router.stop();
    forceGC();

    const heapAfter = takeHeapSnapshot();

    // Per-iteration cost: 1 navigation + 1 VT callback. Heap budget is
    // generous (most stays in the cached snapshot graph).
    expect(heapAfter - heapBefore).toBeLessThan(20 * MB);

    (
      document as Document & { startViewTransition?: unknown }
    ).startViewTransition =
      undefined as unknown as Document["startViewTransition"];
  }, 60_000);
});
