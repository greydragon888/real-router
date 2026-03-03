import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRouteNodeStore } from "../../src/createRouteNodeStore.js";

import type { Router } from "@real-router/core";

describe("createRouteNodeStore", () => {
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

  it("initial snapshot for active node: route = currentState, previousRoute = undefined", () => {
    const store = createRouteNodeStore(router, "home");
    const snapshot = store.getSnapshot();

    expect(snapshot.route).toBe(router.getState());
    expect(snapshot.previousRoute).toBeUndefined();
  });

  it("initial snapshot for inactive node: route = undefined, previousRoute = undefined", () => {
    const store = createRouteNodeStore(router, "admin");
    const snapshot = store.getSnapshot();

    expect(snapshot.route).toBeUndefined();
    expect(snapshot.previousRoute).toBeUndefined();
  });

  it("root node '' is always active, returns current route", () => {
    const store = createRouteNodeStore(router, "");
    const snapshot = store.getSnapshot();

    expect(snapshot.route).toBe(router.getState());
    expect(snapshot.route?.name).toBe("home");
  });

  it("before router.start(): { route: undefined, previousRoute: undefined }", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    const store = createRouteNodeStore(freshRouter, "home");
    const snapshot = store.getSnapshot();

    expect(snapshot.route).toBeUndefined();
    expect(snapshot.previousRoute).toBeUndefined();

    freshRouter.stop();
  });

  it("listener NOT called when navigation doesn't affect the node", async () => {
    const store = createRouteNodeStore(router, "users");
    const listener = vi.fn();

    store.subscribe(listener);

    // Navigate home → admin (users is not involved)
    await router.navigate("admin");

    expect(listener).not.toHaveBeenCalled();
  });

  it("listener called when navigating INTO the node", async () => {
    const store = createRouteNodeStore(router, "users");
    const listener = vi.fn();

    store.subscribe(listener);

    await router.navigate("users");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().route?.name).toBe("users");
  });

  it("listener called when navigating OUT OF the node", async () => {
    await router.navigate("users");
    const store = createRouteNodeStore(router, "users");
    const listener = vi.fn();

    store.subscribe(listener);

    await router.navigate("home");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().route).toBeUndefined();
  });

  it("route = undefined when node is not active", async () => {
    const store = createRouteNodeStore(router, "users");

    await router.navigate("users");

    expect(store.getSnapshot().route?.name).toBe("users");

    await router.navigate("home");

    expect(store.getSnapshot().route).toBeUndefined();
  });

  it("node active for child routes (users active when on users.view)", async () => {
    const store = createRouteNodeStore(router, "users");

    await router.navigate("users.view", { id: "42" });

    expect(store.getSnapshot().route?.name).toBe("users.view");
  });

  it("Object.is dedup: listener NOT called if snapshot unchanged (same route, same previousRoute)", async () => {
    // Create a fresh router that hasn't started yet so getState() returns undefined
    const freshRouter = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ]);

    // Override shouldUpdateNode to always return true, forcing dedup evaluation
    vi.spyOn(freshRouter, "shouldUpdateNode").mockReturnValue(() => true);

    // Create store for "admin" before start
    // getState() = undefined → admin inactive → snapshot = { route: undefined, previousRoute: undefined }
    const store = createRouteNodeStore(freshRouter, "admin");
    const listener = vi.fn();

    store.subscribe(listener);

    // Start router at "/" (home)
    // Subscription fires: next = { route: home-state, previousRoute: undefined }
    // computeSnapshot: admin still inactive → route=undefined, previousRoute=undefined
    // currentSnapshot has route=undefined, previousRoute=undefined → SAME → Object.is = true → no update
    await freshRouter.start("/");

    expect(listener).not.toHaveBeenCalled();

    freshRouter.stop();
  });

  it("computeSnapshot returns same object reference when fields unchanged", async () => {
    const store = createRouteNodeStore(router, "admin");
    const initialSnapshot = store.getSnapshot();

    // Navigate between unrelated routes
    await router.navigate("users");

    // admin is never active, snapshot should not have been updated
    expect(store.getSnapshot()).toBe(initialSnapshot);
  });

  it("WeakMap cache: getCachedShouldUpdate for same router+nodeName returns same fn reference", () => {
    const spy = vi.spyOn(router, "shouldUpdateNode");

    const store1 = createRouteNodeStore(router, "users");
    const store2 = createRouteNodeStore(router, "users");

    // shouldUpdateNode called exactly once (cache hit on second call)
    expect(spy).toHaveBeenCalledTimes(1);

    // Both stores work independently
    expect(store1.getSnapshot()).toBeDefined();
    expect(store2.getSnapshot()).toBeDefined();
  });

  it("destroy: unsubscribes from router", async () => {
    const store = createRouteNodeStore(router, "users");
    const listener = vi.fn();

    store.subscribe(listener);

    store.destroy();
    await router.navigate("users");

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy: idempotent", () => {
    const store = createRouteNodeStore(router, "users");

    store.destroy();

    expect(() => {
      store.destroy();
    }).not.toThrowError();
  });
});
