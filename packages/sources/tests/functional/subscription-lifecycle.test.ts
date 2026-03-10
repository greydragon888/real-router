import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouteNodeSource, createRouteSource } from "../../src";

import type { Router } from "@real-router/core";

describe("Issue #270: RouteNodeSource no longer leaks router subscriptions", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "list", path: "/list" }],
      },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("lazy subscription: does not subscribe to router until first listener", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let subscribeCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      subscribeCalls++;

      return originalSubscribe(listener);
    });

    createRouteNodeSource(router, "users");

    expect(subscribeCalls).toBe(0);
  });

  it("removing all listeners unsubscribes from router", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let subscribeCalls = 0;
    let unsubscribeCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      subscribeCalls++;
      const unsub = originalSubscribe(listener);

      return () => {
        unsubscribeCalls++;
        unsub();
      };
    });

    const source = createRouteNodeSource(router, "users");
    const unsub = source.subscribe(() => {});

    expect(subscribeCalls).toBe(1);

    unsub();

    expect(unsubscribeCalls).toBe(1);
  });

  it("N mount/unmount cycles produce zero leaked subscriptions", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let subscribeCalls = 0;
    let unsubscribeCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      subscribeCalls++;
      const unsub = originalSubscribe(listener);

      return () => {
        unsubscribeCalls++;
        unsub();
      };
    });

    const count = 50;

    for (let i = 0; i < count; i++) {
      const source = createRouteNodeSource(router, "users");
      const unsub = source.subscribe(() => {});

      unsub();
    }

    expect(subscribeCalls).toBe(count);
    expect(unsubscribeCalls).toBe(count);
  });

  it("no zombie callbacks after all listeners removed", async () => {
    let callbackCount = 0;
    const originalSubscribe = router.subscribe.bind(router);

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      const wrappedListener: typeof listener = (state) => {
        callbackCount++;
        listener(state);
      };

      return originalSubscribe(wrappedListener);
    });

    const source = createRouteNodeSource(router, "users");
    const unsub = source.subscribe(() => {});

    unsub();
    callbackCount = 0;

    await router.navigate("users.list");

    expect(callbackCount).toBe(0);
  });

  it("matches createRouteSource lazy pattern", () => {
    const originalSubscribe = router.subscribe.bind(router);
    let subscribeCalls = 0;
    let unsubscribeCalls = 0;

    vi.spyOn(router, "subscribe").mockImplementation((listener) => {
      subscribeCalls++;
      const unsub = originalSubscribe(listener);

      return () => {
        unsubscribeCalls++;
        unsub();
      };
    });

    const source = createRouteSource(router);

    expect(subscribeCalls).toBe(0);

    const unsub = source.subscribe(() => {});

    expect(subscribeCalls).toBe(1);

    unsub();

    expect(unsubscribeCalls).toBe(1);
  });
});
