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
    // resetError is the same stable function across snapshots (not re-allocated).
    expect(snap.resetError).toBe(source.getSnapshot().resetError);
  });

  it("snapshot.error becomes non-null on navigation error", async () => {
    const source = createDismissableError(router);
    const unsub = source.subscribe(() => {});

    await expect(router.navigate("nonexistent")).rejects.toThrow(
      /ROUTE_NOT_FOUND/,
    );

    const snap = source.getSnapshot();

    expect(snap.error).not.toBeNull();
    expect(snap.error!.code).toBe("ROUTE_NOT_FOUND");
    expect(snap.version).toBeGreaterThan(0);

    unsub();
  });

  it("error before first subscribe is caught up on subscribe (#765.2)", async () => {
    const source = createDismissableError(router); // zero subscribers

    // Error while the wrapper has ZERO subscribers — only the eager underlying
    // getErrorSource captures it; the wrapper snapshot stays stale until the
    // catch-up reconcile on first subscribe.
    await expect(router.navigate("nonexistent")).rejects.toThrow(
      /ROUTE_NOT_FOUND/,
    );

    let notified = 0;
    const unsub = source.subscribe(() => {
      notified++;
    });

    const snap = source.getSnapshot();

    expect(snap.error).not.toBeNull();
    expect(snap.error!.code).toBe("ROUTE_NOT_FOUND");
    // The listener (added before onFirstSubscribe by BaseSource) observes the
    // catch-up notification.
    expect(notified).toBe(1);

    unsub();
  });

  it("resetError() hides current error", async () => {
    const source = createDismissableError(router);
    const unsub = source.subscribe(() => {});

    await expect(router.navigate("nonexistent")).rejects.toThrow(
      /ROUTE_NOT_FOUND/,
    );
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

    await expect(router.navigate("first-missing")).rejects.toThrow(
      /ROUTE_NOT_FOUND/,
    );

    const firstVersion = source.getSnapshot().version;

    source.getSnapshot().resetError();

    expect(source.getSnapshot().error).toBeNull();

    await expect(router.navigate("second-missing")).rejects.toThrow(
      /ROUTE_NOT_FOUND/,
    );

    const snap = source.getSnapshot();

    expect(snap.error).not.toBeNull();
    expect(snap.version).toBeGreaterThan(firstVersion);

    unsub();
  });

  it("same error fired twice increments version and stays visible", async () => {
    const source = createDismissableError(router);
    const unsub = source.subscribe(() => {});

    await expect(router.navigate("missing")).rejects.toThrow(/ROUTE_NOT_FOUND/);

    const firstSnap = source.getSnapshot();
    const firstError = firstSnap.error;

    await expect(router.navigate("missing")).rejects.toThrow(/ROUTE_NOT_FOUND/);

    const secondSnap = source.getSnapshot();

    expect(secondSnap.version).toBeGreaterThan(firstSnap.version);
    // Core reuses the RouterError instance for repeated identical failures
    // (ROUTE_NOT_FOUND on the same target) — assert reference identity.
    expect(secondSnap.error).toBe(firstError);

    unsub();
  });

  it("subscribers notified on error and on resetError()", async () => {
    const source = createDismissableError(router);
    const notifications: (string | null)[] = [];

    const unsub = source.subscribe(() => {
      notifications.push(source.getSnapshot().error?.code ?? null);
    });

    await expect(router.navigate("nonexistent")).rejects.toThrow(
      /ROUTE_NOT_FOUND/,
    );

    source.getSnapshot().resetError();

    // Exactly two notifications: ROUTE_NOT_FOUND emitted by the error event,
    // then null emitted by resetError() advancing dismissedVersion.
    expect(notifications).toStrictEqual(["ROUTE_NOT_FOUND", null]);

    unsub();
  });

  it("resetError() is a no-op when already dismissed at the current version (audit §8.3)", async () => {
    const source = createDismissableError(router);
    const notifications: (string | null)[] = [];

    const unsub = source.subscribe(() => {
      notifications.push(source.getSnapshot().error?.code ?? null);
    });

    await expect(router.navigate("nonexistent")).rejects.toThrow(
      /ROUTE_NOT_FOUND/,
    );

    // First resetError advances dismissedVersion → emits one notification.
    source.getSnapshot().resetError();

    const snapshotAfterFirstReset = source.getSnapshot();
    const notificationsAfterFirstReset = notifications.length;

    // Three additional resetError() calls — all no-ops because dismissedVersion
    // is already at or above the live error-source version. No extra snapshot
    // allocations, no extra listener calls.
    source.getSnapshot().resetError();
    source.getSnapshot().resetError();
    source.getSnapshot().resetError();

    expect(source.getSnapshot()).toBe(snapshotAfterFirstReset);
    expect(notifications).toHaveLength(notificationsAfterFirstReset);

    unsub();
  });

  it("destroy() is a no-op — snapshot still works and resetError is callable", () => {
    const source = createDismissableError(router);

    source.destroy();
    source.destroy();

    const snap = source.getSnapshot();

    expect(snap.error).toBeNull();
    // resetError must be callable after destroy — it is a no-op on the shared
    // cached source, which survives individual consumer teardowns.
    expect(() => {
      snap.resetError();
    }).not.toThrow();
    expect(source.getSnapshot().error).toBeNull();
  });

  it("N consumers share one subscription — reset from one applies to all", async () => {
    const source = createDismissableError(router);

    const snaps: (string | null)[] = [];
    const unsubs = Array.from({ length: 5 }, (_, i) =>
      source.subscribe(() => {
        snaps[i] = source.getSnapshot().error?.code ?? null;
      }),
    );

    await expect(router.navigate("missing")).rejects.toThrow(/ROUTE_NOT_FOUND/);

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
