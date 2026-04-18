import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createActiveNameSelector } from "../../src";

import type { Router } from "@real-router/core";

describe("createActiveNameSelector", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "list", path: "/list" }],
      },
      { name: "admin", path: "/admin" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns the same selector for the same router", () => {
    const a = createActiveNameSelector(router);
    const b = createActiveNameSelector(router);

    expect(a).toBe(b);
  });

  it("returns different selectors for different routers", async () => {
    const router2 = createRouter([{ name: "home", path: "/" }]);

    await router2.start("/");

    const a = createActiveNameSelector(router);
    const b = createActiveNameSelector(router2);

    expect(a).not.toBe(b);

    router2.stop();
  });

  it("isActive() before subscribe — computes on demand", () => {
    const selector = createActiveNameSelector(router);

    expect(selector.isActive("home")).toBe(true);
    expect(selector.isActive("users")).toBe(false);
  });

  it("isActive() for descendant of current route returns true (non-strict)", async () => {
    await router.navigate("users.list");

    const selector = createActiveNameSelector(router);

    expect(selector.isActive("users")).toBe(true);
    expect(selector.isActive("users.list")).toBe(true);
    expect(selector.isActive("home")).toBe(false);
  });

  it("subscribe() + router.navigate() notifies only relevant listeners", async () => {
    const selector = createActiveNameSelector(router);

    const homeListener = vi.fn();
    const usersListener = vi.fn();
    const adminListener = vi.fn();

    const unsubHome = selector.subscribe("home", homeListener);
    const unsubUsers = selector.subscribe("users", usersListener);
    const unsubAdmin = selector.subscribe("admin", adminListener);

    // Starts at "home" → home=true, users=false, admin=false.
    expect(selector.isActive("home")).toBe(true);
    expect(selector.isActive("users")).toBe(false);

    // Navigate home → users.list:
    //   - home transitions true → false (notify homeListener)
    //   - users transitions false → true (notify usersListener)
    //   - admin unchanged (NOT notified)
    await router.navigate("users.list");

    expect(homeListener).toHaveBeenCalledTimes(1);
    expect(usersListener).toHaveBeenCalledTimes(1);
    expect(adminListener).toHaveBeenCalledTimes(0);

    unsubHome();
    unsubUsers();
    unsubAdmin();
  });

  it("N listeners for the same name share one router subscription", async () => {
    const originalSubscribe = router.subscribe.bind(router);
    const subscribeSpy = vi.spyOn(router, "subscribe");

    subscribeSpy.mockImplementation((listener) => originalSubscribe(listener));

    const selector = createActiveNameSelector(router);

    expect(subscribeSpy).toHaveBeenCalledTimes(0);

    const unsubs = Array.from({ length: 10 }, () =>
      selector.subscribe("users", () => {}),
    );

    // One subscription for all 10 listeners.
    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    for (const u of unsubs) {
      u();
    }

    subscribeSpy.mockRestore();
  });

  it("different names share one router subscription", async () => {
    const originalSubscribe = router.subscribe.bind(router);
    const subscribeSpy = vi.spyOn(router, "subscribe");

    subscribeSpy.mockImplementation((listener) => originalSubscribe(listener));

    const selector = createActiveNameSelector(router);
    const unsubHome = selector.subscribe("home", () => {});
    const unsubUsers = selector.subscribe("users", () => {});
    const unsubAdmin = selector.subscribe("admin", () => {});

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    unsubHome();
    unsubUsers();
    unsubAdmin();

    subscribeSpy.mockRestore();
  });

  it("unsubscribe last listener disconnects from router", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let unsubCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      const unsub = originalSubscribe(listener);

      return () => {
        unsubCalls++;
        unsub();
      };
    });

    const selector = createActiveNameSelector(router);
    const unsub1 = selector.subscribe("users", () => {});
    const unsub2 = selector.subscribe("home", () => {});

    expect(unsubCalls).toBe(0);

    unsub1();

    expect(unsubCalls).toBe(0); // one listener still subscribed to home

    unsub2();

    expect(unsubCalls).toBe(1); // last listener → router disconnect
  });

  it("unsubscribe is idempotent", () => {
    const selector = createActiveNameSelector(router);
    const unsub = selector.subscribe("users", () => {});

    unsub();

    expect(() => {
      unsub();
    }).not.toThrow();
  });

  it("listener NOT called when active state unchanged across unrelated navigation", async () => {
    const selector = createActiveNameSelector(router);
    const listener = vi.fn();

    const unsub = selector.subscribe("users", listener);

    // home → admin: users was inactive, still inactive.
    await router.navigate("admin");

    expect(listener).not.toHaveBeenCalled();

    unsub();
  });

  it("listener NOT called when active state unchanged across related navigation within subtree", async () => {
    await router.navigate("users.list");

    const selector = createActiveNameSelector(router);
    const listener = vi.fn();

    const unsub = selector.subscribe("users", listener);

    // users.list → users (parent): "users" active in both (non-strict).
    // areRoutesRelated("users", "users") = true, so pre-filter passes,
    // but prevActive === nextActive → no notification.
    await router.navigate("users");

    expect(listener).not.toHaveBeenCalled();

    unsub();
  });

  it("destroy() is a no-op", () => {
    const selector = createActiveNameSelector(router);

    selector.destroy();
    selector.destroy();

    expect(selector.isActive("home")).toBe(true);
    expect(typeof selector.subscribe).toBe("function");
  });

  it("router with undefined state — isActive returns false", () => {
    const freshRouter = createRouter([{ name: "home", path: "/" }]);
    // Не вызываем start() — state остаётся undefined.
    const selector = createActiveNameSelector(freshRouter);

    expect(selector.isActive("home")).toBe(false);
  });
});
