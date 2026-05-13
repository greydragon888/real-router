import { render } from "@solidjs/testing-library";
import { afterEach, describe, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

/**
 * §7.2 audit scenario #10 — `scrollRestoration + rapid pushState`.
 *
 * Concern: scrollRestoration writes scroll position to `sessionStorage`
 * keyed by `(name, canonicalJson(params))` and reads on transitions. The
 * read is scheduled via `requestAnimationFrame` to wait for layout commit.
 * Under rapid navigation, multiple rAF callbacks could queue and race —
 * the wrong scroll position might land on the wrong route.
 *
 * Test approach: drive 200 rapid `router.navigate` calls with
 * `scrollRestoration: { mode: "restore" }`. rAF is stubbed to fire
 * synchronously (no real layout); the stress dimension is "does the
 * subscription/teardown survive without leaking listeners or storage
 * writes".
 */
describe("S1 — scrollRestoration + rapid pushState (§7.2 #10)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // Restore default history.scrollRestoration set by jsdom.
    history.scrollRestoration = "auto";
  });

  it("S1.1: 200 rapid navigations with scrollRestoration — no listener/storage leak", async () => {
    // Synchronous rAF — simulates instant layout commit so scroll-write
    // attempts fire deterministically during the stress loop.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });

    const router = createStressRouter(20);

    await router.start("/route0");

    const { unmount } = render(() => (
      <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
        <div />
      </RouterProvider>
    ));

    // sessionStorage in jsdom is a real Storage; track write count to ensure
    // it grows linearly (no exponential listener buildup).
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const heapBefore = takeHeapSnapshot();
    const ITERATIONS = 200;

    for (let i = 0; i < ITERATIONS; i++) {
      const target = `route${i % 19}`;

      await router.navigate(target).catch(() => {});
    }

    forceGC();

    const heapAfter = takeHeapSnapshot();
    const heapDelta = heapAfter - heapBefore;

    // Expectations:
    //   1. setItem was called per navigation (not per rAF, not per render-pass).
    //      Cap upper bound at 4× iterations: capture-on-leave + restore-on-arrive
    //      could legitimately fire twice; anything beyond 4× indicates a leak.
    expect(setItemSpy.mock.calls.length).toBeLessThan(ITERATIONS * 4);

    //   2. Heap stays bounded. 200 navigations writing scroll positions to
    //      sessionStorage should not exceed 20MB — actual growth in jsdom
    //      is dominated by Storage internals, not the scrollRestoration
    //      utility. A real rAF leak (e.g. recursive scheduling) would blow
    //      far past this.
    expect(heapDelta).toBeLessThan(20 * MB);

    setItemSpy.mockRestore();

    unmount();
    router.stop();
  }, 60_000);
});
