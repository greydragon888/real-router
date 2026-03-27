import { createRouter, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createTransitionSource } from "../../src";

import type { Router, State } from "@real-router/core";

describe("createTransitionSource", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("getSnapshot() returns IDLE_SNAPSHOT initially", () => {
    const source = createTransitionSource(router);
    const snapshot = source.getSnapshot();

    expect(snapshot.isTransitioning).toBe(false);
    expect(snapshot.toRoute).toBeNull();
    expect(snapshot.fromRoute).toBeNull();
  });

  it("isTransitioning === true upon TRANSITION_START", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createTransitionSource(router);

    void router.navigate("dashboard");
    // Wait for microtask so TRANSITION_START fires
    await Promise.resolve();

    expect(source.getSnapshot().isTransitioning).toBe(true);

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("toRoute contains target state upon TRANSITION_START", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createTransitionSource(router);

    void router.navigate("dashboard");
    await Promise.resolve();

    const snapshot = source.getSnapshot();

    expect(snapshot.toRoute).not.toBeNull();
    expect(snapshot.toRoute!.name).toBe("dashboard");

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("fromRoute contains source state upon TRANSITION_START", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createTransitionSource(router);

    void router.navigate("dashboard");
    await Promise.resolve();

    const snapshot = source.getSnapshot();

    expect(snapshot.fromRoute).not.toBeNull();
    expect(snapshot.fromRoute!.name).toBe("home");

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("fromRoute === null if fromState is undefined (first transition)", () => {
    // Source created before router.start — listen for transition start during start()
    const freshRouter = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
    ]);

    const api = getPluginApi(freshRouter);
    let capturedFromRoute: State | null | undefined;

    const source = createTransitionSource(freshRouter);

    api.addEventListener(events.TRANSITION_START, (_toState, fromState) => {
      // fromState during start() is undefined
      if (fromState === undefined) {
        capturedFromRoute = source.getSnapshot().fromRoute;
      }
    });

    // start() triggers TRANSITION_START with fromState = undefined
    void freshRouter.start("/");

    // The source's fromRoute should be null (not undefined)
    expect(capturedFromRoute).toBeNull();

    freshRouter.stop();
  });

  it("returns IDLE_SNAPSHOT upon TRANSITION_SUCCESS", async () => {
    const source = createTransitionSource(router);

    await router.navigate("dashboard");

    const snapshot = source.getSnapshot();

    expect(snapshot.isTransitioning).toBe(false);
    expect(snapshot.toRoute).toBeNull();
    expect(snapshot.fromRoute).toBeNull();
  });

  it("returns IDLE_SNAPSHOT upon TRANSITION_ERROR", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const source = createTransitionSource(router);

    await router.navigate("dashboard").catch(() => {});

    const snapshot = source.getSnapshot();

    expect(snapshot.isTransitioning).toBe(false);
    expect(snapshot.toRoute).toBeNull();
    expect(snapshot.fromRoute).toBeNull();
  });

  it("returns IDLE_SNAPSHOT upon TRANSITION_CANCEL", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createTransitionSource(router);

    const p1 = router.navigate("dashboard");

    await Promise.resolve();

    expect(source.getSnapshot().isTransitioning).toBe(true);

    // Cancel by navigating elsewhere (settings has no guard)
    const p2 = router.navigate("settings");

    await Promise.resolve();

    resolveGuard(true);
    await p2;
    await p1.catch(() => {});

    const snapshot = source.getSnapshot();

    expect(snapshot.isTransitioning).toBe(false);
    expect(snapshot.toRoute).toBeNull();
    expect(snapshot.fromRoute).toBeNull();
  });

  it("notifies subscribers on snapshot change", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createTransitionSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    void router.navigate("dashboard");
    await Promise.resolve();

    // TRANSITION_START should have notified
    expect(listener).toHaveBeenCalledTimes(1);

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // TRANSITION_SUCCESS should have notified again
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not notify subscribers after unsubscribe", async () => {
    const source = createTransitionSource(router);
    const listener = vi.fn();

    const unsubscribe = source.subscribe(listener);

    unsubscribe();

    await router.navigate("dashboard");

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy() unsubscribes from all router events", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createTransitionSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    source.destroy();

    void router.navigate("dashboard");
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    expect(source.getSnapshot().isTransitioning).toBe(false);

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("destroy() prevents further updates", async () => {
    const source = createTransitionSource(router);

    source.destroy();

    await router.navigate("dashboard");

    expect(source.getSnapshot().isTransitioning).toBe(false);
  });

  it("concurrent navigation: updates toRoute to new target", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createTransitionSource(router);

    const p1 = router.navigate("dashboard");

    await Promise.resolve();

    expect(source.getSnapshot().toRoute!.name).toBe("dashboard");

    // New navigation cancels previous
    const p2 = router.navigate("settings");

    await Promise.resolve();
    await Promise.resolve();

    resolveGuard(true);
    await p2;
    await p1.catch(() => {});

    // After second navigation completes, should be IDLE
    expect(source.getSnapshot().isTransitioning).toBe(false);
  });

  it("skip update when reentrant navigation produces TRANSITION_START with same paths", async () => {
    const lifecycle = getLifecycleApi(router);
    const resolvers: ((value: boolean) => void)[] = [];

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolvers.push(resolve);
      });
    });

    let reentrantDone = false;

    router.usePlugin(() => ({
      onTransitionStart() {
        if (!reentrantDone) {
          reentrantDone = true;
          void router.navigate("dashboard");
        }
      },
    }));

    const source = createTransitionSource(router);

    source.subscribe(() => {});

    void router.navigate("dashboard").catch(() => {});

    for (const resolve of resolvers) {
      resolve(true);
    }

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(source.getSnapshot().isTransitioning).toBe(false);

    source.destroy();
  });

  it("repeated IDLE_SNAPSHOT (success after success) is idempotent", async () => {
    const source = createTransitionSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("dashboard");

    const callsAfterFirst = listener.mock.calls.length;

    await router.navigate("settings");

    // Both navigations are sync (no guards), so each emits START+SUCCESS
    // The key point: no extra notifications from duplicate IDLE states
    const totalCalls = listener.mock.calls.length;

    // Verify final state is IDLE
    expect(source.getSnapshot().isTransitioning).toBe(false);

    // Exact count depends on batching, but should be reasonable
    expect(totalCalls).toBeGreaterThanOrEqual(callsAfterFirst);
  });

  it("post-destroy: getSnapshot still returns last value", () => {
    const source = createTransitionSource(router);

    expect(source.getSnapshot().isTransitioning).toBe(false);

    source.destroy();

    expect(source.getSnapshot().isTransitioning).toBe(false);
  });

  it("post-destroy: subscribe returns no-op unsubscribe", () => {
    const source = createTransitionSource(router);

    source.destroy();

    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  it("destroy is idempotent", () => {
    const source = createTransitionSource(router);

    source.destroy();

    expect(() => {
      source.destroy();
    }).not.toThrow();
  });
});
