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
    const cleanup = store.subscribe(() => {});

    await router.navigate("admin");

    const snapshot = store.getSnapshot();

    expect(snapshot.route?.name).toBe("admin");
    expect(snapshot.previousRoute).toBe(previousState);

    cleanup();
  });

  it("multiple navigations: previousRoute tracks correctly", async () => {
    const store = createRouteStore(router);
    const cleanup = store.subscribe(() => {});

    await router.navigate("users");
    const afterFirstNav = store.getSnapshot();

    expect(afterFirstNav.route?.name).toBe("users");
    expect(afterFirstNav.previousRoute?.name).toBe("home");

    await router.navigate("admin");
    const afterSecondNav = store.getSnapshot();

    expect(afterSecondNav.route?.name).toBe("admin");
    expect(afterSecondNav.previousRoute?.name).toBe("users");

    cleanup();
  });

  it("destroy: unsubscribes from router (further navigations don't call listener)", async () => {
    const store = createRouteStore(router);
    const listener = vi.fn();

    store.subscribe(listener);

    store.destroy();
    await router.navigate("admin");

    expect(listener).not.toHaveBeenCalled();
  });

  it("multiple subscribers: router.subscribe called only once", async () => {
    const store = createRouteStore(router);
    const spy = vi.spyOn(router, "subscribe");

    const cleanup1 = store.subscribe(() => {});
    const cleanup2 = store.subscribe(() => {});

    // router.subscribe should only be called once (lazy-connection)
    expect(spy).toHaveBeenCalledTimes(1);

    cleanup1();
    cleanup2();
  });

  it("partial unsubscribe: router subscription stays until last listener removed", async () => {
    const store = createRouteStore(router);
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const cleanup1 = store.subscribe(listener1);

    store.subscribe(listener2);

    // Remove first listener — router subscription should stay
    cleanup1();

    await router.navigate("admin");

    // listener2 still receives updates
    expect(listener2).toHaveBeenCalledTimes(1);
    // listener1 no longer receives updates
    expect(listener1).not.toHaveBeenCalled();
  });

  it("destroy: idempotent", () => {
    const store = createRouteStore(router);

    store.destroy();

    expect(() => {
      store.destroy();
    }).not.toThrowError();
  });

  it("post-destroy: getSnapshot still returns last snapshot", async () => {
    const store = createRouteStore(router);

    store.subscribe(() => {});

    await router.navigate("admin");

    const lastSnapshot = store.getSnapshot();

    expect(lastSnapshot.route?.name).toBe("admin");

    store.destroy();

    expect(store.getSnapshot()).toBe(lastSnapshot);
  });

  it("post-destroy: subscribe returns no-op unsubscribe (no errors)", () => {
    const store = createRouteStore(router);

    store.destroy();

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrowError();
  });
});
