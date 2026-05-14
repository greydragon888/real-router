import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createActiveRouteSource } from "../../src";

import type { Router } from "@real-router/core";

describe("createActiveRouteSource (per-router + canonical-args cache)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns the same instance for same args", () => {
    const a = createActiveRouteSource(router, "users");
    const b = createActiveRouteSource(router, "users");

    expect(a).toBe(b);
  });

  it("params with reordered keys hit the same cache entry", () => {
    const a = createActiveRouteSource(router, "users.view", {
      id: "1",
      tab: "a",
    });
    const b = createActiveRouteSource(router, "users.view", {
      tab: "a",
      id: "1",
    });

    expect(a).toBe(b);
  });

  it("different strict flag produces different instance", () => {
    const a = createActiveRouteSource(router, "users", undefined, {
      strict: false,
    });
    const b = createActiveRouteSource(router, "users", undefined, {
      strict: true,
    });

    expect(a).not.toBe(b);
  });

  it("different ignoreQueryParams flag produces different instance", () => {
    const a = createActiveRouteSource(router, "users", undefined, {
      ignoreQueryParams: true,
    });
    const b = createActiveRouteSource(router, "users", undefined, {
      ignoreQueryParams: false,
    });

    expect(a).not.toBe(b);
  });

  it("default options produces same instance as undefined options", () => {
    const a = createActiveRouteSource(router, "users");
    const b = createActiveRouteSource(router, "users", undefined, {});
    const c = createActiveRouteSource(router, "users", undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("different routeName produces different instance", () => {
    const a = createActiveRouteSource(router, "users");
    const b = createActiveRouteSource(router, "home");

    expect(a).not.toBe(b);
  });

  it("returns different instances for different routers", async () => {
    const router2 = createRouter([{ name: "home", path: "/" }]);

    await router2.start("/");

    const a = createActiveRouteSource(router, "home");
    const b = createActiveRouteSource(router2, "home");

    expect(a).not.toBe(b);

    router2.stop();
  });

  it("BigInt params fall back to non-cached source (no throw)", () => {
    const bigintParams = { id: 1n } as unknown as Record<string, string>;

    const a = createActiveRouteSource(router, "users", bigintParams);
    const b = createActiveRouteSource(router, "users", bigintParams);

    // Each call produces a fresh non-cached source (canonicalJson throws on BigInt).
    expect(a).not.toBe(b);
    // Snapshot still works.
    expect(typeof a.getSnapshot()).toBe("boolean");

    a.destroy();
    b.destroy();
  });

  it("Map-valued params fall back to non-cached source (canonicalJson throws on Map)", () => {
    // Audit §5.B: prior to the fix, `new Map()` would silently serialize to
    // `"{}"` → collision with any other params that also serialize to `"{}"`.
    // Now canonicalJson throws → fallback path with working destroy.
    const mapParams = { id: new Map() } as unknown as Record<string, string>;

    const a = createActiveRouteSource(router, "users", mapParams);
    const b = createActiveRouteSource(router, "users", mapParams);

    expect(a).not.toBe(b);
    expect(typeof a.getSnapshot()).toBe("boolean");

    a.destroy();
    b.destroy();
  });

  it("Set-valued params fall back to non-cached source (canonicalJson throws on Set)", () => {
    const setParams = { id: new Set() } as unknown as Record<string, string>;

    const a = createActiveRouteSource(router, "users", setParams);
    const b = createActiveRouteSource(router, "users", setParams);

    expect(a).not.toBe(b);

    a.destroy();
    b.destroy();
  });

  it("RegExp-valued params do NOT collide with empty-params cache entry (audit §5.B)", () => {
    // Before the fix: canonicalJson({ id: /x/ }) === '{"id":{}}' would alias
    // with another input that serialised to the same shape. After the fix,
    // RegExp throws → fallback path → separate source instance.
    const regexpSource = createActiveRouteSource(router, "users", {
      id: /x/,
    } as unknown as Record<string, string>);
    const emptyParamsSource = createActiveRouteSource(router, "users", {});

    expect(regexpSource).not.toBe(emptyParamsSource);

    regexpSource.destroy();
  });

  it("non-cached fallback: destroy() unwinds the router subscription (no leak)", async () => {
    const bigintParams = { id: 1n } as unknown as Record<string, string>;
    const originalSubscribe = router.subscribe.bind(router);
    const unsubscribeSpies: ReturnType<typeof vi.fn>[] = [];

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      const realUnsub = originalSubscribe(listener);
      const spy = vi.fn(() => {
        realUnsub();
      });

      unsubscribeSpies.push(spy);

      return spy;
    });

    const source = createActiveRouteSource(router, "users", bigintParams);

    expect(unsubscribeSpies).toHaveLength(1);
    expect(unsubscribeSpies[0]).not.toHaveBeenCalled();

    source.destroy();

    // The router-level unsubscribe must have been invoked exactly once when
    // destroy() ran — otherwise the wrapper leaks for the router lifetime.
    expect(unsubscribeSpies[0]).toHaveBeenCalledTimes(1);

    // Idempotent destroy.
    source.destroy();

    expect(unsubscribeSpies[0]).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it("destroy() is a no-op — shared source ignores external teardown", async () => {
    const source = createActiveRouteSource(router, "users");

    source.destroy();

    const updates: boolean[] = [];
    const unsub = source.subscribe(() => {
      updates.push(source.getSnapshot());
    });

    await router.navigate("users.view", { id: "1" });

    expect(updates.length).toBeGreaterThan(0);
    expect(source.getSnapshot()).toBe(true);

    unsub();
  });
});
