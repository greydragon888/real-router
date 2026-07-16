import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createErrorSource, getErrorSource, primeErrorSource } from "../../src";

import type { Router } from "@real-router/core";

describe("createErrorSource", () => {
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

  it("getSnapshot() returns initial snapshot", () => {
    const source = createErrorSource(router);

    expect(source.getSnapshot()).toStrictEqual({
      error: null,
      toRoute: null,
      fromRoute: null,
      version: 0,
    });
  });

  it("initial snapshot is frozen — shared singleton cannot be corrupted by a consumer (#768)", () => {
    // INITIAL_SNAPSHOT is shared across every error source of every router
    // until the first error. Mirrors the frozen IDLE_SNAPSHOT of
    // createTransitionSource — a consumer mutating it would corrupt the shared
    // singleton for all consumers.
    const source = createErrorSource(router);

    expect(Object.isFrozen(source.getSnapshot())).toBe(true);
  });

  it("TRANSITION_ERROR updates snapshot", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const source = createErrorSource(router);

    await router.navigate("dashboard").catch(() => {});

    const snapshot = source.getSnapshot();

    expect(snapshot.error).not.toBeNull();
    expect(snapshot.error!.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(snapshot.toRoute).not.toBeNull();
    expect(snapshot.toRoute!.name).toBe("dashboard");
    expect(snapshot.fromRoute).not.toBeNull();
    expect(snapshot.fromRoute!.name).toBe("home");
    expect(snapshot.version).toBe(1);
  });

  it("TRANSITION_SUCCESS resets error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const source = createErrorSource(router);

    await router.navigate("dashboard").catch(() => {});

    expect(source.getSnapshot().error).not.toBeNull();

    await router.navigate("settings");

    const snapshot = source.getSnapshot();

    expect(snapshot.error).toBeNull();
    expect(snapshot.toRoute).toBeNull();
    expect(snapshot.fromRoute).toBeNull();
  });

  it("TRANSITION_CANCEL does NOT update snapshot", async () => {
    const lifecycle = getLifecycleApi(router);
    let resolveGuard!: (value: boolean) => void;

    lifecycle.addActivateGuard("dashboard", () => () => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    const source = createErrorSource(router);
    const initialSnapshot = source.getSnapshot();
    const listener = vi.fn();

    source.subscribe(listener);

    const p1 = router.navigate("dashboard");

    await Promise.resolve();

    const p2 = router.navigate("settings");

    await Promise.resolve();

    resolveGuard(true);
    await p2;
    await p1.catch(() => {});

    const snapshot = source.getSnapshot();

    expect(snapshot.error).toBeNull();
    expect(snapshot.version).toBe(0);
    // Snapshot is the same INITIAL ref — TRANSITION_CANCEL never reaches
    // the source. Plus the listener was never invoked: the source ignores
    // CANCEL entirely (no error path, no success-clear path).
    expect(snapshot).toBe(initialSnapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy() unsubscribes from events", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const source = createErrorSource(router);

    source.destroy();

    await router.navigate("dashboard").catch(() => {});

    const snapshot = source.getSnapshot();

    expect(snapshot.error).toBeNull();
    expect(snapshot.version).toBe(0);
  });

  it("repeated error updates snapshot", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);
    lifecycle.addActivateGuard("settings", () => () => false);

    const source = createErrorSource(router);

    await router.navigate("dashboard").catch(() => {});

    expect(source.getSnapshot().error!.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(source.getSnapshot().version).toBe(1);

    await router.navigate("settings").catch(() => {});

    expect(source.getSnapshot().error!.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(source.getSnapshot().version).toBe(2);
  });

  it("subscribe/getSnapshot compatibility — listeners notified on error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const source = createErrorSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("dashboard").catch(() => {});

    // Exactly one notification: TRANSITION_ERROR fires once per failed
    // navigation, and the source updates the snapshot exactly once.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot().error).not.toBeNull();
  });

  it("version increments on each ERROR", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);
    lifecycle.addActivateGuard("settings", () => () => false);

    const source = createErrorSource(router);

    await router.navigate("dashboard").catch(() => {});

    expect(source.getSnapshot().version).toBe(1);

    await router.navigate("settings").catch(() => {});

    expect(source.getSnapshot().version).toBe(2);
  });

  it("undefined → null conversion for ROUTE_NOT_FOUND (navigate)", async () => {
    const source = createErrorSource(router);

    await router.navigate("nonexistent").catch(() => {});

    const snapshot = source.getSnapshot();

    expect(snapshot.error).not.toBeNull();
    expect(snapshot.error!.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    expect(snapshot.toRoute).toBeNull();
    expect(snapshot.fromRoute).not.toBeNull();
    expect(snapshot.fromRoute!.name).toBe("home");
    expect(snapshot.version).toBe(1);
  });

  it("version does NOT change on SUCCESS", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const source = createErrorSource(router);

    await router.navigate("dashboard").catch(() => {});

    const versionAfterError = source.getSnapshot().version;

    await router.navigate("settings");

    expect(source.getSnapshot().version).toBe(versionAfterError);
  });

  it("SUCCESS without error is no-op — listeners NOT called", async () => {
    const source = createErrorSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("dashboard");

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy is idempotent — snapshot ref stable after N destroys", () => {
    const source = createErrorSource(router);
    const beforeDestroy = source.getSnapshot();

    source.destroy();

    expect(source.getSnapshot()).toBe(beforeDestroy);

    expect(() => {
      source.destroy();
      source.destroy();
    }).not.toThrow();

    expect(source.getSnapshot()).toBe(beforeDestroy);
  });

  it("post-destroy: getSnapshot returns last value", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const source = createErrorSource(router);

    await router.navigate("dashboard").catch(() => {});

    expect(source.getSnapshot().error).not.toBeNull();

    source.destroy();

    expect(source.getSnapshot().error).not.toBeNull();
    expect(source.getSnapshot().error!.code).toBe(errorCodes.CANNOT_ACTIVATE);
  });

  it("post-destroy: subscribe returns no-op", () => {
    const source = createErrorSource(router);

    source.destroy();

    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  it("unwinds already-registered listeners when addEventListener throws mid-registration (#1440)", () => {
    // The emitter's on() throws on a duplicate listener (EventEmitter.ts:84) or
    // at the maxListeners cap — i.e. api.addEventListener CAN throw. If it throws
    // on the 2nd of the factory's two registrations, the 1st (TRANSITION_ERROR)
    // listener is already live: without an unwind it leaks and pins the router,
    // and unsubs never gets assigned so the half-wired source is undestroyable
    // (TDZ). Simulate the throw and assert the registered listener is unwound.
    const api = getPluginApi(router);
    const originalAdd = api.addEventListener.bind(api);
    const registeredUnsubs: (() => void)[] = [];
    let calls = 0;

    const spy = vi
      .spyOn(api, "addEventListener")
      .mockImplementation((event, cb) => {
        calls += 1;

        if (calls === 2) {
          throw new Error("addEventListener boom");
        }

        const unsub = vi.fn(originalAdd(event, cb));

        registeredUnsubs.push(unsub);

        return unsub;
      });

    expect(() => createErrorSource(router)).toThrow(/boom/);

    // The one already-registered listener must have been unsubscribed during
    // the unwind — not left live.
    expect(registeredUnsubs).toHaveLength(1);
    expect(registeredUnsubs[0]).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});

describe("primeErrorSource (#778)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("eagerly subscribes the error source so an error fired before getErrorSource is captured", async () => {
    // Prime BEFORE the error. Without it, the first getErrorSource call AFTER
    // the error would create the eager source too late and miss it (the #778
    // boundary-after-error window).
    primeErrorSource(router);

    await expect(router.navigate("nonexistent")).rejects.toThrow();

    // getErrorSource returns the SAME cached source the prime created — it was
    // subscribed in time, so it captured the error.
    const snap = getErrorSource(router).getSnapshot();

    expect(snap.error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
  });

  it("is a no-op (does not throw) for a router with no internals-registry entry", () => {
    // An Object.create-derived router-like (a test stub, or a not-yet-registered
    // clone) has a fresh identity → getPluginApi/getInternals throws. prime must
    // swallow it so a Provider eagerly priming the error source never crashes on
    // a router the lazy route source would tolerate.
    const stub = Object.create(router) as Router;

    expect(() => {
      primeErrorSource(stub);
    }).not.toThrow();
  });
});
