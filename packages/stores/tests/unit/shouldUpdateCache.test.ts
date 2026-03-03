import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import { getCachedShouldUpdate } from "../../src/shouldUpdateCache.js";

describe("getCachedShouldUpdate", () => {
  it("cache miss: calls router.shouldUpdateNode to create fn", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const spy = vi.spyOn(router, "shouldUpdateNode");

    getCachedShouldUpdate(router, "home");

    expect(spy).toHaveBeenCalledExactlyOnceWith("home");
  });

  it("cache hit: same router + same nodeName → same fn reference (no new call)", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const spy = vi.spyOn(router, "shouldUpdateNode");

    const fn1 = getCachedShouldUpdate(router, "home");
    const fn2 = getCachedShouldUpdate(router, "home");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(fn1).toBe(fn2);
  });

  it("different nodeName: different fn reference", () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ]);

    const fn1 = getCachedShouldUpdate(router, "home");
    const fn2 = getCachedShouldUpdate(router, "admin");

    expect(fn1).not.toBe(fn2);
  });

  it("different router: different fn reference (separate WeakMap entry)", () => {
    const routes = [{ name: "home", path: "/" }];
    const router1 = createRouter(routes);
    const router2 = createRouter(routes);

    const fn1 = getCachedShouldUpdate(router1, "home");
    const fn2 = getCachedShouldUpdate(router2, "home");

    expect(fn1).not.toBe(fn2);
  });

  it("the returned function is the one from router.shouldUpdateNode", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const mockFn = vi.fn().mockReturnValue(true);

    vi.spyOn(router, "shouldUpdateNode").mockReturnValue(mockFn);

    const fn = getCachedShouldUpdate(router, "home");

    expect(fn).toBe(mockFn);
  });

  it("cache hit: multiple nodes cached independently per router", () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ]);
    const spy = vi.spyOn(router, "shouldUpdateNode");

    const homeA = getCachedShouldUpdate(router, "home");
    const adminA = getCachedShouldUpdate(router, "admin");
    const homeB = getCachedShouldUpdate(router, "home");
    const adminB = getCachedShouldUpdate(router, "admin");

    // shouldUpdateNode called twice: once for "home", once for "admin"
    expect(spy).toHaveBeenCalledTimes(2);
    expect(homeA).toBe(homeB);
    expect(adminA).toBe(adminB);
    expect(homeA).not.toBe(adminA);
  });
});
