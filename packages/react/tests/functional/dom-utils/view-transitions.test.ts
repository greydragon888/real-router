import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createViewTransitions } from "../../../src/dom-utils";

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
        /* collapse to void */
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

// Sync stub — invokes the updateCallback synchronously inside startViewTransition.
// Matches how real browsers behave for the `resolveLeave()` path: by the time
// the leave promise settles, the callback has already run.
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

// Async stub — captures the updateCallback but does NOT invoke it immediately.
// Matches real-browser timing where the callback runs in the next rendering
// task. Tests that care about ordering between startViewTransition() and
// callback invocation use this stub.
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

describe("createViewTransitions", () => {
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

  describe("feature detection", () => {
    it("returns no-op when document.startViewTransition is undefined (Firefox < 147)", () => {
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

      // Before the browser invokes the callback, the leave promise is pending
      // — router is blocked on the old-snapshot-captured step.
      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toBe(false);
      expect(async_.capturedCallbacks).toHaveLength(1);

      // Browser runs the rendering step and invokes the callback (which
      // synchronously calls resolveLeave).
      void async_.invokeNextCallback();

      // Flush through Promise.all → .then(void) → leavePromise.then chain.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(settled).toBe(true);
    });

    it("leave promise rejects/resolves are isolated — throwing inside updateCallback does not crash listener promise", async () => {
      // Even if the browser throws when running the callback (unrealistic but
      // defensive), our listener promise has already been chained — ensure
      // resolveLeave was called before the throw.
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      const leave = fake.emitLeave(makeState("home"), makeState("about"));

      // Invoke callback — it returns a pending deferred; resolveLeave runs
      // synchronously first.
      const cbResult = async_.invokeNextCallback();

      await expect(leave).resolves.toBeUndefined();
      expect(cbResult).toBeInstanceOf(Promise);
    });
  });

  describe("TRANSITION_SUCCESS resolves the deferred (new snapshot commit)", () => {
    it("updateCallback promise resolves after subscribe fires (async browser timing)", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about"));
      // Subscribe fires BEFORE browser invokes updateCallback — this is the
      // regression timing window that `closeVT` must be captured synchronously
      // to cover.
      fake.emitSuccess(makeState("about"), makeState("home"));

      const cbResult = async_.invokeNextCallback();

      expect(cbResult).toBeInstanceOf(Promise);

      let settled = false;

      void (cbResult as Promise<void>).then(() => {
        settled = true;
      });

      // rAF stub fires synchronously, which schedules .then microtasks.
      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toBe(true);
    });

    it("updateCallback promise resolves when subscribe fires AFTER callback invocation", async () => {
      const async_ = stubStartViewTransitionAsync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about"));

      // Browser invokes callback first (normal ordering).
      const cbResult = async_.invokeNextCallback() as Promise<void>;

      let settled = false;

      void cbResult.then(() => {
        settled = true;
      });

      await Promise.resolve();

      expect(settled).toBe(false);

      // Then subscribe fires → resolver runs on next rAF.
      fake.emitSuccess(makeState("about"), makeState("home"));

      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toBe(true);
    });

    it("calls subscribe listener on TRANSITION_SUCCESS without throwing (sync path)", () => {
      stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about"));

      expect(() => {
        fake.emitSuccess(makeState("about"), makeState("home"));
      }).not.toThrow();
    });

    it("subscribe without a pending VT is a no-op", () => {
      stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      // No leave before — subscribe should not throw, rAF should not be scheduled.
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

    it("reentrant abort returns undefined — router sees sync-path leave (no pending promise)", () => {
      stubStartViewTransitionSync();

      // Capture the listener directly so we can observe its return value
      // (fake.emitLeave collapses to void; we need the raw result).
      let captured: LeaveListener | undefined;

      const router = {
        subscribe() {
          return () => {};
        },
        subscribeLeave(fn: LeaveListener) {
          captured = fn;

          return () => {};
        },
      } as unknown as Router;

      track(createViewTransitions(router));

      const controller = new AbortController();

      controller.abort();

      expect(captured).toBeTypeOf("function");

      const result = captured!({
        route: makeState("home"),
        nextRoute: makeState("about"),
        signal: controller.signal,
      });

      expect(result).toBeUndefined();
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

      // Browser has NOT yet invoked callback. Abort fires.
      controller.abort();

      expect(async_.instances[0].skipTransition).toHaveBeenCalledTimes(1);

      // Leave promise must resolve even though updateCallback never ran.
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

      // Simulate successful navigation — subscribe fires (TRANSITION_SUCCESS).
      fake.emitSuccess(makeState("about"), makeState("home"));

      // Router's finally block aborts the controller for cleanup.
      controller.abort();

      // skipTransition must NOT have been called — the VT is progressing
      // normally to animating phase.
      expect(instances[0].skipTransition).not.toHaveBeenCalled();
    });

    it("real cancellation (abort before subscribe) DOES skip VT", () => {
      // Mirror of the previous test: abort WITHOUT a preceding subscribe is
      // real cancellation (concurrent navigate / dispose). skipTransition
      // must fire, stale VT pseudo-elements must not leak.
      const { instances } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();
      const controller = new AbortController();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(
        makeState("home"),
        makeState("about"),
        controller.signal,
      );

      // Abort WITHOUT emitSuccess — this is real cancellation.
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

      // Second leave with a fresh signal must start a new VT.
      void fake.emitLeave(makeState("about"), makeState("contacts"));

      expect(startSpy).toHaveBeenCalledTimes(2);
      expect(instances).toHaveLength(2);
    });
  });

  describe("concurrent navigations (rapid clicks A → B → C)", () => {
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

      // Invoke cb1 — deferred1 is now in flight.
      const cb1Result = async_.invokeNextCallback() as Promise<void>;
      let cb1Settled = false;

      void cb1Result.then(() => {
        cb1Settled = true;
      });

      await Promise.resolve();

      expect(cb1Settled).toBe(false);

      // Second leave without intervening success — utility must resolve
      // deferred1 so cb1 completes, then open VT2.
      void fake.emitLeave(makeState("home"), makeState("contacts"));

      await Promise.resolve();
      await Promise.resolve();

      expect(cb1Settled).toBe(true);
      expect(async_.capturedCallbacks).toHaveLength(1); // cb2 pending
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

      // Second leave must proceed normally.
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

      // Invoke callback — deferred is now awaited by browser.
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

      // Browser's deferred is released — VT can unwind.
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

  // ===========================================================================
  // #781 — a TRANSITION_SUCCESS resolver scheduled via setTimeout(0) must not
  // clobber the *next* navigation's currentVT when it finally runs. If the next
  // leave opens VT-2 inside the task-queue window after success, the stale
  // setTimeout (which unconditionally set `currentVT = null`) reset the
  // reference, so a subsequent cancellation skipped nothing and a stale
  // animation leaked. The fix guards the null with an identity check.
  // ===========================================================================
  describe("#781 — stale success resolver must not clobber the next navigation's currentVT", () => {
    it("control: when the success resolver runs BEFORE the next leave, cancellation skips VT-2", () => {
      // Default beforeEach setTimeout stub fires synchronously, so b's success
      // resolver runs (and clears currentVT) before c's leave opens VT-2.
      const { instances } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about")); // VT-1
      fake.emitSuccess(makeState("about"), makeState("home")); // resolver runs now

      const ctrl2 = new AbortController();

      void fake.emitLeave(
        makeState("about"),
        makeState("contacts"),
        ctrl2.signal,
      ); // VT-2
      ctrl2.abort(); // real cancellation (successFired reset by VT-2's leave)

      expect(instances).toHaveLength(2);
      expect(instances[1].skipTransition).toHaveBeenCalledTimes(1);
    });

    it("probe: a success resolver still queued when the next leave opens VT-2 must NOT null VT-2", () => {
      // Defer the success resolver's setTimeout so it fires AFTER c's leave.
      const scheduled: (() => void)[] = [];

      vi.stubGlobal("setTimeout", (cb: () => void): number => {
        scheduled.push(cb);

        return 0;
      });

      const { instances } = stubStartViewTransitionSync();
      const fake = makeFakeRouter();

      track(createViewTransitions(fake.router));

      void fake.emitLeave(makeState("home"), makeState("about")); // VT-1
      fake.emitSuccess(makeState("about"), makeState("home")); // schedules (captured) resolver

      const ctrl2 = new AbortController();

      void fake.emitLeave(
        makeState("about"),
        makeState("contacts"),
        ctrl2.signal,
      ); // VT-2 → currentVT = VT-2

      // The stale b-success setTimeout now fires. Before the fix it
      // unconditionally did `currentVT = null`, clobbering VT-2.
      expect(scheduled).toHaveLength(1);

      scheduled[0]();

      // Cancel VT-2. With the clobber, currentVT is null → skipTransition never
      // runs → stale animation leaks. With the identity guard, currentVT is
      // still VT-2 → it is skipped.
      ctrl2.abort();

      expect(instances).toHaveLength(2);
      expect(instances[1].skipTransition).toHaveBeenCalledTimes(1);
    });
  });
});
