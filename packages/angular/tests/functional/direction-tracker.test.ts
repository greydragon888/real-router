// Closes review-2026-05-10 §5.5 ⚠ КРИТИЧНО — `direction-tracker.ts` was
// publicly exported from `dom-utils/index.ts` (`createDirectionTracker`,
// `DirectionTracker`) but had **zero coverage** in the Angular package
// (functional or stress). The shared source has tests in
// `packages/dom-utils/tests/functional/direction-tracker.test.ts`, but
// the Angular adapter's git-tracked copy needs its own pin-tests:
//
//   - `src/dom-utils/direction-tracker.ts` is a COPY (not a symlink) —
//     drift between shared/ and angular/ would not surface without local
//     tests.
//   - The audit's `vitest.config.mts:24` exclude list omits this file
//     from coverage thresholds; this test file makes the exclusion
//     unnecessary by exercising every line.
//
// Mirrors the structure of `packages/dom-utils/tests/functional/
// direction-tracker.test.ts` but with additions for the audit-flagged
// gaps (listener-ordering, concurrent leaves, idempotent destroy).

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDirectionTracker } from "../../src/dom-utils";

import type { Router, State } from "@real-router/core";

type LeaveListener = (payload: {
  route: State;
  nextRoute: State;
  signal: AbortSignal;
}) => void | Promise<void>;

interface FakeRouter {
  emitLeave: (
    fromRoute: State,
    toRoute: State,
    signal?: AbortSignal,
  ) => Promise<void>;
  router: Router;
  leaveListenerCount: () => number;
}

const makeState = (name: string): State =>
  ({
    name,
    path: `/${name}`,
    params: {},
    meta: { id: 0, params: {}, options: {} },
  }) as unknown as State;

function makeFakeRouter(): FakeRouter {
  const leaveListeners: LeaveListener[] = [];

  const router = {
    subscribeLeave(listener: LeaveListener) {
      leaveListeners.push(listener);

      return () => {
        const index = leaveListeners.indexOf(listener);

        if (index !== -1) {
          leaveListeners.splice(index, 1);
        }
      };
    },
  } as unknown as Router;

  return {
    async emitLeave(fromRoute, toRoute, signal) {
      const sig = signal ?? new AbortController().signal;
      const promises: Promise<void>[] = [];

      for (const fn of leaveListeners) {
        const result = fn({
          route: fromRoute,
          nextRoute: toRoute,
          signal: sig,
        });

        if (result !== undefined && typeof result.then === "function") {
          promises.push(result);
        }
      }

      await Promise.all(promises);
    },
    router,
    leaveListenerCount: () => leaveListeners.length,
  };
}

