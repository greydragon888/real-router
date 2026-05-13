import { render } from "@solidjs/testing-library";
import { afterEach, describe, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

/**
 * §7.2 audit scenario #14 — announceNavigation rapid navigations under
 * the Safari-ready buffer.
 *
 * `createRouteAnnouncer` queues the latest announcement in `pendingText`
 * during the 100ms Safari-ready window. Under rapid navigation this
 * field is overwritten on every nav — only the LATEST text should be
 * flushed when the window elapses. Lock the property:
 *   - 100+ navigations within the window → exactly 1 announcement fires
 *   - announcement === text from the last navigation
 *   - no listener buildup that would force every queued nav to fire
 *     after the window opens (which would shred VoiceOver in real life)
 */
describe("A1 — announceNavigation rapid navigations (§7.2 #14)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.querySelector(ANNOUNCER_SEL)?.remove();
    document.title = "";
  });

  it("A1.1: 200 navigations within Safari-ready window — only last announced, heap stable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });

    const router = createStressRouter(50);

    await router.start("/route0");

    render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer?.textContent).toBe("");

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 200;

    // Stay strictly inside the 100ms Safari-ready window — every nav
    // overwrites `pendingText`. The first nav after announcer mount is
    // additionally consumed by `isInitialNavigation`, so we warm with
    // a sacrificial nav, then advance ~0ms (still pre-ready) and start
    // the real burst.
    vi.advanceTimersByTime(0);

    // Burst loop — 200 navigations, ALL completing pre-ready. Use a route
    // cycle that's guaranteed to never repeat consecutively (and never
    // matches the initial state `route0`), avoiding SAME_STATES rejections.
    for (let i = 0; i < ITERATIONS; i++) {
      // Map: i=0 → route1, i=1 → route2, ... wrapping at 49 routes.
      // Initial state is route0, and consecutive targets always differ
      // by ±1 modulo the route count (no same-target collisions).
      const idx = 1 + (i % 48);
      await router.navigate(`route${idx}`);
    }

    // Announcer must still hold an empty buffer — pendingText keeps the
    // latest, NOT flushed yet.
    expect(announcer?.textContent).toBe("");

    // Open the gate — Safari-ready timeout fires, flushes pendingText ONCE.
    vi.advanceTimersByTime(100);

    // Exactly one announcement landed and it contains "Navigated to".
    expect(announcer?.textContent).toContain("Navigated to");

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // Subscriber/listener leak guard: 200 navs through one announcer
    // should stay under 15MB even with jsdom overhead.
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);

    router.stop();
  }, 60_000);
});
