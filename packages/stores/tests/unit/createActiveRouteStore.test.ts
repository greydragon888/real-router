import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createActiveRouteStore } from "../../src";

import type { Router } from "@real-router/core";

describe("createActiveRouteStore", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
      { name: "admin", path: "/admin" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("initial value: true when route currently active", () => {
    const store = createActiveRouteStore(router, "home");

    expect(store.getSnapshot()).toBe(true);
  });

  it("initial value: false when route not active", () => {
    const store = createActiveRouteStore(router, "admin");

    expect(store.getSnapshot()).toBe(false);
  });

  it("before router.start(): false", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    const store = createActiveRouteStore(freshRouter, "home");

    expect(store.getSnapshot()).toBe(false);

    freshRouter.stop();
  });

  it("listener called when route becomes active", async () => {
    const store = createActiveRouteStore(router, "admin");
    const listener = vi.fn();

    store.subscribe(listener);

    await router.navigate("admin");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(true);
  });

  it("listener called when route becomes inactive", async () => {
    await router.navigate("admin");
    const store = createActiveRouteStore(router, "admin");
    const listener = vi.fn();

    store.subscribe(listener);

    await router.navigate("home");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(false);
  });

  it("areRoutesRelated filter: listener NOT called for unrelated navigations", async () => {
    const store = createActiveRouteStore(router, "users");
    const spy = vi.spyOn(router, "isActiveRoute");

    // Navigate home → admin (unrelated to users)
    await router.navigate("admin");

    // isActiveRoute should NOT be called inside subscriber (filtered by areRoutesRelated)
    expect(spy).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(false);
  });

  it("strict=false: ancestor match (users active when on users.view)", async () => {
    const store = createActiveRouteStore(router, "users", undefined, {
      strict: false,
    });

    await router.navigate("users.view", { id: "1" });

    expect(store.getSnapshot()).toBe(true);
  });

  it("strict=true: exact match only (users NOT active when on users.view)", async () => {
    const store = createActiveRouteStore(router, "users", undefined, {
      strict: true,
    });

    await router.navigate("users.view", { id: "1" });

    expect(store.getSnapshot()).toBe(false);
  });

  it("ignoreQueryParams=true (default): isActiveRoute called with ignoreQueryParams=true", async () => {
    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteStore(router, "users");

    spy.mockClear();

    await router.navigate("users");

    expect(spy).toHaveBeenCalledWith("users", undefined, false, true);
  });

  it("ignoreQueryParams=false: isActiveRoute called with ignoreQueryParams=false", async () => {
    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteStore(router, "users", undefined, {
      ignoreQueryParams: false,
    });

    spy.mockClear();

    await router.navigate("users");

    expect(spy).toHaveBeenCalledWith("users", undefined, false, false);
  });

  it("boolean dedup: listener NOT called if value unchanged (both active)", async () => {
    // Navigate to users first so users store starts active
    await router.navigate("users");
    const store = createActiveRouteStore(router, "users");

    expect(store.getSnapshot()).toBe(true);

    const listener = vi.fn();

    store.subscribe(listener);

    // Navigate users → users.view: users is still active (strict=false)
    // areRoutesRelated("users", "users.view") is true → enters subscriber
    // isActiveRoute("users") still returns true → Object.is(true, true) → no update
    await router.navigate("users.view", { id: "1" });

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(true);
  });

  it("boolean dedup: listener NOT called if value unchanged (both inactive)", async () => {
    const store = createActiveRouteStore(router, "admin");

    expect(store.getSnapshot()).toBe(false);

    const listener = vi.fn();

    store.subscribe(listener);

    // Navigate home → users: admin not involved → areRoutesRelated filter fires
    // Even if we somehow enter subscriber, isActiveRoute("admin") is still false
    await router.navigate("users");

    // admin is still false, listener should not be called
    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy: unsubscribes from router (further navigations don't call listener)", async () => {
    const store = createActiveRouteStore(router, "admin");
    const listener = vi.fn();

    store.subscribe(listener);

    store.destroy();
    await router.navigate("admin");

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy: idempotent", () => {
    const store = createActiveRouteStore(router, "admin");

    store.destroy();

    expect(() => {
      store.destroy();
    }).not.toThrowError();
  });

  it("previousRoute is undefined on first navigation: isPrevRelated is falsy", async () => {
    // Create store BEFORE starting — so the first nav event has previousRoute=undefined
    // This tests: isPrevRelated = undefined && areRoutesRelated(...) → undefined (falsy)
    const freshRouter = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ]);

    // Store for "home", created before start. Initial value: false (no state yet)
    const store = createActiveRouteStore(freshRouter, "home");
    const listener = vi.fn();

    store.subscribe(listener);

    // Start at home — fires next = { route: home-state, previousRoute: undefined }
    // isNewRelated = areRoutesRelated("home", "home") = true → enters subscriber
    // isPrevRelated = undefined && ... = undefined (falsy) → tests short-circuit branch
    // !isNewRelated && !isPrevRelated = false → doesn't return early
    // isActiveRoute("home") = true → updates store from false to true
    await freshRouter.start("/");

    expect(store.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    freshRouter.stop();
  });

  it("post-destroy: getSnapshot still returns last value", async () => {
    await router.navigate("admin");
    const store = createActiveRouteStore(router, "admin");

    expect(store.getSnapshot()).toBe(true);

    store.destroy();

    expect(store.getSnapshot()).toBe(true);
  });

  it("post-destroy: subscribe returns no-op unsubscribe (no errors)", () => {
    const store = createActiveRouteStore(router, "admin");

    store.destroy();

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrowError();
  });
});
