import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createViewTransitions } from "../../src";

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
  ) => void | Promise<void>;
  router: Router;
}

function makeState(name: string): State {
  return {
    name,
    params: {} as State["params"],
    path: `/${name}`,
    context: {} as State["context"],
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

function stubStartViewTransition(): {
  startSpy: ReturnType<typeof vi.fn>;
  instances: FakeVTInstance[];
} {
  const instances: FakeVTInstance[] = [];
  const startSpy = vi.fn((cb: () => void | Promise<void>) => {
    // Invoke the callback — it returns a Promise (async) that the browser would
    // await. In tests we fire-and-forget; utility correctness is verified via
    // router subscribe/subscribeLeave / destroy paths, not by awaiting VT.
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

const activeInstances: { destroy: () => void }[] = [];

function track<T extends { destroy: () => void }>(instance: T): T {
  activeInstances.push(instance);

  return instance;
}

describe("createViewTransitions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        cb(0);

        return 0;
      },
    );
  });

  afterEach(() => {
    while (activeInstances.length > 0) {
      activeInstances.pop()?.destroy();
    }

    delete (document as any).startViewTransition;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns no-op when document.startViewTransition is undefined (Firefox)", () => {
    // startViewTransition not stubbed — utility should no-op.
    const fake = makeFakeRouter();
    const vt = track(createViewTransitions(fake.router));

    expect(typeof vt.destroy).toBe("function");

    // Emitting leave should NOT throw — no listeners were registered.
    expect(() => {
      void fake.emitLeave(makeState("home"), makeState("about"));
    }).not.toThrow();
  });

  it("opens VT synchronously when subscribeLeave fires", () => {
    const { startSpy } = stubStartViewTransition();
    const fake = makeFakeRouter();

    track(createViewTransitions(fake.router));

    void fake.emitLeave(makeState("home"), makeState("about"));

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("calls subscribe listener on TRANSITION_SUCCESS without throwing", () => {
    stubStartViewTransition();
    const fake = makeFakeRouter();

    track(createViewTransitions(fake.router));

    void fake.emitLeave(makeState("home"), makeState("about"));

    // Emit success — triggers closeVT path inside utility.
    expect(() => {
      fake.emitSuccess(makeState("about"), makeState("home"));
    }).not.toThrow();
  });

  it("destroy() unsubscribes both leave and success listeners", () => {
    const { startSpy } = stubStartViewTransition();
    const fake = makeFakeRouter();

    const vt = createViewTransitions(fake.router);

    vt.destroy();

    void fake.emitLeave(makeState("home"), makeState("about"));
    fake.emitSuccess(makeState("about"), makeState("home"));

    expect(startSpy).not.toHaveBeenCalled();
  });

  it("double destroy() is safe (idempotent)", () => {
    stubStartViewTransition();
    const fake = makeFakeRouter();

    const vt = createViewTransitions(fake.router);

    vt.destroy();

    expect(() => {
      vt.destroy();
    }).not.toThrow();
  });

  it("rapid subscribeLeave calls close the previous VT", () => {
    const { startSpy } = stubStartViewTransition();
    const fake = makeFakeRouter();

    track(createViewTransitions(fake.router));

    void fake.emitLeave(makeState("home"), makeState("about"));
    // Second leave without intervening subscribe — simulates rapid clicks
    // where nav1 was cancelled before it could fire subscribe.
    void fake.emitLeave(makeState("home"), makeState("contacts"));

    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it("abort signal cleans up closeVT (normal path: listener added, then abort)", () => {
    stubStartViewTransition();
    const fake = makeFakeRouter();
    const controller = new AbortController();

    track(createViewTransitions(fake.router));

    void fake.emitLeave(
      makeState("home"),
      makeState("about"),
      controller.signal,
    );

    // Abort after listener has been registered (normal path).
    expect(() => {
      controller.abort();
    }).not.toThrow();

    // Subsequent navigation still works.
    expect(() => {
      void fake.emitLeave(makeState("about"), makeState("contacts"));
    }).not.toThrow();
  });

  it("destroy() closes an open VT (cleanup during active transition)", () => {
    const { instances } = stubStartViewTransition();
    const fake = makeFakeRouter();

    const vt = createViewTransitions(fake.router);

    void fake.emitLeave(makeState("home"), makeState("about"));

    // VT is open, closeVT deferred is set. destroy() must resolve it.
    expect(() => {
      vt.destroy();
    }).not.toThrow();

    // Underlying VT instance was created.
    expect(instances).toHaveLength(1);
  });

  it("addEventListener uses { once: true } — abort handler fires at most once", () => {
    stubStartViewTransition();
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

  it("listener chain works across multiple full navigations", () => {
    const { startSpy } = stubStartViewTransition();
    const fake = makeFakeRouter();

    track(createViewTransitions(fake.router));

    // Nav 1
    void fake.emitLeave(makeState("home"), makeState("about"));
    fake.emitSuccess(makeState("about"), makeState("home"));

    // Nav 2
    void fake.emitLeave(makeState("about"), makeState("contacts"));
    fake.emitSuccess(makeState("contacts"), makeState("about"));

    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it("updateCallback promise resolves when browser invokes cb asynchronously (regression for closeVT race)", async () => {
    // Real-browser behavior: startViewTransition captures the old DOM
    // synchronously but invokes the updateCallback in a LATER microtask.
    // If the utility captures `closeVT` inside the cb, `router.subscribe`
    // (TRANSITION_SUCCESS) fires BEFORE cb runs, sees closeVT still null,
    // and never resolves the deferred — VT aborts after 4s with
    // TimeoutError, and the next navigation throws InvalidStateError.
    // This test uses an async invocation stub (vs the default sync stub)
    // to reproduce that timing.
    let capturedCb: (() => Promise<void> | void) | null = null;

    const asyncStartSpy = vi.fn(
      (cb: () => void | Promise<void>): FakeVTInstance => {
        capturedCb = cb;

        return { skipTransition: vi.fn() };
      },
    );

    (
      document as Document & { startViewTransition?: unknown }
    ).startViewTransition =
      asyncStartSpy as unknown as Document["startViewTransition"];

    const fake = makeFakeRouter();

    track(createViewTransitions(fake.router));

    void fake.emitLeave(makeState("home"), makeState("about"));
    // subscribe fires BEFORE the browser invokes cb — this is the regression
    // timing window where closeVT used to be null.
    fake.emitSuccess(makeState("about"), makeState("home"));

    // Now the browser would invoke cb. Its returned Promise must resolve;
    // on pre-fix code it hangs forever because closeVT was never captured.
    expect(capturedCb).not.toBeNull();

    const cb = capturedCb as unknown as () => void | Promise<void>;
    const cbResult = cb();

    expect(cbResult).toBeInstanceOf(Promise);

    let settled = false;

    void (cbResult as Promise<void>).then(() => {
      settled = true;
    });

    // Flush microtasks (rAF stub fires sync, which schedules .then()).
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(true);
  });
});
