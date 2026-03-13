import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createRouteNodeSource } from "@real-router/sources";

import { createStressRouter, forceGC, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

describe("S7 shouldUpdateCache growth", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S7.1: 500 RouteNodeSource with unique nodeNames", async () => {
    const sources = Array.from({ length: 500 }, (_, i) =>
      createRouteNodeSource(router, `node_${i}`),
    );

    const unsubs = sources.map((s) => s.subscribe(() => {}));

    await router.navigate("about");

    for (const source of sources) {
      const snapshot = source.getSnapshot();

      expect(snapshot.route).toBeUndefined();
    }

    unsubs.forEach((u) => {
      u();
    });
    sources.forEach((s) => {
      s.destroy();
    });
  });

  it("S7.2: same nodeName × 500", async () => {
    const sources = Array.from({ length: 500 }, () =>
      createRouteNodeSource(router, "users"),
    );

    const unsubs = sources.map((s) => s.subscribe(() => {}));

    await router.navigate("users.list");

    const expectedRoute = router.getState();

    for (const source of sources) {
      expect(source.getSnapshot().route).toBe(expectedRoute);
    }

    unsubs.forEach((u) => {
      u();
    });
    sources.forEach((s) => {
      s.destroy();
    });
  });

  it("S7.3: router dispose → WeakMap entry eligible for GC", async () => {
    const baseline = takeHeapSnapshot();

    {
      const localRouter = createStressRouter();

      await localRouter.start("/");

      const sources = Array.from({ length: 50 }, (_, i) =>
        createRouteNodeSource(localRouter, `dispose_node_${i}`),
      );

      const unsubs = sources.map((s) => s.subscribe(() => {}));

      unsubs.forEach((u) => {
        u();
      });
      sources.forEach((s) => {
        s.destroy();
      });
      localRouter.stop();
      localRouter.dispose();
    }

    forceGC();
    const after = takeHeapSnapshot();

    expect(after - baseline).toBeLessThan(MB);
  });

  it("S7.4: 2 routers × 200 unique nodeNames (caches isolated)", async () => {
    const router1 = createStressRouter();
    const router2 = createStressRouter();

    await router1.start("/");
    await router2.start("/");

    const sources1 = Array.from({ length: 199 }, (_, i) =>
      createRouteNodeSource(router1, `r1_node_${i}`),
    );
    const sources2 = Array.from({ length: 199 }, (_, i) =>
      createRouteNodeSource(router2, `r2_node_${i}`),
    );

    const usersOnRouter1 = createRouteNodeSource(router1, "users");
    const usersOnRouter2 = createRouteNodeSource(router2, "users");

    sources1.forEach((s) => s.subscribe(() => {}));
    sources2.forEach((s) => s.subscribe(() => {}));
    usersOnRouter1.subscribe(() => {});
    usersOnRouter2.subscribe(() => {});

    await router1.navigate("users.list");
    await router2.navigate("admin.dashboard");

    expect(usersOnRouter1.getSnapshot().route?.name).toBe("users.list");
    expect(usersOnRouter2.getSnapshot().route).toBeUndefined();

    sources1.forEach((s) => {
      s.destroy();
    });
    sources2.forEach((s) => {
      s.destroy();
    });
    usersOnRouter1.destroy();
    usersOnRouter2.destroy();

    router1.stop();
    router2.stop();
  });
});
