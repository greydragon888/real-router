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
    const a = createActiveRouteSource(router, "users", undefined, undefined, {
      strict: false,
    });
    const b = createActiveRouteSource(router, "users", undefined, undefined, {
      strict: true,
    });

    expect(a).not.toBe(b);
  });

  it("different ignoreQueryParams flag produces different instance", () => {
    const a = createActiveRouteSource(router, "users", undefined, undefined, {
      ignoreQueryParams: true,
    });
    const b = createActiveRouteSource(router, "users", undefined, undefined, {
      ignoreQueryParams: false,
    });

    expect(a).not.toBe(b);
  });

  it("default options produces same instance as undefined options", () => {
    const a = createActiveRouteSource(router, "users");
    const b = createActiveRouteSource(
      router,
      "users",
      undefined,
      undefined,
      {},
    );
    const c = createActiveRouteSource(router, "users", undefined, undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("params === undefined and params === {} are distinct cache keys (audit §1 MEDIUM)", () => {
    // canonicalJson(undefined) → "undefined" (string) vs canonicalJson({}) → "{}"
    // so these two calls produce different cache entries and different instances.
    const withUndefined = createActiveRouteSource(router, "users");
    const withEmpty = createActiveRouteSource(router, "users", {});

    expect(withUndefined).not.toBe(withEmpty);

    // Both are functional sources.
    expect(withUndefined.getSnapshot()).toBe(false);
    expect(withEmpty.getSnapshot()).toBe(false);
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
    // Snapshot is false (router is on "/", not an active "users" route).
    expect(a.getSnapshot()).toBe(false);

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
    // Snapshot is false (router is on "/", not an active "users" route).
    expect(a.getSnapshot()).toBe(false);

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

  it("circular params fall back to non-cached source (canonicalJson throws TypeError on cycle, audit §5)", () => {
    // After the canonicalJson rewrite to explicit canonicalize() with path-based
    // cycle detection, a self-cycle throws TypeError("circular structure") —
    // createActiveRouteSource catches it and returns a fresh non-cached source
    // with a working destroy(). Prior to the rewrite the implementation threw
    // RangeError via stack overflow; the documented contract was inconsistent
    // with the actual error type.
    const cyclic: Record<string, unknown> = {};

    cyclic.self = cyclic;
    const cyclicParams = cyclic as unknown as Record<string, string>;

    const a = createActiveRouteSource(router, "users", cyclicParams);
    const b = createActiveRouteSource(router, "users", cyclicParams);

    // Each call goes through the catch-fallback path → independent instances.
    expect(a).not.toBe(b);
    // Source is functional — snapshot computes against the live router state.
    expect(typeof a.getSnapshot()).toBe("boolean");
    expect(typeof b.getSnapshot()).toBe("boolean");

    a.destroy();
    b.destroy();
  });

  it("params with `__proto__` own key do NOT collide with params that omit it (audit §5)", () => {
    // canonicalJson uses Object.create(null) for the sorted record so
    // `__proto__` is treated as a regular own property. The cache key
    // therefore distinguishes between {__proto__: x, b: 1} and {b: 1}.
    const withProto = Object.fromEntries([
      ["__proto__", "x"],
      ["b", "1"],
    ]);
    const withoutProto = { b: "1" };

    const a = createActiveRouteSource(router, "users", withProto);
    const b = createActiveRouteSource(router, "users", withoutProto);

    expect(a).not.toBe(b);

    // Same shape with `__proto__` → same cache entry (identity preserved).
    const aAgain = createActiveRouteSource(
      router,
      "users",
      Object.fromEntries([
        ["__proto__", "x"],
        ["b", "1"],
      ]),
    );

    expect(aAgain).toBe(a);

    // Different `__proto__` values → different cache entries.
    const withDifferentProto = Object.fromEntries([
      ["__proto__", "y"],
      ["b", "1"],
    ]);
    const c = createActiveRouteSource(router, "users", withDifferentProto);

    expect(c).not.toBe(a);
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

  it("non-cached fallback: lazy connect + destroy() unwinds the router subscription (no leak)", async () => {
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

    // Lazy (#766): no router subscription until the first listener subscribes.
    expect(unsubscribeSpies).toHaveLength(0);

    source.subscribe(() => {});

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
