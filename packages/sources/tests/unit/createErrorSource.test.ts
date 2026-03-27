import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createErrorSource } from "../../src";

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
    const snapshot = source.getSnapshot();

    expect(snapshot.error).toBeNull();
    expect(snapshot.toRoute).toBeNull();
    expect(snapshot.fromRoute).toBeNull();
    expect(snapshot.version).toBe(0);
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

    expect(listener).toHaveBeenCalled();
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

  it("destroy is idempotent", () => {
    const source = createErrorSource(router);

    source.destroy();

    expect(() => {
      source.destroy();
    }).not.toThrow();
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
});