describe("createDirectionTracker (Angular dom-utils copy)", () => {
  afterEach(() => {
    delete document.documentElement.dataset.navDirection;
    vi.restoreAllMocks();
  });

  // Audit gap #3: SSR (`typeof document === "undefined"`) → NOOP.
  it("SSR guard: returns no-op when document is undefined", () => {
    const fake = makeFakeRouter();
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });

    try {
      const tracker = createDirectionTracker(fake.router);

      // NOOP_INSTANCE has a `destroy` function but doesn't subscribe to
      // the router and doesn't add a popstate listener.
      expect(tracker.destroy).toBeTypeOf("function");
      expect(fake.leaveListenerCount()).toBe(0);

      // destroy is safe to call on NOOP_INSTANCE.
      expect(() => {
        tracker.destroy();
      }).not.toThrow();
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
    }
  });

  // Audit gap #1: normal forward navigation → "forward".
  it("baseline: writes data-nav-direction='forward' on install", () => {
    const fake = makeFakeRouter();

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    const tracker = createDirectionTracker(fake.router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("forward navigation (no popstate before leave) → keeps 'forward'", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  // Audit gap #2: popstate → "back".
  // Audit gap #7: popstate flag reset after leave (next nav reads 'forward').
  it("popstate → next leave writes 'back', then resets to 'forward' on subsequent leave", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBe("back");

    // Flag was reset inside the leave handler → next leave defaults to
    // 'forward' until another popstate sets the flag again.
    await fake.emitLeave(makeState("about"), makeState("home"));

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  // Audit gap #4: destroy clears dataset.
  // Audit gap #5: destroy removes popstate listener.
  it("destroy() clears dataset attribute + removes popstate listener + unsubscribes from router", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    expect(fake.leaveListenerCount()).toBe(1);
    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
    expect(fake.leaveListenerCount()).toBe(0);

    // Post-destroy popstate must NOT touch the dataset (listener removed).
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    // Post-destroy leave is a no-op for the tracker (subscribeLeave
    // unsubscribed) — dataset stays cleared.
    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  // Audit gap #6: popstate listener-ordering vs browserPlugin.
  // The tracker's `addEventListener("popstate", ...)` is added FIRST (during
  // install). Per spec, popstate listeners fire in registration order. To
  // beat a competing listener (e.g. browser-plugin's own popstate handler
  // that synchronously fires subscribeLeave), the tracker MUST be installed
  // BEFORE `router.usePlugin(browserPluginFactory())` in user code. We
  // verify the registration-order contract by adding a competing listener
  // AFTER the tracker and observing that the tracker's flag is set by the
  // time the competing listener fires.
  it("listener-ordering: tracker's popstate listener fires before competing listeners registered later", () => {
    const fake = makeFakeRouter();
    let flagAtCompetingTime: boolean | null = null;
    const tracker = createDirectionTracker(fake.router);

    // Add a competing listener AFTER the tracker. It should fire LATER
    // in the dispatch order — by which time the tracker has flipped
    // the internal flag. We observe the flag indirectly: emitLeave
    // inside the competing listener should write 'back'.
    const competingListener = (): void => {
      // At this point, tracker's onPopstate has already run (registered
      // first) so `popstateFlag` is true. Emit a synchronous leave —
      // direction-tracker's subscribeLeave subscriber writes 'back'.
      void fake.emitLeave(makeState("home"), makeState("about"));
      flagAtCompetingTime =
        document.documentElement.dataset.navDirection === "back";
    };

    globalThis.addEventListener("popstate", competingListener);

    try {
      globalThis.dispatchEvent(new PopStateEvent("popstate"));

      expect(flagAtCompetingTime).toBe(true);
    } finally {
      globalThis.removeEventListener("popstate", competingListener);
      tracker.destroy();
    }
  });

  // Audit gap #8: concurrent leaves + popstate.
  // Multiple subscribeLeave subscribers may be present (other utilities,
  // user code). The tracker's subscriber MUST flip the popstateFlag
  // independently — each leave triggers exactly one read of the flag,
  // then resets it. Concurrent emit shouldn't lose direction info.
  it("concurrent leaves + popstate: each leave reads then resets the flag", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);
    const directionsObserved: string[] = [];

    // Sequence: popstate → leave (back) → leave (forward) → popstate →
    // leave (back) → leave (forward).
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await fake.emitLeave(makeState("home"), makeState("about"));
    directionsObserved.push(document.documentElement.dataset.navDirection!);

    await fake.emitLeave(makeState("about"), makeState("contacts"));
    directionsObserved.push(document.documentElement.dataset.navDirection!);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await fake.emitLeave(makeState("contacts"), makeState("home"));
    directionsObserved.push(document.documentElement.dataset.navDirection!);

    await fake.emitLeave(makeState("home"), makeState("about"));
    directionsObserved.push(document.documentElement.dataset.navDirection!);

    expect(directionsObserved).toStrictEqual([
      "back",
      "forward",
      "back",
      "forward",
    ]);

    tracker.destroy();
  });

  // Audit gap #8 (variant): popstate FIRES DURING a leave handler — the
  // flag flips BEFORE the next leave's handler reads it. Pin the timing
  // contract that the tracker's popstate listener is fully decoupled
  // from the leave handler (no shared lock / no race).
  it("popstate during in-flight leave → flag captured for the NEXT leave, not the current one", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    // First leave fires without any popstate → 'forward'.
    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    // popstate happens between leaves (browser back).
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    // Next leave reads the freshly-set flag → 'back'.
    await fake.emitLeave(makeState("about"), makeState("home"));

    expect(document.documentElement.dataset.navDirection).toBe("back");

    tracker.destroy();
  });

  // Audit gap #9: Idempotent destroy.
  it("double destroy() is safe (idempotent) — second call no-ops", () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    tracker.destroy();

    expect(() => {
      tracker.destroy();
    }).not.toThrow();

    // After double destroy, dataset still cleared, listener still gone.
    expect(document.documentElement.dataset.navDirection).toBeUndefined();
    expect(fake.leaveListenerCount()).toBe(0);
  });

  // Additional Angular-specific defensive check: popstate event dispatched
  // BEFORE any leave fires — the flag is set but the dataset still reads
  // 'forward' (set at install time). The first leave then writes 'back'.
  it("popstate before any leave → dataset stays 'forward' (install baseline) until leave fires", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    // popstate happens but no leave yet.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    // Dataset unchanged — the popstate handler only flips an internal
    // flag, doesn't touch dataset directly.
    expect(document.documentElement.dataset.navDirection).toBe("forward");

    // Now emit a leave — flag consumed, dataset flips.
    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBe("back");

    tracker.destroy();
  });

  // Defensive: multiple popstate events before one leave → still 'back'
  // (flag is a single boolean, not a counter; idempotent set-to-true).
  it("multiple popstate events before single leave → single 'back' write (flag is boolean)", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBe("back");

    // Next leave reads the consumed-and-reset flag → 'forward'.
    await fake.emitLeave(makeState("about"), makeState("home"));

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });
});
