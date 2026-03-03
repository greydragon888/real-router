import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRouteNodeStore } from "../../src";

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

  it("dedup: same snapshot reference when navigation doesn't affect node", async () => {
    const store = createRouteNodeStore(router, "admin");
    const initialSnapshot = store.getSnapshot();

    // Navigate between unrelated routes (home → users)
    await router.navigate("users");

    // admin is never active, snapshot reference should be identical
    expect(store.getSnapshot()).toBe(initialSnapshot);
  });

  it("two stores for same node work independently", async () => {
    const store1 = createRouteNodeStore(router, "users");
    const store2 = createRouteNodeStore(router, "users");

    await router.navigate("users");

    // Both stores reflect the navigation correctly
    expect(store1.getSnapshot().route?.name).toBe("users");
    expect(store2.getSnapshot().route?.name).toBe("users");

    // Destroying one does not affect the other
    store1.destroy();

    await router.navigate("users.view", { id: "1" });

    expect(store2.getSnapshot().route?.name).toBe("users.view");
  });

  it("unsubscribe: listener no longer called after unsubscribing", async () => {
    const store = createRouteNodeStore(router, "users");
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);

    await router.navigate("users");

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    await router.navigate("home");

    expect(listener).toHaveBeenCalledTimes(1);
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

  it("post-destroy: getSnapshot still returns last snapshot", async () => {
    const store = createRouteNodeStore(router, "users");

    await router.navigate("users");

    const lastSnapshot = store.getSnapshot();

    expect(lastSnapshot.route?.name).toBe("users");

    store.destroy();

    expect(store.getSnapshot()).toBe(lastSnapshot);
  });

  it("post-destroy: subscribe returns no-op unsubscribe (no errors)", () => {
    const store = createRouteNodeStore(router, "users");

    store.destroy();

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrowError();
  });
});
