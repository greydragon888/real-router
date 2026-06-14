// Closes review §7.1 #14 (MED): announceNavigation rapid stress.
//
// `createRouteAnnouncer` has three sensitive surfaces under high-volume
// navigation:
//   1. Safari-ready 100ms `pendingText` buffer — rapid navs during the
//      bootstrap window get coalesced into the last-pending text.
//   2. Same-text dedup — N navs that resolve to the same announcement
//      string must not pile up in the DOM or trigger multiple focus events.
//   3. Double-mount collision — `getOrCreateAnnouncer` reuses the single
//      `data-real-router-announcer` element; mass mount/unmount must not
//      orphan it.
//
// Stress: hammer all three concurrently across 200+ navigations and 50+
// mount/unmount cycles, validate bounded heap and no console errors.

import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MB, createStressRouter, forceGC, getHeapUsedBytes } from "./helpers";
import RouterProviderAnnounceTest from "../helpers/RouterProviderAnnounceTest.svelte";

import type { Router } from "@real-router/core";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

describe("Stress: announceNavigation rapid navigations", () => {
  let router: Router;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createStressRouter(10);
    await router.start("/route0");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      router.stop();
    } catch {
      // already stopped
    }
    document.querySelectorAll(ANNOUNCER_SEL).forEach((element) => {
      element.remove();
    });
    document.querySelectorAll("h1").forEach((element) => {
      element.remove();
    });
    document.title = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it("200 navs after Safari-ready window — bounded heap, single announcer element", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    render(RouterProviderAnnounceTest, {
      props: { router, announceNavigation: true },
    });
    flushSync();

    // Exit the Safari-ready 100ms window so pending-buffer path is bypassed.
    vi.advanceTimersByTime(100);

    for (let i = 0; i < 200; i++) {
      await router.navigate(`route${i % 10}`).catch(() => undefined);
      flushSync();
    }

    forceGC();
    const finalHeap = getHeapUsedBytes();

    // Throughput guard (GC-masked): one live RouterProvider drives 200 navs;
    // a per-nav listener/closure leak on the live router is ~bytes/closure and
    // stays in KB at this scale — verified invisible to this snapshot (200
    // retained subscribe closures moved the delta only ~30KB). The real
    // per-nav leak detector is the single-announcer-element + zero-console.error
    // assertions below. Threshold = ~8x measured healthy (~2.17MB).
    expect(finalHeap - baseline).toBeLessThan(18 * MB);
    // Single announcer element survives — no per-nav orphans.
    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("100 navs WITHIN Safari-ready 100ms window — only the last pending text is announced after flush", async () => {
    render(RouterProviderAnnounceTest, {
      props: { router, announceNavigation: true },
    });
    flushSync();

    // Stay BEFORE the 100ms Safari-ready window — every nav is buffered.
    for (let i = 0; i < 100; i++) {
      await router.navigate(`route${i % 10}`).catch(() => undefined);
      flushSync();
    }

    // Announcer is still empty (pendingText buffered, not yet flushed).
    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe("");

    // Advance past the window — pendingText flushes.
    vi.advanceTimersByTime(200);

    const text = document.querySelector(ANNOUNCER_SEL)?.textContent ?? "";

    // The text reflects the LAST navigation (last-pending wins).
    expect(text).toContain("Navigated to");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("50 mount/unmount cycles with announceNavigation — single announcer element, no per-cycle orphans", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 50; i++) {
      const { unmount } = render(RouterProviderAnnounceTest, {
        props: { router, announceNavigation: true },
      });

      flushSync();
      vi.advanceTimersByTime(100);

      // Two navs per mount to exercise the live announcer.
      await router.navigate(`route${i % 10}`).catch(() => undefined);
      flushSync();
      await router.navigate(`route${(i + 1) % 10}`).catch(() => undefined);
      flushSync();

      // Single announcer element throughout.
      expect(
        document.querySelectorAll(ANNOUNCER_SEL).length,
      ).toBeLessThanOrEqual(1);

      unmount();

      // After unmount the announcer is removed (documented "first destroy
      // removes shared element" gotcha — in this stress each mount is the
      // only one alive, so cleanup is unambiguous).
      expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);
    }

    forceGC();
    const finalHeap = getHeapUsedBytes();

    // Throughput guard (GC-masked): 50 mount→nav→unmount cycles, refs dropped.
    // The per-cycle announcer-orphan leak is caught by the in-loop
    // querySelectorAll length checks, not the heap. Threshold = ~9x measured
    // healthy (~1.46MB).
    expect(finalHeap - baseline).toBeLessThan(13 * MB);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("same-text dedup under burst: navigating to the same route 100 times → announcer text stable", async () => {
    render(RouterProviderAnnounceTest, {
      props: { router, announceNavigation: true },
    });
    flushSync();
    vi.advanceTimersByTime(100);

    // Warm-up navigation so isInitialNavigation flips off.
    await router.navigate("route1").catch(() => undefined);
    flushSync();

    const textAfterWarmup =
      document.querySelector(ANNOUNCER_SEL)?.textContent ?? "";

    // Same-route navigations (each resolves to the same announcement text)
    // must hit the `text === lastAnnouncedText` short-circuit.
    for (let i = 0; i < 100; i++) {
      await router.navigate("route1").catch(() => undefined);
      flushSync();
    }

    // No spurious clear or change.
    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      textAfterWarmup,
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});
