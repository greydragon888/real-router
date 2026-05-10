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
    expect(snapshot.isLeaveApproved).toBe(false);
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

    const navPromise = router.navigate("dashboard");

    await Promise.resolve();
    await Promise.resolve();

    // After START + LEAVE_APPROVE land but the activate guard is blocked,
    // the listener has been notified exactly twice. This is deterministic:
    // both events call updateSnapshot which always notifies.
    const callsBeforeResolve = listener.mock.calls.length;

    expect(callsBeforeResolve).toBe(2);

    resolveGuard(true);
    await navPromise;

    // TRANSITION_SUCCESS resets to IDLE_SNAPSHOT (singleton ref). Total
    // notifications: START + LEAVE_APPROVE + SUCCESS = 3.
    expect(listener).toHaveBeenCalledTimes(3);
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
    const api = getPluginApi(router);
    const captures: { target: string; observed: string | undefined }[] = [];

    // Capture toRoute at the moment each TRANSITION_START fires, AFTER the
    // source's own listener has updated the snapshot (the source registers
    // first, so this listener observes the post-update state).
    api.addEventListener(events.TRANSITION_START, (toState) => {
      captures.push({
        target: toState.name,
        observed: source.getSnapshot().toRoute?.name,
      });
    });

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

    // Verify toRoute was actually flipped to "settings" mid-flight, not just
    // observed at the IDLE endpoint. Both TRANSITION_START events captured
    // the source's snapshot post-update — confirms the source tracks the
    // current target through cancel/replace.
    expect(captures.map((c) => c.target)).toStrictEqual([
      "dashboard",
      "settings",
    ]);
    expect(captures.map((c) => c.observed)).toStrictEqual([
      "dashboard",
      "settings",
    ]);
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
    const startEvents = vi.fn();
    const api = getPluginApi(router);

    api.addEventListener(events.TRANSITION_START, startEvents);

    const listener = vi.fn();

    source.subscribe(listener);

    void router.navigate("dashboard").catch(() => {});

    for (const resolve of resolvers) {
      resolve(true);
    }

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(source.getSnapshot().isTransitioning).toBe(false);

    // Two TRANSITION_START events fire (the original + the reentrant one),
    // confirming the dedup branch was actually exercised. The source-level
    // listener is called fewer times than 2*N (one per emitted event) — the
    // exact count depends on which guard rejects first, but it must be at
    // least 1 (initial START update) and never zero.
    expect(startEvents.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(1);

    source.destroy();
  });

  it("repeated IDLE_SNAPSHOT (success after success) shares the same singleton ref", async () => {
    const source = createTransitionSource(router);
    const initialIdle = source.getSnapshot();
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("dashboard");

    // Sync nav with no async guards: START → LEAVE_APPROVE → SUCCESS = 3
    // notifications. After SUCCESS, snapshot is the IDLE singleton again.
    const callsAfterFirst = listener.mock.calls.length;

    expect(source.getSnapshot()).toBe(initialIdle);

    await router.navigate("settings");

    // Same 3 notifications for the second navigation. The audit-relevant
    // assertion: no spurious extra notifications from "IDLE → IDLE" — the
    // source visits IDLE exactly once between transitions.
    expect(listener).toHaveBeenCalledTimes(callsAfterFirst * 2);
    expect(source.getSnapshot()).toBe(initialIdle);
  });

  it("post-destroy: getSnapshot returns the captured snapshot, not default IDLE", async () => {
    // Capture a non-IDLE snapshot so post-destroy preservation is observable
    // distinct from "destroy resets to default" — verifies the snapshot is
    // truly frozen at destroy time.
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

    const snapshotAtDestroy = source.getSnapshot();

    expect(snapshotAtDestroy.isTransitioning).toBe(true);
    expect(snapshotAtDestroy.toRoute?.name).toBe("dashboard");

    source.destroy();

    // Same reference (frozen mid-transition), not the IDLE singleton.
    expect(source.getSnapshot()).toBe(snapshotAtDestroy);
    expect(source.getSnapshot().isTransitioning).toBe(true);

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
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

  it("destroy is idempotent — snapshot ref stable after N destroys", () => {
    const source = createTransitionSource(router);
    const beforeDestroy = source.getSnapshot();

    source.destroy();

    const afterFirstDestroy = source.getSnapshot();

    expect(afterFirstDestroy).toBe(beforeDestroy);

    expect(() => {
      source.destroy();
      source.destroy();
      source.destroy();
    }).not.toThrow();

    // Second/third destroys must not corrupt the snapshot — same reference.
    expect(source.getSnapshot()).toBe(afterFirstDestroy);
  });

  it("isLeaveApproved === false initially", () => {
    const source = createTransitionSource(router);
    const snapshot = source.getSnapshot();

    expect(snapshot.isLeaveApproved).toBe(false);
  });

  it("isLeaveApproved === true after TRANSITION_LEAVE_APPROVE", async () => {
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

    // After TRANSITION_LEAVE_APPROVE is emitted, isLeaveApproved should be true
    expect(source.getSnapshot().isLeaveApproved).toBe(true);

    resolveGuard(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("isLeaveApproved === false upon TRANSITION_SUCCESS", async () => {
    const source = createTransitionSource(router);

    await router.navigate("dashboard");

    // After TRANSITION_SUCCESS, should reset to IDLE_SNAPSHOT
    expect(source.getSnapshot().isLeaveApproved).toBe(false);
    expect(source.getSnapshot().isTransitioning).toBe(false);
  });

  it("isLeaveApproved === true before TRANSITION_CANCEL", async () => {
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

    // After TRANSITION_LEAVE_APPROVE is emitted, isLeaveApproved should be true
    expect(source.getSnapshot().isLeaveApproved).toBe(true);

    const p2 = router.navigate("settings");

    await Promise.resolve();

    resolveGuard(true);

    await p2;
    await p1.catch(() => {});

    expect(source.getSnapshot().isLeaveApproved).toBe(false);
    expect(source.getSnapshot().isTransitioning).toBe(false);
  });

  it("isLeaveApproved === true upon TRANSITION_LEAVE_APPROVE event", async () => {
    const api = getPluginApi(router);
    const source = createTransitionSource(router);
    const leaveApproveAssert = vi.fn();
    const startAssert = vi.fn();

    api.addEventListener(
      events.TRANSITION_LEAVE_APPROVE,
      (toState, fromState) => {
        leaveApproveAssert();

        expect(source.getSnapshot().isLeaveApproved).toBe(true);
        expect(source.getSnapshot().isTransitioning).toBe(true);
        expect(source.getSnapshot().toRoute).toBe(toState);
        expect(source.getSnapshot().fromRoute).toBe(fromState);
      },
    );

    api.addEventListener(events.TRANSITION_START, () => {
      startAssert();

      expect(source.getSnapshot().isLeaveApproved).toBe(false);
    });

    await router.navigate("dashboard");

    // Without these the inner expect()s in listeners can silently no-op if
    // the events never fire (false negative). Sync nav fires both events.
    expect(startAssert).toHaveBeenCalledTimes(1);
    expect(leaveApproveAssert).toHaveBeenCalledTimes(1);
  });
});
