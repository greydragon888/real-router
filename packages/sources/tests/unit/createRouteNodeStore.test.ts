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

  it("destroy: is a no-op on shared cached source (listener still receives updates)", async () => {
    const source = createRouteNodeSource(router, "users");
    const listener = vi.fn();

    source.subscribe(listener);

    source.destroy();
    await router.navigate("users");

    // Shared cached source ignores external destroy() — updates still flow.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("destroy: idempotent — snapshot ref stable across N destroys (cached source no-op)", () => {
    const source = createRouteNodeSource(router, "users");
    const beforeDestroy = source.getSnapshot();

    source.destroy();

    expect(source.getSnapshot()).toBe(beforeDestroy);

    expect(() => {
      source.destroy();
      source.destroy();
    }).not.toThrow();

    expect(source.getSnapshot()).toBe(beforeDestroy);
  });

  it("post-destroy: getSnapshot still returns up-to-date snapshot", async () => {
    const source = createRouteNodeSource(router, "users");

    source.subscribe(() => {});

    await router.navigate("users");

    const lastSnapshot = source.getSnapshot();

    expect(lastSnapshot.route?.name).toBe("users");

    source.destroy();

    expect(source.getSnapshot()).toBe(lastSnapshot);
  });

  it("post-destroy: subscribe still works (shared source survives external teardown)", async () => {
    const source = createRouteNodeSource(router, "users");

    source.destroy();

    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    await router.navigate("users");

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("stabilizeState: each reload to same path produces a fresh snapshot ref (#605, transition.reload bypasses dedupe)", async () => {
    const source = createRouteNodeSource(router, "users");

    source.subscribe(() => {});

    await router.navigate("users.view", { id: "42" });
    await router.navigate("users.view", { id: "42" }, undefined, {
      reload: true,
    });

    const snapshotAfterFirstReload = source.getSnapshot();

    await router.navigate("users.view", { id: "42" }, undefined, {
      reload: true,
    });

    // Reload is the user's explicit non-idempotent signal — every reload
    // emits a fresh snapshot so observers can see refreshed
    // `state.context` (written by SSR loader plugins via `invalidate()`).
    expect(source.getSnapshot()).not.toBe(snapshotAfterFirstReload);
    expect(source.getSnapshot().route?.path).toBe(
      snapshotAfterFirstReload.route?.path,
    );
  });

  it("stabilizeState: non-reload same-path force nav keeps snapshot ref (false branch on Object.is check)", async () => {
    const source = createRouteNodeSource(router, "users");

    source.subscribe(() => {});

    await router.navigate("users.view", { id: "42" });
    await router.navigate("users.view", { id: "42" }, undefined, {
      force: true,
    });

    const snapshotAfterFirstForce = source.getSnapshot();

    await router.navigate("users.view", { id: "42" }, undefined, {
      force: true,
    });

    // `force: true` bypasses SAME_STATES so the navigation pipeline runs,
    // but `transition.reload` is unset → stabilization keeps prev refs →
    // Object.is sees the same snapshot → updateSnapshot skipped.
    expect(source.getSnapshot()).toBe(snapshotAfterFirstForce);
  });

  it("onFirstSubscribe reconciles snapshot when router state changed since creation", async () => {
    const source = createRouteNodeSource(router, "users");

    expect(source.getSnapshot().route).toBeUndefined();

    await router.navigate("users");

    // Snapshot is still stale — onFirstSubscribe hasn't run yet.
    expect(source.getSnapshot().route).toBeUndefined();

    // Capture snapshot before AND inside the listener: the listener fires
    // synchronously within subscribe() iff onFirstSubscribe's reconciliation
    // calls updateSnapshot. Without that flush, this listener would never
    // fire here (no router event between subscribe and assertion).
    const listener = vi.fn();

    source.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
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
