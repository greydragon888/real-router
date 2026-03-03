import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRouteStore } from "../../src/createRouteStore.js";

import type { Router } from "@real-router/core";

describe("createRouteStore", () => {
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

  it("initial snapshot: { route: router.getState(), previousRoute: undefined }", () => {
    const store = createRouteStore(router);
    const snapshot = store.getSnapshot();

    expect(snapshot.route).toBe(router.getState());
    expect(snapshot.previousRoute).toBeUndefined();
  });

  it("before router.start(): { route: undefined, previousRoute: undefined }", async () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    const store = createRouteStore(freshRouter);
    const snapshot = store.getSnapshot();

    expect(snapshot.route).toBeUndefined();
    expect(snapshot.previousRoute).toBeUndefined();

    freshRouter.stop();
  });

  it("listener called on navigation", async () => {
    const store = createRouteStore(router);
    const listener = vi.fn();

    store.subscribe(listener);

    await router.navigate("users");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("snapshot updated: route = new route, previousRoute = old route", async () => {
    const store = createRouteStore(router);
    const previousState = router.getState();

    await router.navigate("admin");

    const snapshot = store.getSnapshot();

    expect(snapshot.route?.name).toBe("admin");
    expect(snapshot.previousRoute).toBe(previousState);
  });

  it("multiple navigations: previousRoute tracks correctly", async () => {
    const store = createRouteStore(router);

    await router.navigate("users");
    const afterFirstNav = store.getSnapshot();

    expect(afterFirstNav.route?.name).toBe("users");
    expect(afterFirstNav.previousRoute?.name).toBe("home");

    await router.navigate("admin");
    const afterSecondNav = store.getSnapshot();

    expect(afterSecondNav.route?.name).toBe("admin");
    expect(afterSecondNav.previousRoute?.name).toBe("users");
  });

  it("destroy: unsubscribes from router (further navigations don't call listener)", async () => {
    const store = createRouteStore(router);
    const listener = vi.fn();

    store.subscribe(listener);

    store.destroy();
    await router.navigate("admin");

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy: idempotent", () => {
    const store = createRouteStore(router);

    store.destroy();

    expect(() => {
      store.destroy();
    }).not.toThrowError();
  });
});
