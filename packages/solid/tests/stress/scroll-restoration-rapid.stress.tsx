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

  // §7.2 audit scenario G4 — pagehide listener leak when router.stop()
  // is called WITHOUT unmounting the RouterProvider first.
  //
  // `createScrollRestoration` registers `addEventListener("pagehide", …)`
  // on `globalThis`. Destroy unregisters it, but the helper's destroy
  // path is only invoked via the provider's `onCleanup` (component
  // unmount). If a consumer calls `router.stop()` without unmount,
  // the pagehide listener is orphaned on window for the rest of the
  // page lifetime — invisible to users but compounding in micro-frontend
  // shells that swap routers without tearing down the React/Solid tree.
  it("S2 — N router.stop() without unmount → pagehide listeners growth (documented leak)", async () => {
    vi.stubGlobal("requestAnimationFrame", ((cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    }) as typeof globalThis.requestAnimationFrame);

    const addEventListenerSpy = vi.spyOn(globalThis, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(globalThis, "removeEventListener");

    const ITERATIONS = 20;
    const cleanupHandles: (() => void)[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const router = createStressRouter(5);

      await router.start("/route0");

      const { unmount } = render(() => (
        <RouterProvider router={router} scrollRestoration={{}}>
          <div />
        </RouterProvider>
      ));

      // ANTI-PATTERN: stop router without unmounting the provider.
      // pagehide listener stays attached to globalThis until either
      // the unmount fires (which we delay) OR the test cleanup runs.
      router.stop();
      cleanupHandles.push(unmount);
    }

    // Count "pagehide" registrations across all iterations.
    const pagehideAdds = addEventListenerSpy.mock.calls.filter(
      ([type]) => type === "pagehide",
    ).length;
    const pagehideRemoves = removeEventListenerSpy.mock.calls.filter(
      ([type]) => type === "pagehide",
    ).length;

    // Document the leak: adds outpace removes when stop() is called
    // without unmount. This is the captured behaviour — a future fix
    // that ties listener cleanup to router lifecycle (instead of only
    // provider unmount) would close the gap and flip this assertion.
    expect(pagehideAdds).toBeGreaterThanOrEqual(ITERATIONS);
    // Removes happen only on `unmount`; since none have been called yet,
    // we expect 0 removes at this point.
    expect(pagehideRemoves).toBe(0);

    // Now cleanup all providers — listeners should drain.
    for (const unmount of cleanupHandles) {
      unmount();
    }

    forceGC();

    const pagehideRemovesAfterCleanup =
      removeEventListenerSpy.mock.calls.filter(
        ([type]) => type === "pagehide",
      ).length;

    // After unmount, every pagehide listener must be released. If the
    // unmount path leaks (component disposed but listener stuck), this
    // assertion catches it.
    expect(pagehideRemovesAfterCleanup).toBeGreaterThanOrEqual(ITERATIONS);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  }, 60_000);
});
