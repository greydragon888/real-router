// Closes review-2026-05-10 §5.5 ⚠ КРИТИЧНО — `direction-tracker.ts` is
// publicly exported from `dom-utils/index.ts` (`createDirectionTracker`,
// `DirectionTracker`) and the Angular package needs its own pin-tests:
//
//   - `src/dom-utils/direction-tracker.ts` is a COPY (not a symlink) —
//     drift between shared/ and angular/ would not surface without local
//     tests.
//   - The audit's `vitest.config.mts` exclude list omits this file
//     from coverage thresholds; this test file makes the exclusion
//     unnecessary by exercising every line.
//
// ⚑ Driven by a REAL router (#1924). The tracker resolves the instance in
// core's internals registry to observe the transition lifecycle, so a
// `subscribeLeave`-shaped fake is not a router as far as it is concerned — and
// the fake could not produce the arc the flag's lifetime turns on, a navigation
// core REFUSES.

import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDirectionTracker } from "../../src/dom-utils";

import type { Router } from "@real-router/core";

async function makeRouter(): Promise<Router> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "contacts", path: "/contacts" },
  ]);

  await router.start("/");

  return router;
}

describe("createDirectionTracker (Angular dom-utils copy)", () => {
  afterEach(() => {
    delete document.documentElement.dataset.navDirection;
    vi.restoreAllMocks();
  });

  // Audit gap #3: SSR (`typeof document === "undefined"`) → NOOP.
  it("SSR guard: returns no-op when document is undefined", async () => {
    const router = await makeRouter();
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });

    try {
      const tracker = createDirectionTracker(router);

      // NOOP_INSTANCE has a `destroy` function but subscribes to nothing.
      expect(tracker.destroy).toBeTypeOf("function");
      expect(() => {
        tracker.destroy();
      }).not.toThrow();
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
    }

    // With the document back, a real navigation proves nothing was wired: the
    // NOOP never took a leave subscription, so the attribute stays absent.
    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  // Audit gap #1: normal forward navigation → "forward".
  it("baseline: writes data-nav-direction='forward' on install", async () => {
    const router = await makeRouter();

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    const tracker = createDirectionTracker(router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("forward navigation (no popstate before leave) → keeps 'forward'", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  // Audit gap #2: popstate → "back".
  // Audit gap #7: popstate flag reset after leave (next nav reads 'forward').
  it("popstate → next leave writes 'back', then resets to 'forward' on subsequent leave", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    // Flag was reset inside the leave handler → next leave defaults to
    // 'forward' until another popstate sets the flag again.
    await router.navigate("home");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  // Audit gap #4: destroy clears dataset.
  // Audit gap #5: destroy removes popstate listener.
  it("destroy() clears dataset attribute + removes popstate listener + unsubscribes from router", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    // Post-destroy popstate must NOT touch the dataset (listener removed).
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    // Post-destroy leave is a no-op for the tracker (subscribeLeave
    // unsubscribed) — dataset stays cleared.
    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  // Audit gap #6: popstate listener-ordering vs browserPlugin.
  // The tracker's `addEventListener("popstate", ...)` is added FIRST (during
  // install). Per spec, popstate listeners fire in registration order. To
  // beat a competing listener (e.g. browser-plugin's own popstate handler
  // that synchronously fires subscribeLeave), the tracker MUST be installed
  // BEFORE `router.usePlugin(browserPluginFactory())` in user code.
  it("listener-ordering: tracker's popstate listener fires before competing listeners registered later", async () => {
    const router = await makeRouter();
    let directionAtCompetingTime: string | undefined;
    const tracker = createDirectionTracker(router);

    // A competing listener registered AFTER the tracker, standing in for the
    // plugin's own handler. With no deactivation guard the pipeline reaches
    // its leave phase synchronously, so the attribute is already written when
    // this reads it — and it reads 'back' only because the tracker's listener
    // ran first.
    const competingListener = (): void => {
      void router.navigate("about");
      directionAtCompetingTime = document.documentElement.dataset.navDirection;
    };

    globalThis.addEventListener("popstate", competingListener);

    try {
      globalThis.dispatchEvent(new PopStateEvent("popstate"));

      expect(directionAtCompetingTime).toBe("back");
    } finally {
      globalThis.removeEventListener("popstate", competingListener);
      tracker.destroy();
    }
  });

  // Audit gap #8: successive leaves + popstate. Each leave reads the flag
  // exactly once, then resets it.
  it("successive leaves + popstate: each leave reads then resets the flag", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);
    const directionsObserved: (string | undefined)[] = [];

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("about");
    directionsObserved.push(document.documentElement.dataset.navDirection);

    await router.navigate("contacts");
    directionsObserved.push(document.documentElement.dataset.navDirection);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("home");
    directionsObserved.push(document.documentElement.dataset.navDirection);

    await router.navigate("about");
    directionsObserved.push(document.documentElement.dataset.navDirection);

    expect(directionsObserved).toStrictEqual([
      "back",
      "forward",
      "back",
      "forward",
    ]);

    tracker.destroy();
  });

  // Audit gap #8 (variant): popstate FIRES DURING a leave handler — the flag
  // must be captured for the NEXT leave, not the one running.
  it("popstate during in-flight leave → flag captured for the NEXT leave, not the current one", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);
    let armed = false;

    const offLeave = router.subscribeLeave(() => {
      if (!armed) {
        armed = true;
        globalThis.dispatchEvent(new PopStateEvent("popstate"));
      }
    });

    // The tracker's own leave subscriber was registered first, so it reads the
    // flag before this one arms it.
    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    await router.navigate("home");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    offLeave();
    tracker.destroy();
  });

  // Audit gap #9: Idempotent destroy.
  it("double destroy() is safe (idempotent) — second call no-ops", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    tracker.destroy();

    expect(() => {
      tracker.destroy();
    }).not.toThrow();

    // After double destroy, dataset still cleared and no navigation revives it.
    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  // Additional Angular-specific defensive check: popstate event dispatched
  // BEFORE any leave fires — the flag is set but the dataset still reads
  // 'forward' (set at install time). The first leave then writes 'back'.
  it("popstate before any leave → dataset stays 'forward' (install baseline) until leave fires", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    // Dataset unchanged — the popstate handler only flips an internal
    // flag, doesn't touch dataset directly.
    expect(document.documentElement.dataset.navDirection).toBe("forward");

    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    tracker.destroy();
  });

  // Defensive: multiple popstate events before one leave → still 'back'
  // (flag is a single boolean, not a counter; idempotent set-to-true).
  it("multiple popstate events before single leave → single 'back' write (flag is boolean)", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    // Next leave reads the consumed-and-reset flag → 'forward'.
    await router.navigate("home");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  // ⚑ A popstate the router does not consume SPENDS its flag on the refusal
  // (#1924). It is armed by ANY popstate on `globalThis`, so `history.back()`
  // onto an entry resolving to the current state — the arc a URL plugin turns
  // into a navigation core answers `SAME_STATES` — would otherwise stay armed
  // indefinitely and publish the next FORWARD navigation as "back".
  it("a popstate that produces no transition does not mislabel the next navigation", async () => {
    const router = await makeRouter();
    const tracker = createDirectionTracker(router);

    try {
      globalThis.dispatchEvent(new PopStateEvent("popstate"));

      await expect(router.navigate("home")).rejects.toMatchObject({
        code: "SAME_STATES",
      });

      await router.navigate("about");

      expect(document.documentElement.dataset.navDirection).toBe("forward");
    } finally {
      tracker.destroy();
    }
  });
});
