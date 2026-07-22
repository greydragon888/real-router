import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createViewTransitions } from "../../src/dom-utils";

import type { Router, State } from "@real-router/core";

type SubscribeListener = (payload: {
  route: State;
  previousRoute?: State;
}) => void;

type LeaveListener = (payload: {
  route: State;
  nextRoute: State;
  signal: AbortSignal;
}) => void | Promise<void>;

interface FakeRouter {
  emitSuccess: (route: State, previousRoute?: State) => void;
  emitLeave: (
    fromRoute: State,
    toRoute: State,
    signal?: AbortSignal,
  ) => Promise<void>;
  router: Router;
}

function makeState(name: string): State {
  return {
    name,
    params: {},
    search: {},
    path: `/${name}`,
    context: {},
    transition: {} as State["transition"],
  };
}

function makeFakeRouter(): FakeRouter {
  const subscribeListeners = new Set<SubscribeListener>();
  const leaveListeners = new Set<LeaveListener>();

  const router = {
    subscribe(fn: SubscribeListener) {
      subscribeListeners.add(fn);

      return () => {
        subscribeListeners.delete(fn);
      };
    },
    subscribeLeave(fn: LeaveListener) {
      leaveListeners.add(fn);

      return () => {
        leaveListeners.delete(fn);
      };
    },
  } as unknown as Router;

  return {
    emitSuccess(route, previousRoute) {
      const payload =
        previousRoute === undefined ? { route } : { route, previousRoute };

      for (const fn of subscribeListeners) {
        fn(payload);
      }
    },
    emitLeave(fromRoute, toRoute, signal) {
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

      return Promise.all(promises).then(() => {
        /* void */
      });
    },
    router,
  };
}

interface FakeVTInstance {
  skipTransition: ReturnType<typeof vi.fn>;
}

interface SyncStub {
  startSpy: ReturnType<typeof vi.fn>;
  instances: FakeVTInstance[];
}

function stubStartViewTransitionSync(): SyncStub {
  const instances: FakeVTInstance[] = [];
  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    void cb();

    const instance: FakeVTInstance = {
      skipTransition: vi.fn(),
    };

    instances.push(instance);

    return instance;
  });

  (
    document as Document & { startViewTransition?: unknown }
  ).startViewTransition =
    startSpy as unknown as Document["startViewTransition"];

  return { startSpy, instances };
}

interface AsyncStub {
  startSpy: ReturnType<typeof vi.fn>;
  instances: FakeVTInstance[];
  capturedCallbacks: (() => void | Promise<void>)[];
  invokeNextCallback: () => void | Promise<void>;
}

function stubStartViewTransitionAsync(): AsyncStub {
  const instances: FakeVTInstance[] = [];
  const capturedCallbacks: (() => void | Promise<void>)[] = [];

  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    capturedCallbacks.push(cb);

    const instance: FakeVTInstance = {
      skipTransition: vi.fn(),
    };

    instances.push(instance);

    return instance;
  });

  (
    document as Document & { startViewTransition?: unknown }
  ).startViewTransition =
    startSpy as unknown as Document["startViewTransition"];

  return {
    startSpy,
    instances,
    capturedCallbacks,
    invokeNextCallback() {
      const cb = capturedCallbacks.shift();

      if (cb === undefined) {
        throw new Error("No captured callbacks to invoke");
      }

      return cb();
    },
  };
}

const activeInstances: { destroy: () => void }[] = [];

function track<T extends { destroy: () => void }>(instance: T): T {
  activeInstances.push(instance);

  return instance;
}

