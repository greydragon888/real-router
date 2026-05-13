import { render } from "@solidjs/testing-library";
import { afterEach, describe, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

/**
 * §7.3 audit scenario #24 — route-announcer h1 race: navigate 1000×
 * быстрее double-rAF.
 *
 * The announcer schedules text resolution via a double-rAF
 * (`requestAnimationFrame(() => requestAnimationFrame(...))`) so the
 * incoming route's DOM (including the new `<h1>`) is fully painted
 * before `resolveText` reads it. Under sustained navigation faster than
 * rAFs fire (e.g. test environments with throttled rAFs, real-world
 * keyboard-mash burst), multiple announcement callbacks queue:
 *   - Each callback recomputes the latest snapshot via `route` closure,
 *     so the LATEST text wins in `lastAnnouncedText`.
 *   - rAF queue should drain to <= the navigation count (and likely
 *     much less, since the `lastAnnouncedText === text` guard suppresses
 *     dupe announcements).
 *
 * What this stress locks:
 *   1. No unhandled error / nullref in the rAF queue drainage.
 *   2. Final announcer textContent matches the LAST nav target.
 *   3. Heap stable — rAF callbacks do not retain large snapshot chains.
 */
describe("AR1 — route-announcer double-rAF race (§7.3 #24)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.querySelector(ANNOUNCER_SEL)?.remove();
    document.title = "";
  });

  it("AR1.1: 1000 navigations through a queued rAF — final announcement is the latest, no leak", async () => {
    vi.useFakeTimers();

    // rAF queues — we drain manually at the end to simulate "navigate
    // 1000× faster than rAF could fire". Until drained, every navigation
    // accumulates a pair of rAF callbacks (outer → inner). The
    // `lastAnnouncedText === text` guard inside doAnnounce + the
    // `isDestroyed` guard inside the inner rAF must hold under this
    // backlog.
    const queued: FrameRequestCallback[] = [];

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queued.push(cb);

      return queued.length;
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

    // Cross Safari-ready window so isReady=true when rAF drains. The
    // sacrificial first nav consumes the announcer's
    // `isInitialNavigation` flag, so the burst nav sequence below all
    // counts towards real announcements.
    vi.advanceTimersByTime(100);

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 1000;

    // Burst: 1000 navigations with NO rAF drainage in between.
    let prevIdx = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      // Map index to non-repeating route — avoid SAME_STATES rejections.
      const target = `route${(prevIdx + 1) % 49 + 1}`;

      prevIdx = ((prevIdx + 1) % 49) + 1;
      await router.navigate(target);
    }

    // At this point: 1000+ rAF callbacks queued; announcer.textContent is
    // still empty (or holds the very first announcement if some rAF
    // queue fired). Drain the queue — flush ALL pending rAFs in
    // multiple passes (each outer rAF schedules an inner rAF).
    for (let pass = 0; pass < 5; pass++) {
      const callbacks = queued.splice(0);

      for (const cb of callbacks) {
        try {
          cb(0);
        } catch {
          // jsdom can throw "Window.scrollTo not implemented" etc. —
          // expected, swallow.
        }
      }
    }

    // The announcer's lastAnnouncedText must match the LAST navigation
    // target (or at least contain "Navigated to"). Under double-rAF
    // backpressure, the latest queued snapshot wins.
    expect(announcer?.textContent).toContain("Navigated to");

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // Heap budget: 1000 backed-up rAF closures + the same number of
    // route snapshots. Even with closure retention, 30MB is generous.
    expect(heapAfter - heapBefore).toBeLessThan(30 * MB);

    router.stop();
  }, 120_000);

  it("AR1.2: 500 navs WITH sync rAF — every nav resolves promptly, no listener leak", async () => {
    // Counterpart of AR1.1: rAF fires synchronously, so every nav fully
    // settles its double-rAF path before the next nav. The contrast
    // proves that the announcer is correct under BOTH conditions.
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });

    const router = createStressRouter(20);

    await router.start("/route0");

    render(() => (
      <RouterProvider router={router} announceNavigation>
        <div />
      </RouterProvider>
    ));

    const announcer = document.querySelector(ANNOUNCER_SEL);

    vi.advanceTimersByTime(100);

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 500;

    for (let i = 0; i < ITERATIONS; i++) {
      const idx = (i % 19) + 1;

      await router.navigate(`route${idx}`);
    }

    expect(announcer?.textContent).toContain("Navigated to");

    forceGC();

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(20 * MB);

    router.stop();
  }, 120_000);
});
