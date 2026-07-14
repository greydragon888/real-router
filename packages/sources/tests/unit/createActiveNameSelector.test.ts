import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createActiveNameSelector } from "../../src";

import type { Router } from "@real-router/core";

// #1478: the per-name recompute (`areRoutesRelated` / `isActiveNonStrict`) cannot
// throw with the real pure-string impl, so the latent-seam guard is verified by
// injecting the throw it must isolate — `areRoutesRelated` throws for the
// synthetic name "__throws__", simulating a future param-aware / predicate
// recompute that CAN throw. All other names delegate to the real impl, so every
// other test is unaffected.
vi.mock(import("@real-router/route-utils"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    areRoutesRelated(route1: string, route2: string): boolean {
      if (route1 === "__throws__") {
        throw new Error("recompute boom");
      }

      return actual.areRoutesRelated(route1, route2);
    },
  };
});

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

  it("isolates throwing listeners — same-name siblings and later names still notified (#767)", async () => {
    const selector = createActiveNameSelector(router);
    const thrown = new Error("boom");
    const sameNameSurvivor = vi.fn();
    const otherNameSurvivor = vi.fn();

    // Capture the asynchronously re-thrown error before vitest's default
    // uncaughtException handler fails the test (mirrors BaseSource isolation).
    const rethrown: unknown[] = [];
    const previousListeners = [...process.listeners("uncaughtException")];

    process.removeAllListeners("uncaughtException");
    const captureHandler = (error: unknown): void => {
      rethrown.push(error);
    };

    process.on("uncaughtException", captureHandler);

    try {
      // Two "users" listeners (throwing first), then a DIFFERENT name "home"
      // whose active state also flips on the same navigation. Iteration order:
      // "users" (subscribed first) before "home". Without per-listener
      // isolation, the throw unwinds both nested loops → the same-name sibling
      // AND every later name are skipped.
      selector.subscribe("users", () => {
        throw thrown;
      });
      selector.subscribe("users", sameNameSurvivor);
      selector.subscribe("home", otherNameSurvivor);

      // home → users.list: "users" flips false→true, "home" flips true→false.
      await router.navigate("users.list");

      // Same-name sibling notified despite the first listener throwing.
      expect(sameNameSurvivor).toHaveBeenCalledTimes(1);
      // A listener of a later-iterated name is NOT skipped by the throw.
      expect(otherNameSurvivor).toHaveBeenCalledTimes(1);

      // Drain the microtask queue so the queueMicrotask(throw) lands.
      await Promise.resolve();
      await Promise.resolve();

      expect(rethrown).toStrictEqual([thrown]);
    } finally {
      process.removeListener("uncaughtException", captureHandler);
      for (const listener of previousListeners) {
        process.on("uncaughtException", listener);
      }
    }
  });

  it("isolates a throwing per-name recompute — later names still notified (#1478)", async () => {
    const selector = createActiveNameSelector(router);
    const laterNameSurvivor = vi.fn();

    // Capture the asynchronously re-thrown recompute error before vitest's
    // default uncaughtException handler fails the test (mirrors the #767 capture).
    const rethrown: unknown[] = [];
    const previousListeners = [...process.listeners("uncaughtException")];

    process.removeAllListeners("uncaughtException");
    const captureHandler = (error: unknown): void => {
      rethrown.push(error);
    };

    process.on("uncaughtException", captureHandler);

    try {
      // "__throws__" (mocked `areRoutesRelated` throws for it) is iterated FIRST;
      // the real name "home" flips on the same navigation and is iterated LATER.
      // The per-name recompute runs OUTSIDE the per-listener `try`, so without
      // per-name isolation the throw unwinds the shared subscribe callback and
      // skips "home" — structurally the #767 failure mode one level up (#1478).
      selector.subscribe("__throws__", () => {});
      selector.subscribe("home", laterNameSurvivor);

      // home → users.list: "home" flips true → false (would notify the survivor).
      await router.navigate("users.list");

      // A later-iterated name is NOT skipped by the recompute throw.
      expect(laterNameSurvivor).toHaveBeenCalledTimes(1);

      // Drain the microtask queue so the queueMicrotask(throw) lands.
      await Promise.resolve();
      await Promise.resolve();

      // The genuine recompute error still surfaces asynchronously (not swallowed).
      expect(rethrown).toHaveLength(1);
      expect((rethrown[0] as Error).message).toBe("recompute boom");
    } finally {
      process.removeListener("uncaughtException", captureHandler);
      for (const listener of previousListeners) {
        process.on("uncaughtException", listener);
      }
    }
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

  it("stale-generation unsubscribe does not delete the live listener set of a re-created name (#1206)", async () => {
    const selector = createActiveNameSelector(router);

    // Duplicate (name, callback): the SAME callback subscribed twice to "users"
    // produces ONE Set entry (Set-dedup) but TWO unsubscribe closures, both
    // capturing the same generation-1 Set by reference.
    const dup = vi.fn();
    const unsub1 = selector.subscribe("users", dup);
    const unsub2 = selector.subscribe("users", dup);

    // unsub1 tears down "users" entirely: deleting `dup` empties the deduped Set,
    // so the name is removed from the map and the router subscription is dropped.
    // unsub2 is now a STALE closure over the orphaned generation-1 Set.
    unsub1();

    // A fresh subscriber re-creates "users" — a NEW generation-2 Set.
    const live = vi.fn();

    selector.subscribe("users", live);

    // The stale unsub2 runs. Without the generation guard it sees its captured
    // (now-empty) Set, hits `listeners.size === 0`, and deletes the CURRENT
    // "users" entry (generation-2) from the map + disconnects — orphaning `live`.
    unsub2();

    // Flip "users" active (home → users.list). `live` MUST still be notified.
    await router.navigate("users.list");

    expect(live).toHaveBeenCalled();
  });

  describe("root semantics (audit §5.F — symmetry with createRouteNodeSource(''))", () => {
    it("isActive('') returns true when a route is current (root is always-active)", () => {
      const selector = createActiveNameSelector(router);

      // Router started at "/" → "home" is current.
      expect(selector.isActive("")).toBe(true);
    });

    it("isActive('') tracks router state — true after navigation, true after another", async () => {
      const selector = createActiveNameSelector(router);

      expect(selector.isActive("")).toBe(true);

      await router.navigate("users.list");

      expect(selector.isActive("")).toBe(true);

      await router.navigate("admin");

      expect(selector.isActive("")).toBe(true);
    });

    it("isActive('') is false only when router has no state", () => {
      const freshRouter = createRouter([{ name: "home", path: "/" }]);
      const selector = createActiveNameSelector(freshRouter);

      expect(selector.isActive("")).toBe(false);
    });

    it("subscribe('') listener fires on first nav (false → true flip), never again", async () => {
      const freshRouter = createRouter([
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ]);
      const selector = createActiveNameSelector(freshRouter);
      const listener = vi.fn();

      // selector.subscribe seeds active state immediately via isActiveNonStrict.
      // Before start: isActive('') = false.
      const unsub = selector.subscribe("", listener);

      expect(selector.isActive("")).toBe(false);

      await freshRouter.start("/");

      // After start, isActive('') flips true → listener fires once.
      expect(listener).toHaveBeenCalledTimes(1);
      expect(selector.isActive("")).toBe(true);

      // Subsequent in-tree navigation doesn't flip root active — no further fires.
      await freshRouter.navigate("users");

      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      freshRouter.stop();
    });
  });
});