describe("createViewTransitions (Angular copy)", () => {
  beforeEach(() => {
    // The utility uses setTimeout(0) (not rAF) to resolve the deferred —
    // rAF is blocked by Chromium's rendering suppression while a VT is in
    // update-callback-called phase. Stub setTimeout to fire synchronously.
    vi.stubGlobal("setTimeout", (cb: () => void): number => {
      cb();

      return 0;
    });
  });

  afterEach(() => {
    while (activeInstances.length > 0) {
      activeInstances.pop()?.destroy();
    }

    delete (document as any).startViewTransition;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("stale success timer vs newer VT (#781 identity guard)", () => {
    it("a stale resolver does not null out a VT opened before its timer fired", async () => {
      // Replace the file-level synchronous setTimeout stub with a MANUAL
      // queue: the guard branch only exists when a new VT opens in the
      // task-queue window BEFORE the previous success's timer runs.
      const queued: (() => void)[] = [];

      vi.stubGlobal("setTimeout", (cb: () => void): number => {
        queued.push(cb);

        return 0;
      });

      const { startSpy } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      // nav1: VT1 opens, success queues its close-resolver (timer pending).
      await fake.emitLeave(makeState("a"), makeState("b"));
      fake.emitSuccess(makeState("b"), makeState("a"));

      expect(queued).toHaveLength(1);

      // nav2 opens VT2 while timer1 is still pending.
      await fake.emitLeave(makeState("b"), makeState("c"));

      expect(startSpy).toHaveBeenCalledTimes(2);

      // Fire the STALE timer1: currentVT is VT2 → identity guard must skip
      // the null-out (the uncovered else of `currentVT === scheduledVT`).
      queued.shift()?.();

      // nav2 then completes and closes cleanly through its own timer.
      fake.emitSuccess(makeState("c"), makeState("b"));
      queued.shift()?.();

      expect(queued).toHaveLength(0);

      // The lifecycle stays healthy after the stale-timer episode: a third
      // navigation still opens a fresh VT.
      await fake.emitLeave(makeState("c"), makeState("d"));

      expect(startSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("feature detection", () => {
    it("returns no-op when document.startViewTransition is undefined", () => {
      const fake = makeFakeRouter();
      const vt = track(createViewTransitions(fake.router));

      expect(typeof vt.destroy).toBe("function");

      expect(() => {
        void fake.emitLeave(makeState("home"), makeState("about"));
      }).not.toThrow();
    });

    it("no-op instance is frozen and shared across calls", () => {
      const fake = makeFakeRouter();
      const a = track(createViewTransitions(fake.router));
      const b = track(createViewTransitions(fake.router));

      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
    });
  });

  describe("promisified leave listener", () => {
    it("listener returns a Promise that resolves when the browser invokes updateCallback", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      const leavePromise = fake.emitLeave(
        makeState("home"),
        makeState("about"),
      );

      let settled = false;

      void leavePromise.then(() => {
        settled = true;
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toBe(false);
      expect(async_.capturedCallbacks).toHaveLength(1);

      void async_.invokeNextCallback();

      // Flush through Promise.all → .then(void) → leavePromise.then chain.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(settled).toBe(true);
    });
  });

  describe("TRANSITION_SUCCESS resolves the deferred", () => {
    it("updateCallback promise resolves after subscribe fires (async browser timing)", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about"));
      fake.emitSuccess(makeState("about"), makeState("home"));

      const cbResult = async_.invokeNextCallback();

      expect(cbResult).toBeInstanceOf(Promise);

      let settled = false;

      void (cbResult as Promise<void>).then(() => {
        settled = true;
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toBe(true);
    });

    it("updateCallback promise resolves when subscribe fires AFTER callback invocation", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about"));

      const cbResult = async_.invokeNextCallback() as Promise<void>;

      let settled = false;

      void cbResult.then(() => {
        settled = true;
      });

      await Promise.resolve();

      expect(settled).toBe(false);

      fake.emitSuccess(makeState("about"), makeState("home"));

      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toBe(true);
    });

    it("subscribe without a pending VT is a no-op", () => {
      stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");

      fake.emitSuccess(makeState("home"));

      expect(rafSpy).not.toHaveBeenCalled();
    });
  });

  describe("abort safety", () => {
    it("reentrant abort — signal aborted before listener runs, utility skips VT entirely", () => {
      const { startSpy } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      const controller = new AbortController();

      controller.abort();

      void fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      expect(startSpy).not.toHaveBeenCalled();
    });

    it("abort during pending VT — calls skipTransition and releases deferred", async () => {
      const { instances } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();
      const controller = new AbortController();

      track(createViewTransitions(fake.router));

      const leave = fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      expect(instances).toHaveLength(1);

      controller.abort();

      expect(instances[0].skipTransition).toHaveBeenCalledTimes(1);

      await expect(leave).resolves.toBeUndefined();
    });

    it("abort BEFORE updateCallback is invoked — resolveLeave failsafe unblocks router", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();
      const controller = new AbortController();

      track(createViewTransitions(fake.router));

      const leave = fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      controller.abort();

      expect(async_.instances[0].skipTransition).toHaveBeenCalledTimes(1);

      await expect(leave).resolves.toBeUndefined();
    });

    it("abort handler registered with { once: true } (no double-fire)", () => {
      stubStartViewTransitionSync();
      const fake = makeFakeRouter();
      const controller = new AbortController();
      const addSpy = vi.spyOn(controller.signal, "addEventListener");

      track(createViewTransitions(fake.router));

      void fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      expect(addSpy).toHaveBeenCalledWith("abort", expect.any(Function), {
        once: true,
      });
    });

    it("cleanup abort after subscribe is a no-op (does NOT skip VT)", () => {
      // After TRANSITION_SUCCESS, router's async path (#finishAsyncNavigation)
      // aborts its own controller in a finally block as lifecycle cleanup,
      // NOT as cancellation. If our abort handler reacted to this by calling
      // skipTransition, the VT animation would be killed mid-flight on every
      // successful navigation. The `successFired` flag short-circuits the
      // handler in that case. Regression guard for #498 follow-up.
      const { instances } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();
      const controller = new AbortController();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      fake.emitSuccess(makeState("about"), makeState("home"));

      controller.abort();

      expect(instances[0].skipTransition).not.toHaveBeenCalled();
    });

    it("real cancellation (abort before subscribe) DOES skip VT", () => {
      const { instances } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();
      const controller = new AbortController();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      controller.abort();

      expect(instances[0].skipTransition).toHaveBeenCalledTimes(1);
    });

    it("abort followed by another leave — utility recovers cleanly", async () => {
      const { startSpy, instances } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();
      const controller1 = new AbortController();

      track(createViewTransitions(fake.router));

      const leave1 = fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller1.signal,
      );

      controller1.abort();

      await leave1;

      void fake.emitLeave(makeState("about"), makeState("contacts"));

      expect(startSpy).toHaveBeenCalledTimes(2);
      expect(instances).toHaveLength(2);
    });
  });

  describe("concurrent navigations", () => {
    it("back-to-back leave emissions start fresh VTs", () => {
      const { startSpy } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about"));
      void fake.emitLeave(makeState("home"), makeState("contacts"));

      expect(startSpy).toHaveBeenCalledTimes(2);
    });

    it("second leave resolves the first deferred before starting a new VT", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about"));

      const cb1Result = async_.invokeNextCallback() as Promise<void>;
      let cb1Settled = false;

      void cb1Result.then(() => {
        cb1Settled = true;
      });

      await Promise.resolve();

      expect(cb1Settled).toBe(false);

      void fake.emitLeave(makeState("home"), makeState("contacts"));

      await Promise.resolve();
      await Promise.resolve();

      expect(cb1Settled).toBe(true);
      expect(async_.capturedCallbacks).toHaveLength(1);
    });
  });

  describe("graceful fallback on startViewTransition throw", () => {
    it("startViewTransition throws — leave resolves, next navigation still works", async () => {
      let throwOnce = true;

      const startSpy = vi.fn(() => {
        if (throwOnce) {
          throwOnce = false;

          throw new Error("browser bug");
        }

        return { skipTransition: vi.fn() };
      });

      (
        document as Document & { startViewTransition?: unknown }
      ).startViewTransition =
        startSpy as unknown as Document["startViewTransition"];

      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      const leave1 = fake.emitLeave(makeState("home"), makeState("about"));

      await expect(leave1).resolves.toBeUndefined();

      void fake.emitLeave(makeState("about"), makeState("contacts"));

      expect(startSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("lifecycle", () => {
    it("destroy() unsubscribes both leave and success listeners", () => {
      const { startSpy } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      const vt = createViewTransitions(fake.router);

      vt.destroy();

      void fake.emitLeave(makeState("home"), makeState("about"));
      fake.emitSuccess(makeState("about"), makeState("home"));

      expect(startSpy).not.toHaveBeenCalled();
    });

    it("double destroy() is safe (idempotent)", () => {
      stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      const vt = createViewTransitions(fake.router);

      vt.destroy();

      expect(() => {
        vt.destroy();
      }).not.toThrow();
    });

    it("destroy() during active VT calls skipTransition and releases deferred", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      const vt = createViewTransitions(fake.router);

      void fake.emitLeave(makeState("home"), makeState("about"));

      const cbResult = async_.invokeNextCallback() as Promise<void>;

      let cbSettled = false;

      void cbResult.then(() => {
        cbSettled = true;
      });

      await Promise.resolve();

      expect(cbSettled).toBe(false);

      vt.destroy();

      expect(async_.instances[0].skipTransition).toHaveBeenCalledTimes(1);

      await Promise.resolve();
      await Promise.resolve();

      expect(cbSettled).toBe(true);
    });

    it("multiple full navigations in sequence", async () => {
      const { startSpy } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      await fake.emitLeave(makeState("home"), makeState("about"));
      fake.emitSuccess(makeState("about"), makeState("home"));

      await fake.emitLeave(makeState("about"), makeState("contacts"));
      fake.emitSuccess(makeState("contacts"), makeState("about"));

      expect(startSpy).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Closes review-2026-05-10 §5.4 ⛔ edge-cases (2 LOW).
  // =========================================================================

  describe("defensive optional chaining (review §5.4)", () => {
    // LOW: `currentVT.skipTransition` undefined — the utility uses
    // `currentVT?.skipTransition?.()` at lines 77 (abort branch) and 137
    // (destroy branch). If a browser returns a `ViewTransition`-like object
    // without `skipTransition` (older Chromium betas, future API drift,
    // custom polyfills), the optional chain must short-circuit silently
    // instead of throwing `TypeError: skipTransition is not a function`.
    it("startViewTransition returns object without skipTransition → destroy + abort do NOT throw", async () => {
      // Custom stub returning an instance WITHOUT skipTransition.
      const capturedCallbacks: (() => void | Promise<void>)[] = [];
      const startSpy = vi.fn((cb: () => void | Promise<void>) => {
        capturedCallbacks.push(cb);

        // Return a ViewTransition-like object WITHOUT skipTransition.
        // The utility's `currentVT?.skipTransition?.()` must not crash.
        return {};
      });

      (
        document as Document & { startViewTransition?: unknown }
      ).startViewTransition =
        startSpy as unknown as Document["startViewTransition"];

      const fake = makeFakeRouter();
      const vt = track(createViewTransitions(fake.router));

      // Trigger leave → utility calls startViewTransition → currentVT set
      // to an object without skipTransition.
      void fake.emitLeave(makeState("home"), makeState("about"));

      await Promise.resolve();
      await Promise.resolve();

      expect(startSpy).toHaveBeenCalledTimes(1);

      // Destroy path: line 137 calls `currentVT?.skipTransition?.()` —
      // optional chain short-circuits because skipTransition is undefined.
      // No throw.
      expect(() => {
        vt.destroy();
      }).not.toThrow();
    });

    // LOW: `currentVT.skipTransition` undefined in ABORT path (line 77).
    // Same defensive contract, exercised via the abort branch instead of
    // destroy. Uses async stub (callback NOT auto-invoked) + explicit
    // AbortController to trigger the abort handler while currentVT === {}
    // (no skipTransition property).
    it("abort during pending VT with undefined skipTransition → no throw, leave resolves", async () => {
      // Custom async stub returning instance WITHOUT skipTransition.
      const capturedCallbacks: (() => void | Promise<void>)[] = [];
      const startSpy = vi.fn((cb: () => void | Promise<void>) => {
        capturedCallbacks.push(cb);

        return {};
      });

      (
        document as Document & { startViewTransition?: unknown }
      ).startViewTransition =
        startSpy as unknown as Document["startViewTransition"];

      const fake = makeFakeRouter();
      const controller = new AbortController();

      track(createViewTransitions(fake.router));

      const leave = fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      expect(startSpy).toHaveBeenCalledTimes(1);

      // Abort while currentVT is the {}-instance — line 77 calls
      // `currentVT?.skipTransition?.()`; optional chain short-circuits
      // because skipTransition is undefined. No throw. resolveLeave()
      // fires (line 78), unblocking the leave Promise.
      expect(() => {
        controller.abort();
      }).not.toThrow();

      await expect(leave).resolves.toBeUndefined();
    });
  });

  // LOW: Real Chromium rAF suppression (timeout > 4s) — out of scope for
  // JSDOM. The utility's defensive design uses `setTimeout(0)` (line
  // 126-129 in view-transitions.ts) instead of `requestAnimationFrame`
  // specifically because Chromium blocks rAF callbacks while VT sits in
  // the `update-callback-called` phase (rendering suppression). rAF
  // callbacks would never fire → deferred never resolves → browser aborts
  // `vt.ready` with `TimeoutError` after 4 s.
  //
  // This protection is structurally verified by the existing "subscribe
  // resolves AFTER updateCallback (async)" test (which stubs setTimeout
  // synchronously) — the path is exercised. Real-browser rAF suppression
  // is impossible to reproduce in JSDOM because JSDOM has no view-
  // transition rendering pipeline. This `it.skip` block documents the
  // gap explicitly for future maintainers; an e2e Playwright test against
  // a real Chromium build is the right verification venue.
  describe("Chromium rAF suppression scenarios (out-of-scope for JSDOM)", () => {
    it.todo(
      "real Chromium 4s timeout — rAF suppressed during update-callback-called; setTimeout(0) is load-bearing defense (see view-transitions.ts:114-128 NOTE)",
    );
  });
});
