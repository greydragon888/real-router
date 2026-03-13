import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createRouteNodeSource,
  createActiveRouteSource,
  createTransitionSource,
} from "@real-router/sources";

import { createStressRouter, createManySources } from "./helpers";

import type { Router } from "@real-router/core";

describe("S5: Cross-source interaction", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S5.1: 1 RouteSource + 50 RouteNodeSource + 100 ActiveRouteSource + 50 TransitionSource + 200 navigations", async () => {
    const navRoutes = ["users.list", "about", "admin.dashboard", "home"];
    const nodeNames = ["users", "admin", "home", ""];
    const activeNames = [
      "home",
      "users",
      "users.list",
      "admin",
      "admin.dashboard",
      "about",
    ];

    const routeSource = createRouteSource(router);
    const nodeSources = Array.from({ length: 50 }, (_, i) =>
      createRouteNodeSource(router, nodeNames[i % nodeNames.length]),
    );
    const activeSources = Array.from({ length: 100 }, (_, i) =>
      createActiveRouteSource(router, activeNames[i % activeNames.length]),
    );
    const transitionSources = createManySources(
      () => createTransitionSource(router),
      50,
    );

    const routeCounter = { count: 0 };
    const nodeCounters = Array.from({ length: 50 }, () => ({ count: 0 }));
    const transCounters = Array.from({ length: 50 }, () => ({ count: 0 }));

    const routeUnsub = routeSource.subscribe(() => {
      routeCounter.count++;
    });
    const nodeUnsubs = nodeSources.map((s, i) =>
      s.subscribe(() => {
        nodeCounters[i].count++;
      }),
    );
    const activeUnsubs = activeSources.map((s) => s.subscribe(() => {}));
    const transUnsubs = transitionSources.map((s, i) =>
      s.subscribe(() => {
        transCounters[i].count++;
      }),
    );

    for (let i = 0; i < 200; i++) {
      await router.navigate(navRoutes[i % navRoutes.length]);
    }

    expect(routeCounter.count).toBe(200);

    transCounters.forEach((c) => {
      expect(c.count).toBeGreaterThan(0);
    });

    nodeSources.forEach((_, i) => {
      const name = nodeNames[i % nodeNames.length];
      const count = nodeCounters[i].count;
      const expected = name === "" ? 200 : 100;

      expect(count).toBe(expected);
    });

    expect(routeSource.getSnapshot().route).toBeDefined();

    nodeSources.forEach((s) => {
      const snap = s.getSnapshot();

      expect(snap).toHaveProperty("route");
      expect(snap).toHaveProperty("previousRoute");
    });
    activeSources.forEach((s) => {
      expect(typeof s.getSnapshot()).toBe("boolean");
    });
    transitionSources.forEach((s) => {
      expect(typeof s.getSnapshot().isTransitioning).toBe("boolean");
    });

    routeUnsub();
    nodeUnsubs.forEach((u) => {
      u();
    });
    activeUnsubs.forEach((u) => {
      u();
    });
    transUnsubs.forEach((u) => {
      u();
    });
    routeSource.destroy();
    nodeSources.forEach((s) => {
      s.destroy();
    });
    activeSources.forEach((s) => {
      s.destroy();
    });
    transitionSources.forEach((s) => {
      s.destroy();
    });
  });

  it("S5.2: Notification ordering consistency", async () => {
    const navRoutes = ["users.list", "about", "admin.dashboard", "home"];
    const activeRouteNames = [
      "home",
      "users",
      "users.list",
      "admin",
      "admin.dashboard",
      "about",
    ];
    const nodeNames = ["users", "admin", "home", ""];

    const routeSources = createManySources(() => createRouteSource(router), 10);
    const nodeSources = Array.from({ length: 10 }, (_, i) =>
      createRouteNodeSource(router, nodeNames[i % nodeNames.length]),
    );
    const activeSources = Array.from({ length: 10 }, (_, i) =>
      createActiveRouteSource(
        router,
        activeRouteNames[i % activeRouteNames.length],
      ),
    );
    const transitionSources = createManySources(
      () => createTransitionSource(router),
      10,
    );

    const routeUnsubs = routeSources.map((s) => s.subscribe(() => {}));
    const nodeUnsubs = nodeSources.map((s) => s.subscribe(() => {}));
    const activeUnsubs = activeSources.map((s) => s.subscribe(() => {}));
    const transUnsubs = transitionSources.map((s) => s.subscribe(() => {}));

    for (let i = 0; i < 50; i++) {
      await router.navigate(navRoutes[i % navRoutes.length]);
      const state = router.getState();

      routeSources.forEach((s) => {
        expect(s.getSnapshot().route?.name).toBe(state?.name);
      });
      transitionSources.forEach((s) => {
        expect(s.getSnapshot().isTransitioning).toBe(false);
      });
      activeSources.forEach((s, j) => {
        const name = activeRouteNames[j % activeRouteNames.length];

        expect(s.getSnapshot()).toBe(router.isActiveRoute(name));
      });
    }

    routeUnsubs.forEach((u) => {
      u();
    });
    nodeUnsubs.forEach((u) => {
      u();
    });
    activeUnsubs.forEach((u) => {
      u();
    });
    transUnsubs.forEach((u) => {
      u();
    });
    routeSources.forEach((s) => {
      s.destroy();
    });
    nodeSources.forEach((s) => {
      s.destroy();
    });
    activeSources.forEach((s) => {
      s.destroy();
    });
    transitionSources.forEach((s) => {
      s.destroy();
    });
  });

  it("S5.3: Destroy order: TransitionSource → ActiveRouteSource → RouteNodeSource → RouteSource", async () => {
    const routes = ["users.list", "about", "admin.dashboard", "home"];

    const routeSources = createManySources(() => createRouteSource(router), 10);
    const nodeSources = createManySources(
      () => createRouteNodeSource(router, ""),
      10,
    );
    const activeSources = createManySources(
      () => createActiveRouteSource(router, "about"),
      10,
    );
    const transitionSources = createManySources(
      () => createTransitionSource(router),
      10,
    );

    const routeCounters = Array.from({ length: 10 }, () => ({ count: 0 }));
    const nodeCounters = Array.from({ length: 10 }, () => ({ count: 0 }));
    const activeCounters = Array.from({ length: 10 }, () => ({ count: 0 }));
    const transCounters = Array.from({ length: 10 }, () => ({ count: 0 }));

    const routeUnsubs = routeSources.map((s, i) =>
      s.subscribe(() => {
        routeCounters[i].count++;
      }),
    );
    const nodeUnsubs = nodeSources.map((s, i) =>
      s.subscribe(() => {
        nodeCounters[i].count++;
      }),
    );
    const activeUnsubs = activeSources.map((s, i) =>
      s.subscribe(() => {
        activeCounters[i].count++;
      }),
    );
    const transUnsubs = transitionSources.map((s, i) =>
      s.subscribe(() => {
        transCounters[i].count++;
      }),
    );

    transitionSources.forEach((s) => {
      s.destroy();
    });
    for (let i = 0; i < 10; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    expect(transCounters.every((c) => c.count === 0)).toBe(true);
    expect(routeCounters.every((c) => c.count === 10)).toBe(true);

    activeSources.forEach((s) => {
      s.destroy();
    });
    const activeAtDestroy = activeCounters.map((c) => c.count);

    for (let i = 0; i < 10; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    activeCounters.forEach((c, i) => {
      expect(c.count).toBe(activeAtDestroy[i]);
    });

    expect(routeCounters.every((c) => c.count === 20)).toBe(true);

    nodeSources.forEach((s) => {
      s.destroy();
    });
    const nodeAtDestroy = nodeCounters.map((c) => c.count);

    for (let i = 0; i < 10; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    nodeCounters.forEach((c, i) => {
      expect(c.count).toBe(nodeAtDestroy[i]);
    });

    expect(routeCounters.every((c) => c.count === 30)).toBe(true);

    routeSources.forEach((s) => {
      s.destroy();
    });
    const routeAtDestroy = routeCounters.map((c) => c.count);

    for (let i = 0; i < 10; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    routeCounters.forEach((c, i) => {
      expect(c.count).toBe(routeAtDestroy[i]);
    });

    expect(routeAtDestroy.every((c) => c === 30)).toBe(true);

    routeUnsubs.forEach((u) => {
      u();
    });
    nodeUnsubs.forEach((u) => {
      u();
    });
    activeUnsubs.forEach((u) => {
      u();
    });
    transUnsubs.forEach((u) => {
      u();
    });
  });

  it("S5.4: Router stop with active sources", async () => {
    await router.navigate("users.list");

    const routeSources = createManySources(() => createRouteSource(router), 25);
    const nodeSources = createManySources(
      () => createRouteNodeSource(router, "users"),
      25,
    );
    const activeSources = createManySources(
      () => createActiveRouteSource(router, "users.list"),
      25,
    );
    const transitionSources = createManySources(
      () => createTransitionSource(router),
      25,
    );

    const routeUnsubs = routeSources.map((s) => s.subscribe(() => {}));
    const nodeUnsubs = nodeSources.map((s) => s.subscribe(() => {}));
    const activeUnsubs = activeSources.map((s) => s.subscribe(() => {}));
    const transUnsubs = transitionSources.map((s) => s.subscribe(() => {}));

    expect(() => {
      router.stop();
    }).not.toThrowError();

    routeSources.forEach((s) => {
      const snap = s.getSnapshot();

      expect(snap.route).toBeDefined();
      expect(snap.route?.name).toBe("users.list");
    });
    nodeSources.forEach((s) => {
      const snap = s.getSnapshot();

      expect(snap).toHaveProperty("route");
      expect(snap).toHaveProperty("previousRoute");
    });
    activeSources.forEach((s) => {
      expect(typeof s.getSnapshot()).toBe("boolean");
    });
    transitionSources.forEach((s) => {
      const snap = s.getSnapshot();

      expect(snap.isTransitioning).toBe(false);
    });

    routeUnsubs.forEach((u) => {
      u();
    });
    nodeUnsubs.forEach((u) => {
      u();
    });
    activeUnsubs.forEach((u) => {
      u();
    });
    transUnsubs.forEach((u) => {
      u();
    });
    routeSources.forEach((s) => {
      s.destroy();
    });
    nodeSources.forEach((s) => {
      s.destroy();
    });
    activeSources.forEach((s) => {
      s.destroy();
    });
    transitionSources.forEach((s) => {
      s.destroy();
    });
  });

  it("S5.5: 100 ActiveRouteSource with deep routes (a.b.c.d.e.f) + 200 navigations", async () => {
    const deepRouteNames = [
      "a",
      "a.b",
      "a.b.c",
      "a.b.c.d",
      "a.b.c.d.e",
      "a.b.c.d.e.f",
      "users",
      "admin",
      "home",
      "about",
    ];
    const navRoutes = [
      "users.list",
      "a.b.c.d.e.f",
      "admin.dashboard",
      "home",
      "about",
    ];

    const activeSources = Array.from({ length: 100 }, (_, i) =>
      createActiveRouteSource(
        router,
        deepRouteNames[i % deepRouteNames.length],
      ),
    );
    const activeUnsubs = activeSources.map((s) => s.subscribe(() => {}));

    for (let i = 0; i < 200; i++) {
      await router.navigate(navRoutes[i % navRoutes.length]);
    }

    activeSources.forEach((s, i) => {
      const name = deepRouteNames[i % deepRouteNames.length];

      expect(s.getSnapshot()).toBe(router.isActiveRoute(name));
    });

    activeSources
      .filter((_, i) => deepRouteNames[i % deepRouteNames.length] === "a")
      .forEach((s) => {
        expect(s.getSnapshot()).toBe(false);
      });

    activeUnsubs.forEach((u) => {
      u();
    });
    activeSources.forEach((s) => {
      s.destroy();
    });
  });
});
