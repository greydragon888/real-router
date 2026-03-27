import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRouteSource } from "../../src";

import type { Router } from "@real-router/core";

describe("createRouteSources", () => {
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
    const source = createRouteSource(router);
    const snapshot = source.getSnapshot();

    expect(snapshot.route).toBe(router.getState());
    expect(snapshot.previousRoute).toBeUndefined();
  });

  it("before router.start(): { route: undefined, previousRoute: undefined }", async () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    const source = createRouteSource(freshRouter);
    const snapshot = source.getSnapshot();

    expect(snapshot.route).toBeUndefined();
    expect(snapshot.previousRoute).toBeUndefined();

    freshRouter.stop();
  });

  it("listener called on navigation", async () => {
    const source = createRouteSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("users");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("snapshot updated: route = new route, previousRoute = old route", async () => {
    const source = createRouteSource(router);
    const previousState = router.getState();
    const cleanup = source.subscribe(() => {});

    await router.navigate("admin");

    const snapshot = source.getSnapshot();

    expect(snapshot.route?.name).toBe("admin");
    expect(snapshot.previousRoute).toBe(previousState);

    cleanup();
  });

  it("multiple navigations: previousRoute tracks correctly", async () => {
    const source = createRouteSource(router);
    const cleanup = source.subscribe(() => {});

    await router.navigate("users");
    const afterFirstNav = source.getSnapshot();

    expect(afterFirstNav.route?.name).toBe("users");
    expect(afterFirstNav.previousRoute?.name).toBe("home");

    await router.navigate("admin");
    const afterSecondNav = source.getSnapshot();

    expect(afterSecondNav.route?.name).toBe("admin");
    expect(afterSecondNav.previousRoute?.name).toBe("users");

    cleanup();
  });

  it("stabilizeState skips update when both route and previousRoute paths unchanged", async () => {
    const source = createRouteSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("home", {}, { reload: true });

    expect(listener).toHaveBeenCalledTimes(1);

    await router.navigate("home", {}, { reload: true });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("destroy: unsubscribes from router (further navigations don't call listener)", async () => {
    const source = createRouteSource(router);
    const listener = vi.fn();

    source.subscribe(listener);

    source.destroy();
    await router.navigate("admin");

    expect(listener).not.toHaveBeenCalled();
  });

  it("multiple subscribers: router.subscribe called only once", async () => {
    const source = createRouteSource(router);
    const spy = vi.spyOn(router, "subscribe");

    const cleanup1 = source.subscribe(() => {});
    const cleanup2 = source.subscribe(() => {});

    // router.subscribe should only be called once (lazy-connection)
    expect(spy).toHaveBeenCalledTimes(1);

    cleanup1();
    cleanup2();
  });

  it("partial unsubscribe: router subscription stays until last listener removed", async () => {
    const source = createRouteSource(router);
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const cleanup1 = source.subscribe(listener1);

    source.subscribe(listener2);

    // Remove first listener — router subscription should stay
    cleanup1();

    await router.navigate("admin");

    // listener2 still receives updates
    expect(listener2).toHaveBeenCalledTimes(1);
    // listener1 no longer receives updates
    expect(listener1).not.toHaveBeenCalled();
  });

  it("destroy: idempotent", () => {
    const source = createRouteSource(router);

    source.destroy();

    expect(() => {
      source.destroy();
    }).not.toThrow();
  });

  it("post-destroy: getSnapshot still returns last snapshot", async () => {
    const source = createRouteSource(router);

    source.subscribe(() => {});

    await router.navigate("admin");

    const lastSnapshot = source.getSnapshot();

    expect(lastSnapshot.route?.name).toBe("admin");

    source.destroy();

    expect(source.getSnapshot()).toBe(lastSnapshot);
  });

  it("post-destroy: subscribe returns no-op unsubscribe (no errors)", () => {
    const source = createRouteSource(router);

    source.destroy();

    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });
});
