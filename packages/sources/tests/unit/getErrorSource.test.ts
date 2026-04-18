import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getErrorSource, createErrorSource } from "../../src";

import type { Router } from "@real-router/core";

describe("getErrorSource (per-router cache)", () => {
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

  it("returns the same instance on repeated calls for the same router", () => {
    const a = getErrorSource(router);
    const b = getErrorSource(router);

    expect(a).toBe(b);
  });

  it("returns different instances for different routers", async () => {
    const router2 = createRouter([{ name: "home", path: "/" }]);

    await router2.start("/");

    const a = getErrorSource(router);
    const b = getErrorSource(router2);

    expect(a).not.toBe(b);

    router2.stop();
  });

  it("destroy() is a no-op on cached source — subscribers still receive error events", async () => {
    const source = getErrorSource(router);

    source.destroy();

    const events: number[] = [];
    const unsub = source.subscribe(() => {
      events.push(source.getSnapshot().version);
    });

    await expect(router.navigate("nonexistent")).rejects.toThrow();

    expect(events.length).toBeGreaterThan(0);
    expect(source.getSnapshot().error).not.toBeNull();

    unsub();
  });

  it("initial snapshot has version 0 and null error", () => {
    const source = getErrorSource(router);
    const snap = source.getSnapshot();

    expect(snap.error).toBeNull();
    expect(snap.version).toBe(0);
  });

  it("createErrorSource (non-cached) still supports destroy()", () => {
    const fresh = createErrorSource(router);

    expect(() => {
      fresh.destroy();
    }).not.toThrow();
  });
});
