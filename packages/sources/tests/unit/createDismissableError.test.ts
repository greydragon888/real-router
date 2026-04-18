import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createDismissableError } from "../../src";

import type { Router } from "@real-router/core";

describe("createDismissableError", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "valid", path: "/valid" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns the same instance for the same router", () => {
    const a = createDismissableError(router);
    const b = createDismissableError(router);

    expect(a).toBe(b);
  });

  it("returns different instances for different routers", async () => {
    const router2 = createRouter([{ name: "home", path: "/" }]);

    await router2.start("/");

    const a = createDismissableError(router);
    const b = createDismissableError(router2);

    expect(a).not.toBe(b);

    router2.stop();
  });

  it("initial snapshot has null error and version 0", () => {
    const source = createDismissableError(router);
    const snap = source.getSnapshot();

    expect(snap.error).toBeNull();
    expect(snap.toRoute).toBeNull();
    expect(snap.fromRoute).toBeNull();
    expect(snap.version).toBe(0);
    expect(typeof snap.resetError).toBe("function");
  });

  it("snapshot.error becomes non-null on navigation error", async () => {
    const source = createDismissableError(router);
    const unsub = source.subscribe(() => {});

    await expect(router.navigate("nonexistent")).rejects.toThrow();

    const snap = source.getSnapshot();

    expect(snap.error).not.toBeNull();
    expect(snap.error!.code).toBe("ROUTE_NOT_FOUND");
    expect(snap.version).toBeGreaterThan(0);

    unsub();
  });

  it("resetError() hides current error", async () => {
    const source = createDismissableError(router);
    const unsub = source.subscribe(() => {});

    await expect(router.navigate("nonexistent")).rejects.toThrow();
    expect(source.getSnapshot().error).not.toBeNull();

    source.getSnapshot().resetError();

    expect(source.getSnapshot().error).toBeNull();
    expect(source.getSnapshot().toRoute).toBeNull();
    expect(source.getSnapshot().fromRoute).toBeNull();

    unsub();
  });

  it("next error after resetError() becomes visible again", async () => {
    const source = createDismissableError(router);
    const unsub = source.subscribe(() => {});

    await expect(router.navigate("first-missing")).rejects.toThrow();

    const firstVersion = source.getSnapshot().version;

    source.getSnapshot().resetError();

    expect(source.getSnapshot().error).toBeNull();

    await expect(router.navigate("second-missing")).rejects.toThrow();

    const snap = source.getSnapshot();

    expect(snap.error).not.toBeNull();
    expect(snap.version).toBeGreaterThan(firstVersion);

    unsub();
  });

  it("same error fired twice increments version and stays visible", async () => {
    const source = createDismissableError(router);
    const unsub = source.subscribe(() => {});

    await expect(router.navigate("missing")).rejects.toThrow();

    const firstSnap = source.getSnapshot();
    const firstError = firstSnap.error;

    await expect(router.navigate("missing")).rejects.toThrow();

    const secondSnap = source.getSnapshot();

    expect(secondSnap.error).not.toBeNull();
    expect(secondSnap.version).toBeGreaterThan(firstSnap.version);
    // Same error code (same behaviour — core may reuse the error instance)
    expect(secondSnap.error!.code).toBe(firstError!.code);

    unsub();
  });

  it("subscribers notified on error and on resetError()", async () => {
    const source = createDismissableError(router);
    const notifications: (string | null)[] = [];

    const unsub = source.subscribe(() => {
      notifications.push(source.getSnapshot().error?.code ?? null);
    });

    await expect(router.navigate("nonexistent")).rejects.toThrow();

    source.getSnapshot().resetError();

    expect(notifications.length).toBeGreaterThanOrEqual(2);
    expect(notifications[0]).toBe("ROUTE_NOT_FOUND");
    expect(notifications.at(-1)).toBeNull();

    unsub();
  });

  it("destroy() is a no-op — snapshot still works", () => {
    const source = createDismissableError(router);

    source.destroy();
    source.destroy();

    expect(source.getSnapshot().error).toBeNull();
    expect(typeof source.getSnapshot().resetError).toBe("function");
  });

  it("N consumers share one subscription — reset from one applies to all", async () => {
    const source = createDismissableError(router);

    const snaps: (string | null)[] = [];
    const unsubs = Array.from({ length: 5 }, (_, i) =>
      source.subscribe(() => {
        snaps[i] = source.getSnapshot().error?.code ?? null;
      }),
    );

    await expect(router.navigate("missing")).rejects.toThrow();

    // All 5 consumers see the error.
    expect(snaps.every((s) => s === "ROUTE_NOT_FOUND")).toBe(true);

    // One consumer calls resetError()
    source.getSnapshot().resetError();

    // All 5 consumers see null.
    expect(snaps.every((s) => s === null)).toBe(true);

    for (const u of unsubs) {
      u();
    }
  });
});
