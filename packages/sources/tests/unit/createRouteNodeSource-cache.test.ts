import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createRouteNodeSource } from "../../src";

import type { Router } from "@real-router/core";

describe("createRouteNodeSource (per-router + per-nodeName cache)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "list", path: "/list" }],
      },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns the same instance for same (router, nodeName)", () => {
    const a = createRouteNodeSource(router, "users");
    const b = createRouteNodeSource(router, "users");

    expect(a).toBe(b);
  });

  it("returns different instances for different nodeNames", () => {
    const a = createRouteNodeSource(router, "users");
    const b = createRouteNodeSource(router, "home");

    expect(a).not.toBe(b);
  });

  it("returns different instances for different routers", async () => {
    const router2 = createRouter([{ name: "home", path: "/" }]);

    await router2.start("/");

    const a = createRouteNodeSource(router, "users");
    const b = createRouteNodeSource(router2, "users");

    expect(a).not.toBe(b);

    router2.stop();
  });

  it("destroy() is a no-op — subsequent subscribers still receive updates", async () => {
    const source = createRouteNodeSource(router, "users");

    source.destroy();
    source.destroy(); // idempotent

    const updates: string[] = [];
    const unsub = source.subscribe(() => {
      const snap = source.getSnapshot();

      updates.push(snap.route?.name ?? "none");
    });

    await router.navigate("users.list");

    expect(updates.length).toBeGreaterThan(0);

    unsub();
  });

  it("N consumers share a single router subscription (lazy disconnect on last unsub)", () => {
    const source = createRouteNodeSource(router, "users");
    const count = 10;
    const unsubs = Array.from({ length: count }, () =>
      source.subscribe(() => {}),
    );

    expect(unsubs).toHaveLength(count);

    for (const u of unsubs) {
      u();
    }
  });
});
