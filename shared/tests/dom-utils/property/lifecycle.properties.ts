// packages/dom-utils/tests/property/lifecycle.properties.ts

/**
 * Cross-factory lifecycle PBT — destroy idempotency for every long-lived
 * helper that owns a router subscription, a DOM mutation, or a global
 * listener. Audit-2026-05-17 §6 (Invariant Gap Analysis, Stage 1 #8/9/10)
 * flagged the absence of a single source of truth for "calling destroy()
 * N times must equal calling it once" — this file is that source.
 *
 * Covered factories (all from `shared/dom-utils/`):
 *
 * - `createRouteAnnouncer`         — Safari-ready timeout + clear timeout +
 *                                    router subscription + announcer DOM node
 * - `createScrollRestoration`      — pagehide listener + router subscription +
 *                                    history.scrollRestoration flip
 * - `createDirectionTracker`       — popstate listener + router subscribeLeave +
 *                                    `<html>` dataset attribute
 * - `createViewTransitions`        — subscribeLeave + subscribe + active VT
 *                                    skipTransition()
 * - `createScrollSpy`              — IntersectionObserver + MutationObserver +
 *                                    rAF + timers + getTransitionSource +
 *                                    2 router subscriptions: the richest-
 *                                    resource factory, so the one whose
 *                                    teardown completeness most needs the
 *                                    cross-factory lock (#784). Its active path
 *                                    needs a real `createRouter` (it calls
 *                                    `getTransitionSource` → `getPluginApi`,
 *                                    which the minimal mock cannot satisfy).
 *
 * For each factory, two invariants are locked:
 *
 *  1. **Destroy idempotency.** `destroy()` called N times (1 ≤ N ≤ 5) must
 *     not throw, must not double-unsubscribe, must not double-remove DOM,
 *     must not leak listeners.
 *
 *  2. **Create/destroy cycle cleanliness.** `K` mount-then-unmount rounds
 *     leave the document, the global listener registry, and `history`
 *     state observably equivalent to a never-mounted baseline.
 *
 * Why PBT and not functional: each factory already has its own functional
 * destroy test, but the boundary cases (N = 0, N = 5, K = 10 rapid cycles)
 * and the cross-factory matrix (all four destroy paths share the same
 * "stay safe on extra calls" contract) read more cleanly as a single
 * generative sweep.
 */

import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { describe, expect, beforeEach, afterEach, vi } from "vitest";

import {
  createDirectionTracker,
  createRouteAnnouncer,
  createScrollRestoration,
  createScrollSpy,
  createViewTransitions,
} from "../../../dom-utils";

import type { Router, State } from "@real-router/core";

const NUM_RUNS = { standard: 50, thorough: 100 } as const;

const ANNOUNCER_SEL = "[data-real-router-announcer]";

// =============================================================================
// Mock router shape — implements the minimal surface each lifecycle factory
// consumes (subscribe / subscribeLeave / getState). Each test creates a
// fresh instance so listener counts start at zero.
// =============================================================================

interface MockRouter {
  router: Router;
  subscribeCount: () => number;
  leaveCount: () => number;
}

function createMockRouter(initial?: State): MockRouter {
  const subscribers = new Set<() => void>();
  const leavers = new Set<() => void>();
  let current = initial;

  const router = {
    subscribe(fn: () => void) {
      subscribers.add(fn);

      return () => {
        subscribers.delete(fn);
      };
    },
    subscribeLeave(fn: () => void) {
      leavers.add(fn);

      return () => {
        leavers.delete(fn);
      };
    },
    getState() {
      return current;
    },
  } as unknown as Router;

  return {
    router,
    subscribeCount: () => subscribers.size,
    leaveCount: () => leavers.size,
  };
}

// =============================================================================
// Global listener tracking — counts addEventListener / removeEventListener
// pairs so create/destroy cycle invariants can assert "net zero" leaks.
// =============================================================================

