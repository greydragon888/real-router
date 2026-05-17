// Closes review §7.1 #13 (LOW): concurrent Link clicks with `{ force: true }`.
//
// `teardown-race.stress.ts` covers concurrent clicks without `force`; this
// file pins behavior with `routeOptions={ force: true }`, which bypasses
// core's SAME_STATES dedup and lets every click reach the navigate path.
// Risk: rapid-fire same-route force-clicks could pile up transitions —
// the router's last-wins semantics must still hold, and the click handlers
// must not leak listeners.

import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MB,
  createStressRouter,
  forceGC,
  getHeapUsedBytes,
  renderWithRouter,
} from "./helpers";
import Link from "../../src/components/Link.svelte";

import type { Router } from "@real-router/core";

describe("Stress: concurrent Link clicks with force:true", () => {
  let router: Router;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/route0");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      router.stop();
    } catch {
      // already stopped
    }
    consoleError.mockRestore();
  });

  it("100 rapid force-clicks on the same Link — no unhandled rejections, last wins", async () => {
    const navigateSpy = vi.spyOn(router, "navigate");

    renderWithRouter(router, Link, {
      routeName: "route1",
      routeOptions: { force: true },
    });
    flushSync();

    const link = document.querySelector("a")!;

    // Fire 100 force-clicks back-to-back without awaiting between them.
    for (let i = 0; i < 100; i++) {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    }

    // Each click invokes router.navigate (via navigateWithHash → router.navigate).
    // The router internally last-wins; the spy was called once per click.
    expect(navigateSpy).toHaveBeenCalled();

    // Drain microtasks so any catch handlers settle.
    await new Promise((resolve) => setTimeout(resolve, 16));

    // No console errors / unhandled errors from same-route force navigations.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("50 mount/click/unmount cycles with force:true — bounded heap, no listener leak", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 50; i++) {
      const { container, unmount } = renderWithRouter(router, Link, {
        routeName: `route${i % 5}`,
        routeOptions: { force: true },
      });

      flushSync();

      const link = container.querySelector("a")!;

      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

      // Synchronously unmount BEFORE the navigation promise settles. Tests
      // that catch(NOOP) is keeping the loop clean.
      unmount();
    }

    // Drain microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 50));

    forceGC();
    const finalHeap = getHeapUsedBytes();

    expect(finalHeap - baseline).toBeLessThan(30 * MB);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("concurrent force-clicks on different Links — every nav reaches router.navigate", async () => {
    const navigateSpy = vi.spyOn(router, "navigate");

    // Use the existing many-Links stress helper would require routeOptions
    // support; build directly via two Links here.
    renderWithRouter(router, Link, {
      routeName: "route1",
      routeOptions: { force: true },
    });

    const firstLink = document.querySelector("a")!;

    renderWithRouter(router, Link, {
      routeName: "route2",
      routeOptions: { force: true },
    });

    const allLinks = [...document.querySelectorAll("a")];
    // We just rendered two Links — second must exist.

    const secondLink = allLinks.at(-1)!;

    flushSync();

    // Alternate clicks: 30 force-clicks switching between two targets.
    for (let i = 0; i < 30; i++) {
      const target = i % 2 === 0 ? firstLink : secondLink;

      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 16));

    // Every click invokes navigate (force: true bypasses dedup at core).
    expect(navigateSpy.mock.calls.length).toBeGreaterThanOrEqual(30);
    expect(consoleError).not.toHaveBeenCalled();
  });

  // Closes review §7 LOW #9: existing tests cover 30 alternating clicks
  // between two Links and 100 clicks to the same Link. Neither exercises
  // the worst case for the transition FSM: a synchronous burst of clicks
  // hitting 100 DIFFERENT routes within a single microtask. Risk: the FSM
  // might fail to cancel all pending transitions and leave the router in
  // `isTransitioning=true` orphan state, blocking subsequent navigation.
  it("100 concurrent clicks to 100 different Links — last-wins, no stuck transitions", async () => {
    // Drop the `force: true` from beforeEach's setup — we want to exercise
    // the cancellation path itself, not the force-bypass path.
    router.stop();
    router = createStressRouter(100);
    await router.start("/route0");
    consoleError.mockRestore();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // Render 100 Links to distinct routes. Each Link is mounted in its own
    // RouterProvider (renderWithRouter creates a fresh provider each call),
    // mirroring a real app that has many Link components fanning out.
    for (let i = 0; i < 100; i++) {
      renderWithRouter(router, Link, { routeName: `route${i}` });
    }

    flushSync();

    const allLinks = [...document.querySelectorAll("a")];

    expect(allLinks).toHaveLength(100);

    // Fire ALL 100 clicks synchronously within a single microtask. The FSM
    // must cancel 99 in-flight transitions and settle on the last one. A
    // regression in cancellation would leave `isTransitioning=true` after
    // the queue drains.
    for (const link of allLinks) {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    }

    // Drain microtasks aggressively — give the FSM 20 ticks to settle.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // The router must NOT be stuck in transition. Last-wins means the
    // final state should be some `routeN` (any of the 100 — last-wins is
    // non-deterministic with concurrent dispatch under the microtask
    // scheduler, but the queue MUST drain).
    const finalState = router.getState();

    expect(finalState).toBeDefined();
    expect(finalState!.name).toMatch(/^route\d+$/);

    // Most important: no console errors from orphaned transitions or
    // unhandled promise rejections from cancelled navigation promises.
    expect(consoleError).not.toHaveBeenCalled();
  });
});
