import { createRouter, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createTransitionSource } from "../../src";
import {
  nextLeaveApproveSnapshot,
  nextTransitionStartSnapshot,
} from "../../src/createTransitionSource";

import type { RouterTransitionSnapshot } from "../../src";
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

    // TRANSITION_START fires synchronously within navigate() (before the async
    // activate guard suspends), so the snapshot is observable without any flush.
    const navPromise = router.navigate("dashboard");

    expect(source.getSnapshot().isTransitioning).toBe(true);

    resolveGuard(true);
    await navPromise;
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

    // TRANSITION_START fires synchronously within navigate().
    const navPromise = router.navigate("dashboard");

    const snapshot = source.getSnapshot();

    expect(snapshot.toRoute).not.toBeNull();
    expect(snapshot.toRoute!.name).toBe("dashboard");

    resolveGuard(true);
    await navPromise;
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

    // TRANSITION_START fires synchronously within navigate().
    const navPromise = router.navigate("dashboard");

    const snapshot = source.getSnapshot();

    expect(snapshot.fromRoute).not.toBeNull();
    expect(snapshot.fromRoute!.name).toBe("home");

    resolveGuard(true);
    await navPromise;
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

    // TRANSITION_START fires synchronously within navigate().
    expect(source.getSnapshot().isTransitioning).toBe(true);

    // Cancel by navigating elsewhere (settings has no guard)
    const p2 = router.navigate("settings");

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

    // START + LEAVE_APPROVE fire synchronously within navigate() (before the
    // async activate guard suspends), so the listener has already been notified
    // exactly twice — both events call updateSnapshot which always notifies.
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

    const navPromise = router.navigate("dashboard");

    expect(listener).not.toHaveBeenCalled();
    expect(source.getSnapshot().isTransitioning).toBe(false);

    resolveGuard(true);
    await navPromise;
  });

  it("destroy() prevents further updates", async () => {
    const source = createTransitionSource(router);

    source.destroy();

    await router.navigate("dashboard");

    expect(source.getSnapshot().isTransitioning).toBe(false);
  });

  it("unwinds already-registered listeners when addEventListener throws mid-registration (#1440)", () => {
    // Same partial-registration hazard as createErrorSource: the factory
    // registers 5 listeners; a throw on the 3rd (the emitter rejecting a
    // duplicate listener / hitting its maxListeners cap) must unwind the first
    // 2 instead of leaking them and stranding the undestroyable half-wired
    // source (unsubs TDZ).
    const api = getPluginApi(router);
    const originalAdd = api.addEventListener.bind(api);
    const registeredUnsubs: (() => void)[] = [];
    let calls = 0;

    const spy = vi
      .spyOn(api, "addEventListener")
      .mockImplementation((event, cb) => {
        calls += 1;

        if (calls === 3) {
          throw new Error("addEventListener boom");
        }

        const unsub = vi.fn(originalAdd(event, cb));

        registeredUnsubs.push(unsub);

        return unsub;
      });

    expect(() => createTransitionSource(router)).toThrow(/boom/);

    // Both already-registered listeners must have been unsubscribed during the
    // unwind — not left live.
    expect(registeredUnsubs).toHaveLength(2);
    expect(registeredUnsubs[0]).toHaveBeenCalledTimes(1);
    expect(registeredUnsubs[1]).toHaveBeenCalledTimes(1);

    spy.mockRestore();
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

    // TRANSITION_START fires synchronously within navigate().
    expect(source.getSnapshot().toRoute).not.toBeNull();
    expect(source.getSnapshot().toRoute!.name).toBe("dashboard");

    // New navigation cancels previous
    const p2 = router.navigate("settings");

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

  it("concurrent (superseding) TRANSITION_START events each produce a fresh snapshot (post-#605 dedup is unreachable, but every snapshot must be a new reference)", async () => {
    // RFC §4 bans reentrant navigate from a listener, so multiple TRANSITION_START
    // events within one settle are produced by CONCURRENT (superseding) navigation
    // instead: a first nav suspends on an async guard, a second supersedes it.
    const lifecycle = getLifecycleApi(router);
    let resolveDashboard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveDashboard = resolve;
      });
    });

    const source = createTransitionSource(router);
    // Capture the IDLE_SNAPSHOT singleton before any nav — used below as the
    // reference for the post-settle assertion. The singleton is module-private
    // (`createTransitionSource.ts:15`), so we observe it through the public
    // initial snapshot rather than importing it directly.
    const idleSnapshot = source.getSnapshot();
    const startEvents = vi.fn();
    const api = getPluginApi(router);

    api.addEventListener(events.TRANSITION_START, startEvents);

    // Capture the snapshot the listener observes at each notification — this
    // turns the listener into a reference-by-reference trace we can assert
    // against, instead of just counting calls.
    const snapshotTrace: RouterTransitionSnapshot[] = [];
    const listener = vi.fn(() => {
      snapshotTrace.push(source.getSnapshot());
    });

    source.subscribe(listener);

    // First nav suspends on the async dashboard guard → TRANSITION_START #1.
    const first = router.navigate("dashboard").catch(() => {});
    // A concurrent nav supersedes it → TRANSITION_START #2 (no reentrancy).
    const second = router.navigate("settings");

    // Drain the now-superseded dashboard guard.
    resolveDashboard(true);

    await first;
    await second;

    // 1. Two TRANSITION_START events fired — the original plus the superseding
    //    concurrent navigation.
    expect(startEvents).toHaveBeenCalledTimes(2);

    // 2. The source settled back to IDLE after all transitions resolved.
    expect(source.getSnapshot()).toBe(idleSnapshot);
    expect(source.getSnapshot().isTransitioning).toBe(false);
    expect(source.getSnapshot().isLeaveApproved).toBe(false);

    // 3. The listener observed every state-changing snapshot — at minimum the
    //    initial entry into a transitioning state plus the final reset to IDLE.
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);

    // 4. **Snapshot identity invariant (covers the dedup contract via its
    //    observable consequence):** no two adjacent notifications produced
    //    the same snapshot reference. If `nextTransitionStartSnapshot`
    //    returned `null` from the dedup guard, `source.updateSnapshot` would
    //    be skipped and the listener would not fire — so a duplicate-ref
    //    notification can never appear in this trace. Conversely, a
    //    regression that made the guard always return the previous snapshot
    //    (instead of `null`) would surface here as two identical refs in
    //    a row.
    expect(snapshotTrace.length).toBeGreaterThan(0);

    for (let i = 1; i < snapshotTrace.length; i++) {
      expect(snapshotTrace[i]).not.toBe(snapshotTrace[i - 1]);
    }

    // 5. The trace passed through a transitioning state at some point — the
    //    initial TRANSITION_START (or the post-reentrant one) flipped the
    //    source to `isTransitioning: true` before the final settle.
    expect(snapshotTrace.some((s) => s.isTransitioning)).toBe(true);
    // 6. The final emitted snapshot is the singleton IDLE — proves the
    //    SUCCESS/CANCEL collapse path ran and the source converged cleanly
    //    via the shared `IDLE_SNAPSHOT` constant (captured at construction).
    expect(snapshotTrace.at(-1)).toBe(idleSnapshot);

    source.destroy();
  });

  function fakeState(path: string, name = "x"): State {
    return {
      name,
      params: {},
      path,
      transition: { phase: "activating", segments: [], reload: false },
      context: {},
    } as unknown as State;
  }

  describe("nextTransitionStartSnapshot (dedup guard, direct unit)", () => {
    it("returns next snapshot from IDLE (initial transition entry)", () => {
      const idle: RouterTransitionSnapshot = {
        isTransitioning: false,
        isLeaveApproved: false,
        toRoute: null,
        fromRoute: null,
      };
      const toState = fakeState("/a", "a");
      const fromState = fakeState("/", "home");

      const next = nextTransitionStartSnapshot(idle, toState, fromState);

      expect(next).toStrictEqual({
        isTransitioning: true,
        isLeaveApproved: false,
        toRoute: toState,
        fromRoute: fromState,
      });
    });

    it("returns null (dedup skip) when re-entered with path-equal States", () => {
      const toState = fakeState("/a", "a");
      const fromState = fakeState("/", "home");
      const prev: RouterTransitionSnapshot = {
        isTransitioning: true,
        isLeaveApproved: false,
        toRoute: toState,
        fromRoute: fromState,
      };

      // Fresh State refs with the same paths — stabilizeState collapses them
      // back to prev.toRoute/prev.fromRoute → guard fires.
      const toStateAgain = fakeState("/a", "a");
      const fromStateAgain = fakeState("/", "home");

      expect(
        nextTransitionStartSnapshot(prev, toStateAgain, fromStateAgain),
      ).toBeNull();
    });

    it("returns next snapshot when paths differ even while transitioning", () => {
      const stateA = fakeState("/a", "a");
      const prev: RouterTransitionSnapshot = {
        isTransitioning: true,
        isLeaveApproved: false,
        toRoute: stateA,
        fromRoute: null,
      };
      const stateB = fakeState("/b", "b");

      const next = nextTransitionStartSnapshot(prev, stateB, undefined);

      expect(next).not.toBeNull();
      expect(next?.toRoute).toBe(stateB);
      expect(next?.fromRoute).toBeNull();
    });

    it("returns next snapshot when prev is not transitioning (precondition unmet)", () => {
      const stateA = fakeState("/a", "a");
      const prev: RouterTransitionSnapshot = {
        isTransitioning: false,
        isLeaveApproved: false,
        toRoute: stateA,
        fromRoute: null,
      };
      const stateAClone = fakeState("/a", "a");

      // Even though path-equal, guard requires prev.isTransitioning=true.
      const next = nextTransitionStartSnapshot(prev, stateAClone, undefined);

      expect(next).not.toBeNull();
      expect(next?.isTransitioning).toBe(true);
    });
  });

  describe("nextLeaveApproveSnapshot (dedup guard, direct unit)", () => {
    it("returns next snapshot with isLeaveApproved=true on first call", () => {
      const toState = fakeState("/a", "a");
      const fromState = fakeState("/", "home");
      const prev: RouterTransitionSnapshot = {
        isTransitioning: true,
        isLeaveApproved: false,
        toRoute: toState,
        fromRoute: fromState,
      };

      const next = nextLeaveApproveSnapshot(prev, toState, fromState);

      expect(next).toStrictEqual({
        isTransitioning: true,
        isLeaveApproved: true,
        toRoute: toState,
        fromRoute: fromState,
      });
    });

    it("returns null (dedup skip) when called twice with path-equal States after LEAVE_APPROVE", () => {
      const toState = fakeState("/a", "a");
      const fromState = fakeState("/", "home");
      const prev: RouterTransitionSnapshot = {
        isTransitioning: true,
        isLeaveApproved: true,
        toRoute: toState,
        fromRoute: fromState,
      };

      expect(
        nextLeaveApproveSnapshot(
          prev,
          fakeState("/a", "a"),
          fakeState("/", "home"),
        ),
      ).toBeNull();
    });

    it("returns next snapshot when prev.isLeaveApproved=false (precondition unmet)", () => {
      const toState = fakeState("/a", "a");
      const prev: RouterTransitionSnapshot = {
        isTransitioning: true,
        isLeaveApproved: false,
        toRoute: toState,
        fromRoute: null,
      };

      const next = nextLeaveApproveSnapshot(prev, toState, undefined);

      expect(next).not.toBeNull();
      expect(next?.isLeaveApproved).toBe(true);
    });
  });

  it("repeated IDLE_SNAPSHOT (success after success) shares the same singleton ref", async () => {
    const source = createTransitionSource(router);
    const initialIdle = source.getSnapshot();
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("dashboard");

    // Sync nav with no async guards: START → LEAVE_APPROVE → SUCCESS = 3
    // notifications. After SUCCESS, snapshot is the IDLE singleton again.
    expect(listener).toHaveBeenCalledTimes(3);
    expect(source.getSnapshot()).toBe(initialIdle);

    await router.navigate("settings");

    // Second navigation emits the same 3 events, no spurious "IDLE → IDLE"
    // notification in between → total stays at 6.
    expect(listener).toHaveBeenCalledTimes(6);
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

    const navPromise = router.navigate("dashboard");

    const snapshotAtDestroy = source.getSnapshot();

    expect(snapshotAtDestroy.isTransitioning).toBe(true);
    expect(snapshotAtDestroy.toRoute?.name).toBe("dashboard");

    source.destroy();

    // Same reference (frozen mid-transition), not the IDLE singleton.
    expect(source.getSnapshot()).toBe(snapshotAtDestroy);
    expect(source.getSnapshot().isTransitioning).toBe(true);

    resolveGuard(true);
    await navPromise;
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

    // TRANSITION_LEAVE_APPROVE is emitted synchronously within navigate().
    const navPromise = router.navigate("dashboard");

    expect(source.getSnapshot().isLeaveApproved).toBe(true);

    resolveGuard(true);
    await navPromise;
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

    // TRANSITION_LEAVE_APPROVE is emitted synchronously within navigate().
    expect(source.getSnapshot().isLeaveApproved).toBe(true);

    const p2 = router.navigate("settings");

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

  describe("IDLE_SNAPSHOT immutability (audit §5.K)", () => {
    it("initial getSnapshot() returns a frozen object", () => {
      const source = createTransitionSource(router);
      const idle = source.getSnapshot();

      expect(Object.isFrozen(idle)).toBe(true);

      source.destroy();
    });

    it("attempting to mutate a property throws in strict mode", () => {
      const source = createTransitionSource(router);
      const idle = source.getSnapshot();

      expect(() => {
        (idle as unknown as { toRoute: unknown }).toRoute = { hijacked: true };
      }).toThrow(TypeError);
      // Snapshot reference is unchanged.
      expect(source.getSnapshot().toRoute).toBeNull();

      source.destroy();
    });

    it("IDLE singleton across navigations stays frozen (every IDLE return is the same frozen ref)", async () => {
      const source = createTransitionSource(router);
      const initialIdle = source.getSnapshot();

      await router.navigate("dashboard");

      expect(source.getSnapshot()).toBe(initialIdle);
      expect(Object.isFrozen(source.getSnapshot())).toBe(true);

      await router.navigate("settings");

      expect(source.getSnapshot()).toBe(initialIdle);
      expect(Object.isFrozen(source.getSnapshot())).toBe(true);

      source.destroy();
    });
  });
});