function trackGlobalListeners(): {
  added: () => Map<string, number>;
  removed: () => Map<string, number>;
  restore: () => void;
} {
  const addedMap = new Map<string, number>();
  const removedMap = new Map<string, number>();

  const origAdd = globalThis.addEventListener.bind(globalThis);
  const origRemove = globalThis.removeEventListener.bind(globalThis);

  globalThis.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => {
    addedMap.set(type, (addedMap.get(type) ?? 0) + 1);

    origAdd(type, listener, options);
  }) as any;

  globalThis.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean,
  ) => {
    removedMap.set(type, (removedMap.get(type) ?? 0) + 1);

    origRemove(type, listener, options);
  }) as any;

  return {
    added: () => addedMap,
    removed: () => removedMap,
    restore: () => {
      globalThis.addEventListener = origAdd;
      globalThis.removeEventListener = origRemove;
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

const arbDestroyCount = fc.integer({ min: 1, max: 5 });
const arbCycleCount = fc.integer({ min: 1, max: 10 });

describe("Lifecycle factories — destroy idempotency PBT (audit-2026-05-17 §6 #8/9/10)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.navDirection;
    sessionStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    history.scrollRestoration = "auto";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  // ===========================================================================
  // createRouteAnnouncer
  // ===========================================================================

  describe("createRouteAnnouncer", () => {
    test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
      "destroy() called N times never throws and removes announcer exactly once",
      (n) => {
        document.body.innerHTML = "";
        const { router } = createMockRouter();
        const handle = createRouteAnnouncer(router);

        expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

        for (let i = 0; i < n; i++) {
          expect(() => {
            handle.destroy();
          }).not.toThrow();
        }

        expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);
      },
    );

    test.prop([arbCycleCount], { numRuns: NUM_RUNS.standard })(
      "K create+destroy cycles leave subscriber count at zero",
      (k) => {
        document.body.innerHTML = "";
        const mock = createMockRouter();

        for (let i = 0; i < k; i++) {
          const handle = createRouteAnnouncer(mock.router);

          handle.destroy();
        }

        expect(mock.subscribeCount()).toBe(0);
        expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);
      },
    );
  });

  // ===========================================================================
  // createScrollRestoration
  // ===========================================================================

  describe("createScrollRestoration", () => {
    test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
      "destroy() called N times never throws; history.scrollRestoration restored exactly once",
      (n) => {
        const prev = history.scrollRestoration;
        const { router } = createMockRouter();
        const handle = createScrollRestoration(router);

        // Helper flips to "manual" on install.
        expect(history.scrollRestoration).toBe("manual");

        for (let i = 0; i < n; i++) {
          expect(() => {
            handle.destroy();
          }).not.toThrow();
        }

        expect(history.scrollRestoration).toBe(prev);
      },
    );

    test.prop([arbCycleCount], { numRuns: NUM_RUNS.standard })(
      "K create+destroy cycles leave router subscription and pagehide listener at zero",
      (k) => {
        const mock = createMockRouter();
        const tracker = trackGlobalListeners();

        try {
          for (let i = 0; i < k; i++) {
            const handle = createScrollRestoration(mock.router);

            handle.destroy();
          }

          const added = tracker.added().get("pagehide") ?? 0;
          const removed = tracker.removed().get("pagehide") ?? 0;

          expect(added).toBe(k);
          expect(removed).toBe(k);
          expect(mock.subscribeCount()).toBe(0);
        } finally {
          tracker.restore();
        }
      },
    );

    test("destroy() before any navigation never throws", () => {
      const { router } = createMockRouter();
      const handle = createScrollRestoration(router);

      expect(() => {
        handle.destroy();
      }).not.toThrow();
      expect(() => {
        handle.destroy();
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // createDirectionTracker
  // ===========================================================================

  describe("createDirectionTracker", () => {
    test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
      "destroy() called N times never throws; <html data-nav-direction> cleared exactly once",
      (n) => {
        const { router } = createMockRouter();
        const handle = createDirectionTracker(router);

        expect(document.documentElement.dataset.navDirection).toBe("forward");

        for (let i = 0; i < n; i++) {
          expect(() => {
            handle.destroy();
          }).not.toThrow();
        }

        expect(document.documentElement.dataset.navDirection).toBeUndefined();
      },
    );

    test.prop([arbCycleCount], { numRuns: NUM_RUNS.standard })(
      "K create+destroy cycles leave subscribeLeave at zero and popstate listener at zero",
      (k) => {
        const mock = createMockRouter();
        const tracker = trackGlobalListeners();

        try {
          for (let i = 0; i < k; i++) {
            const handle = createDirectionTracker(mock.router);

            handle.destroy();
          }

          const added = tracker.added().get("popstate") ?? 0;
          const removed = tracker.removed().get("popstate") ?? 0;

          expect(added).toBe(k);
          expect(removed).toBe(k);
          expect(mock.leaveCount()).toBe(0);
        } finally {
          tracker.restore();
        }
      },
    );
  });

  // ===========================================================================
  // createViewTransitions
  // ===========================================================================

  describe("createViewTransitions", () => {
    // The full helper requires `document.startViewTransition`, which jsdom
    // does not implement. We assert NOOP_INSTANCE behaviour and the
    // documented destroy contract for the no-API path, plus stub the API
    // for the destroy-with-active-VT case below.
    test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
      "destroy() called N times never throws on the no-API path (NOOP_INSTANCE)",
      (n) => {
        const { router } = createMockRouter();
        const handle = createViewTransitions(router);

        for (let i = 0; i < n; i++) {
          expect(() => {
            handle.destroy();
          }).not.toThrow();
        }
      },
    );

    test.prop([arbCycleCount], { numRuns: NUM_RUNS.standard })(
      "K create+destroy cycles leave subscribeLeave + subscribe at zero (with stubbed VT API)",
      (k) => {
        // Stub startViewTransition so createViewTransitions takes the
        // active path (subscribeLeave + subscribe registered).
        const startVTStub = vi.fn(() => ({
          skipTransition: () => {
            /* no-op */
          },
        }));

        Object.defineProperty(document, "startViewTransition", {
          value: startVTStub,
          configurable: true,
          writable: true,
        });

        try {
          const mock = createMockRouter();

          for (let i = 0; i < k; i++) {
            const handle = createViewTransitions(mock.router);

            handle.destroy();
          }

          expect(mock.subscribeCount()).toBe(0);
          expect(mock.leaveCount()).toBe(0);
        } finally {
          delete (document as unknown as { startViewTransition?: unknown })
            .startViewTransition;
        }
      },
    );
  });

  // ===========================================================================
  // createScrollSpy — the richest-resource factory. Its active path needs a
  // real `createRouter` (it calls `getTransitionSource` → `getPluginApi`, which
  // the minimal mock cannot satisfy) plus IntersectionObserver +
  // MutationObserver, neither of which jsdom implements. Fake observers track
  // `disconnect()` so the cross-factory teardown invariant can assert the pair
  // is released; the router is left UNSTARTED so the URL-plugin detector defers
  // (no warn) and the resources are just the observers + the deferred
  // subscriptions, all of which destroy() must release (#784).
  // ===========================================================================
  describe("createScrollSpy", () => {
    const ioRecords: { disconnected: boolean }[] = [];
    const moRecords: { disconnected: boolean }[] = [];

    beforeEach(() => {
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          private readonly record = { disconnected: false };

          constructor() {
            ioRecords.push(this.record);
          }

          observe(): void {
            /* no-op */
          }

          unobserve(): void {
            /* no-op */
          }

          disconnect(): void {
            this.record.disconnected = true;
          }

          takeRecords(): never[] {
            return [];
          }
        },
      );

      vi.stubGlobal(
        "MutationObserver",
        class {
          private readonly record = { disconnected: false };

          constructor() {
            moRecords.push(this.record);
          }

          observe(): void {
            /* no-op */
          }

          disconnect(): void {
            this.record.disconnected = true;
          }

          takeRecords(): never[] {
            return [];
          }
        },
      );
    });

    test.prop([arbDestroyCount], { numRuns: NUM_RUNS.standard })(
      "destroy() called N times never throws and disconnects the observer pair",
      (n) => {
        // Reset per property run — `test.prop` does not re-run `beforeEach`
        // between runs, so the fake-observer records accumulate otherwise.
        ioRecords.length = 0;
        moRecords.length = 0;

        const router = createRouter([{ name: "home", path: "/" }]);
        const handle = createScrollSpy(router, { selector: "[id]" });

        expect(ioRecords).toHaveLength(1);
        expect(moRecords).toHaveLength(1);

        for (let i = 0; i < n; i++) {
          expect(() => {
            handle.destroy();
          }).not.toThrow();
        }

        expect(ioRecords[0]?.disconnected).toBe(true);
        expect(moRecords[0]?.disconnected).toBe(true);
      },
    );

    test.prop([arbCycleCount], { numRuns: NUM_RUNS.standard })(
      "K create+destroy cycles disconnect every observer (no leak)",
      (k) => {
        ioRecords.length = 0;
        moRecords.length = 0;

        const router = createRouter([{ name: "home", path: "/" }]);

        for (let i = 0; i < k; i++) {
          const handle = createScrollSpy(router, { selector: "[id]" });

          handle.destroy();
        }

        expect(ioRecords).toHaveLength(k);
        expect(moRecords).toHaveLength(k);
        expect(ioRecords.every((r) => r.disconnected)).toBe(true);
        expect(moRecords.every((r) => r.disconnected)).toBe(true);
      },
    );
  });

  // ===========================================================================
  // Mini-sprint F.2 (audit-6 Stage-2 #20) — NOOP_INSTANCE SSR matrix.
  // Each of the 4 lifecycle factories has an SSR guard at the top:
  //   `if (typeof document === "undefined") return NOOP_INSTANCE;`
  // (or `typeof globalThis.window === "undefined"` for scroll-restore).
  // The NOOP_INSTANCE is a module-scoped frozen singleton — every SSR
  // call returns the SAME reference. Locks the singleton-ness so a
  // refactor that allocates per-call (or removes the SSR guard) fails
  // immediately.
  // ===========================================================================
  describe("NOOP_INSTANCE on SSR — all 4 factories return the SAME frozen singleton (Mini-sprint F.2)", () => {
    afterEach(() => {
      // vi.stubGlobal("document", undefined) inside each test installs
      // a stub; vi.unstubAllGlobals() restores the jsdom defaults. The
      // parent describe also calls unstubAllGlobals — duplicate is
      // safe (idempotent) and provides defence-in-depth if the nested
      // describe's afterEach is reordered in a future Vitest version.
      vi.unstubAllGlobals();
    });

    test("createRouteAnnouncer: SSR → frozen singleton, identical across N calls", () => {
      vi.stubGlobal("document", undefined);

      const { router } = createMockRouter();
      const refs = Array.from({ length: 5 }, () =>
        createRouteAnnouncer(router),
      );

      // All references identical → singleton.
      for (const ref of refs) {
        expect(ref).toBe(refs[0]);
      }

      // Frozen — destroy is callable (no-op) and the object can't
      // grow new properties.
      expect(Object.isFrozen(refs[0])).toBe(true);
      expect(() => {
        refs[0].destroy();
      }).not.toThrow();
    });

    test("createDirectionTracker: SSR → frozen singleton", () => {
      vi.stubGlobal("document", undefined);

      const { router } = createMockRouter();
      const a = createDirectionTracker(router);
      const b = createDirectionTracker(router);

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
      expect(() => {
        a.destroy();
      }).not.toThrow();
    });

    test("createViewTransitions: SSR (no document) → frozen singleton", () => {
      vi.stubGlobal("document", undefined);

      const { router } = createMockRouter();
      const a = createViewTransitions(router);
      const b = createViewTransitions(router);

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
      expect(() => {
        a.destroy();
      }).not.toThrow();
    });

    test("createViewTransitions: jsdom-present but NO startViewTransition → frozen singleton (same NOOP)", () => {
      // Locks the second guard clause:
      //   typeof document.startViewTransition !== "function"
      // returns the SAME NOOP_INSTANCE as the no-document path.
      // Without this lock, a refactor that splits the two guards into
      // separate NOOPs would still pass the SSR-only test above.
      const a = createViewTransitions(createMockRouter().router);
      const b = createViewTransitions(createMockRouter().router);

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
    });

    test("createScrollRestoration: SSR (no window) → frozen singleton", () => {
      vi.stubGlobal("window", undefined);

      const { router } = createMockRouter();
      const a = createScrollRestoration(router);
      const b = createScrollRestoration(router);

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
      expect(() => {
        a.destroy();
      }).not.toThrow();
    });

    test("createScrollRestoration: mode='native' → frozen singleton (no install)", () => {
      // The "native" mode also returns NOOP_INSTANCE — separate code
      // path from SSR. Pin both routes to the SAME singleton.
      const { router } = createMockRouter();
      const a = createScrollRestoration(router, { mode: "native" });
      const b = createScrollRestoration(router, { mode: "native" });

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
    });

    test("createScrollSpy: SSR (no document) → frozen singleton", () => {
      vi.stubGlobal("document", undefined);

      const { router } = createMockRouter();
      const a = createScrollSpy(router, { selector: "[id]" });
      const b = createScrollSpy(router, { selector: "[id]" });

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
      expect(() => {
        a.destroy();
      }).not.toThrow();
    });

    test("createScrollSpy: no IntersectionObserver → frozen singleton (same NOOP)", () => {
      // document present, but the browser lacks IntersectionObserver (no
      // polyfill ships). Locks the second NOOP exit to the same singleton —
      // no observers / timers / subscriptions are created (the guard returns
      // before `getTransitionSource`, so a minimal mock router is enough).
      vi.stubGlobal("IntersectionObserver", undefined);

      const { router } = createMockRouter();
      const a = createScrollSpy(router, { selector: "[id]" });
      const b = createScrollSpy(router, { selector: "[id]" });

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
    });
  });
});
