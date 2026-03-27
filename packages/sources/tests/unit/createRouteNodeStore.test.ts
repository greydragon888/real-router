import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRouteNodeSource } from "../../src";

import type { Router } from "@real-router/core";

describe("createRouteNodeSources", () => {
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
    const source = createRouteNodeSource(router, "home");
    const snapshot = source.getSnapshot();

    expect(snapshot.route).toBe(router.getState());
    expect(snapshot.previousRoute).toBeUndefined();
  });

  it("initial snapshot for inactive node: route = undefined, previousRoute = undefined", () => {
    const source = createRouteNodeSource(router, "admin");
    const snapshot = source.getSnapshot();

    expect(snapshot.route).toBeUndefined();
    expect(snapshot.previousRoute).toBeUndefined();
  });

  it("root node '' is always active, returns current route", () => {
    const source = createRouteNodeSource(router, "");
    const snapshot = source.getSnapshot();

    expect(snapshot.route).toBe(router.getState());
    expect(snapshot.route?.name).toBe("home");
  });

  it("before router.start(): { route: undefined, previousRoute: undefined }", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    const source = createRouteNodeSource(freshRouter, "home");
    const snapshot = source.getSnapshot();

    expect(snapshot.route).toBeUndefined();
    expect(snapshot.previousRoute).toBeUndefined();

    freshRouter.stop();
  });

  it("listener NOT called when navigation doesn't affect the node", async () => {
    const source = createRouteNodeSource(router, "users");
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("admin");

    expect(listener).not.toHaveBeenCalled();
  });

  it("listener called when navigating INTO the node", async () => {
    const source = createRouteNodeSource(router, "users");
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("users");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot().route?.name).toBe("users");
  });

  it("listener called when navigating OUT OF the node", async () => {
    await router.navigate("users");
    const source = createRouteNodeSource(router, "users");
    const listener = vi.fn();

    source.subscribe(listener);

    await router.navigate("home");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot().route).toBeUndefined();
  });

  it("route = undefined when node is not active", async () => {
    const source = createRouteNodeSource(router, "users");

    source.subscribe(() => {});

    await router.navigate("users");

    expect(source.getSnapshot().route?.name).toBe("users");

    await router.navigate("home");

    expect(source.getSnapshot().route).toBeUndefined();
  });

  it("node active for child routes (users active when on users.view)", async () => {
    const source = createRouteNodeSource(router, "users");

    source.subscribe(() => {});

    await router.navigate("users.view", { id: "42" });

    expect(source.getSnapshot().route?.name).toBe("users.view");
  });

  it("dedup: same snapshot reference when navigation doesn't affect node", async () => {
    const source = createRouteNodeSource(router, "admin");

    source.subscribe(() => {});

    const initialSnapshot = source.getSnapshot();

    await router.navigate("users");

    expect(source.getSnapshot()).toBe(initialSnapshot);
  });

  it("two sources for same node work independently", async () => {
    const source1 = createRouteNodeSource(router, "users");
    const source2 = createRouteNodeSource(router, "users");

    source1.subscribe(() => {});
    source2.subscribe(() => {});

    await router.navigate("users");

    expect(source1.getSnapshot().route?.name).toBe("users");
    expect(source2.getSnapshot().route?.name).toBe("users");

    source1.destroy();

    await router.navigate("users.view", { id: "1" });

    expect(source2.getSnapshot().route?.name).toBe("users.view");
  });

  it("unsubscribe: listener no longer called after unsubscribing", async () => {
    const source = createRouteNodeSource(router, "users");
    const listener = vi.fn();

    const unsubscribe = source.subscribe(listener);

    await router.navigate("users");

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    await router.navigate("home");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("destroy: unsubscribes from router", async () => {
    const source = createRouteNodeSource(router, "users");
    const listener = vi.fn();

    source.subscribe(listener);

    source.destroy();
    await router.navigate("users");

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy: idempotent", () => {
    const source = createRouteNodeSource(router, "users");

    source.destroy();

    expect(() => {
      source.destroy();
    }).not.toThrow();
  });

  it("post-destroy: getSnapshot still returns last snapshot", async () => {
    const source = createRouteNodeSource(router, "users");

    source.subscribe(() => {});

    await router.navigate("users");

    const lastSnapshot = source.getSnapshot();

    expect(lastSnapshot.route?.name).toBe("users");

    source.destroy();

    expect(source.getSnapshot()).toBe(lastSnapshot);
  });

  it("post-destroy: subscribe returns no-op unsubscribe (no errors)", () => {
    const source = createRouteNodeSource(router, "users");

    source.destroy();

    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  it("stabilizeState: snapshot ref preserved on second reload to same path within node", async () => {
    const source = createRouteNodeSource(router, "users");

    source.subscribe(() => {});

    await router.navigate("users.view", { id: "42" });
    await router.navigate("users.view", { id: "42" }, { reload: true });

    const snapshotAfterFirstReload = source.getSnapshot();

    await router.navigate("users.view", { id: "42" }, { reload: true });

    expect(source.getSnapshot()).toBe(snapshotAfterFirstReload);
  });

  it("onFirstSubscribe reconciles snapshot when router state changed since creation", async () => {
    const source = createRouteNodeSource(router, "users");

    expect(source.getSnapshot().route).toBeUndefined();

    await router.navigate("users");

    source.subscribe(() => {});

    expect(source.getSnapshot().route?.name).toBe("users");
  });

  it("lazy: does not subscribe to router until first listener", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let subscribeCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      subscribeCalls++;

      return originalSubscribe(listener);
    });

    createRouteNodeSource(router, "users");

    expect(subscribeCalls).toBe(0);
  });

  it("lazy: unsubscribes from router when last listener removed", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let unsubscribeCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      const unsub = originalSubscribe(listener);

      return () => {
        unsubscribeCalls++;
        unsub();
      };
    });

    const source = createRouteNodeSource(router, "users");

    const unsub1 = source.subscribe(() => {});
    const unsub2 = source.subscribe(() => {});

    unsub1();

    expect(unsubscribeCalls).toBe(0);

    unsub2();

    expect(unsubscribeCalls).toBe(1);
  });

  it("lazy: re-subscribes to router when new listener added after all removed", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let subscribeCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      subscribeCalls++;

      return originalSubscribe(listener);
    });

    const source = createRouteNodeSource(router, "users");
    const unsub = source.subscribe(() => {});

    expect(subscribeCalls).toBe(1);

    unsub();

    source.subscribe(() => {});

    expect(subscribeCalls).toBe(2);
  });
});
