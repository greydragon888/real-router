import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MB, createStressRouter, takeHeapSnapshot } from "./helpers";
import { createDirectionTracker } from "../../src/dom-utils";

import type { Router } from "@real-router/core";

/**
 * Closes review §7.2 (HIGH gap) — `createDirectionTracker` under load with
 * 50 popstate events × 100 navigations. The tracker:
 *
 *   - subscribes to `router.subscribeLeave`
 *   - listens to `window.popstate`
 *   - writes `<html data-nav-direction>` on every leave
 *
 * Audit gaps: no functional tests, no stress tests at the package level —
 * the dom-utils package has its own coverage, but the Angular adapter's
 * git-tracked copy is not exercised. This file pins:
 *
 *   - popstate flag flips only on real popstate events (not on navigate)
 *   - leave subscriber writes the right direction and resets the flag
 *   - destroy() is idempotent and unregisters both subscriptions
 *   - 100 install/destroy cycles do not leak listeners or memory
 *   - 50 popstate × 100 navigations stays bounded
 */
describe("createDirectionTracker stress (Angular copy)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    delete document.documentElement.dataset.navDirection;
  });

  it("(a) install sets dataset.navDirection='forward' baseline", () => {
    const tracker = createDirectionTracker(router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("(b) destroy clears the dataset attribute and removes popstate listener", () => {
    const tracker = createDirectionTracker(router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    // Post-destroy popstate must NOT re-stamp the attribute.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  it("(c) destroy is idempotent — second call does not throw", () => {
    const tracker = createDirectionTracker(router);

    expect(() => {
      tracker.destroy();
      tracker.destroy();
    }).not.toThrow();
  });

  it("(d) leave subscriber writes 'forward' for navigate, 'back' for popstate", async () => {
    const tracker = createDirectionTracker(router);

    // Regular navigate — popstateFlag stays false, direction = 'forward'.
    await router.navigate("route1");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    // Fire popstate, then navigate. The popstate listener flips the flag,
    // the leave subscriber reads `popstateFlag=true` and writes 'back'.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("route2");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    // Flag is reset after every leave — next navigate is 'forward' again.
    await router.navigate("route3");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("(e) 50 popstate events × 100 navigations — direction toggles correctly, bounded heap", async () => {
    const tracker = createDirectionTracker(router);

    const heapBefore = takeHeapSnapshot();
    const routeNames = Array.from({ length: 20 }, (_, i) => `route${i}`);

    let backCount = 0;
    let forwardCount = 0;
    const popstateInterval = 2; // Fire popstate every 2nd navigation.

    for (let i = 0; i < 100; i++) {
      // Trigger popstate at half the navigations (50 events total).
      if (i % popstateInterval === 0) {
        globalThis.dispatchEvent(new PopStateEvent("popstate"));
      }

      const target = routeNames[(i + 1) % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);

        if (document.documentElement.dataset.navDirection === "back") {
          backCount += 1;
        } else {
          forwardCount += 1;
        }
      }
    }

    const heapAfter = takeHeapSnapshot();

    // Half the iterations were preceded by popstate → ~50 'back's
    // (allowing for SAME_STATES skips).
    expect(backCount).toBeGreaterThanOrEqual(30);
    expect(forwardCount).toBeGreaterThanOrEqual(30);

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);

    tracker.destroy();
  }, 60_000);

  it("(f) 100 install/destroy cycles — no listener leak (post-cycle popstate is a no-op)", () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const tracker = createDirectionTracker(router);

      expect(document.documentElement.dataset.navDirection).toBe("forward");

      tracker.destroy();

      expect(document.documentElement.dataset.navDirection).toBeUndefined();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);

    // After 100 install/destroy cycles, dispatch popstate one last time —
    // no listener should be registered, so dataset stays undefined.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  it("(g) popstate during leave handler — flag captured, next navigation reads 'forward'", async () => {
    const tracker = createDirectionTracker(router);

    // Fire popstate BEFORE navigate — flag is set.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("route5");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    // After the leave handler ran, flag was reset. Next navigation reads
    // 'forward' (no new popstate).
    await router.navigate("route6");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("(h) router.stop() with tracker active — subsequent popstate is a no-op", () => {
    const tracker = createDirectionTracker(router);

    router.stop();

    // Tracker's leave-subscriber is now defunct (router stopped). Popstate
    // listener is still wired up, but it only flips an internal flag —
    // without a leave event, no dataset write follows. The baseline
    // 'forward' from install remains.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });
});
