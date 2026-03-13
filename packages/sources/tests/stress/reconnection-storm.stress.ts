import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createRouteNodeSource } from "@real-router/sources";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

describe("S4. Reconnection storm — RouteNodeSource", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S4.1: 200 subscribe/unsubscribe cycles: snapshot reflects router state on reconnect", async () => {
    const source = createRouteNodeSource(router, "users");

    for (let i = 0; i < 200; i++) {
      const unsub1 = source.subscribe(() => {});

      await router.navigate("users.list");
      unsub1();
      await router.navigate("about");
      const unsub2 = source.subscribe(() => {});

      expect(source.getSnapshot().route).toBeUndefined();

      unsub2();
    }

    source.destroy();
  });

  it("S4.2: RouteNodeSource('users') disconnected during 50 non-users navigations: reconciled on reconnect", async () => {
    const source = createRouteNodeSource(router, "users");
    const unsub = source.subscribe(() => {});

    await router.navigate("users.list");
    unsub();

    const nonUserRoutes = [
      "home",
      "about",
      "admin.dashboard",
      "admin.settings",
    ];

    for (let i = 0; i < 50; i++) {
      await router.navigate(nonUserRoutes[i % nonUserRoutes.length]);
    }

    const unsub2 = source.subscribe(() => {});

    expect(source.getSnapshot().route).toBeUndefined();

    unsub2();
    source.destroy();
  });

  it("S4.3: RouteNodeSource('users') reconciles to users.view state on reconnect after navigating while disconnected", async () => {
    const source = createRouteNodeSource(router, "users");
    const unsub = source.subscribe(() => {});

    await router.navigate("about");
    unsub();

    await router.navigate("users.view", { id: "42" });

    const unsub2 = source.subscribe(() => {});
    const snapshot = source.getSnapshot();

    expect(snapshot.route).toBeDefined();
    expect(snapshot.route?.name).toBe("users.view");

    unsub2();
    source.destroy();
  });

  it("S4.4: 50 RouteNodeSources rapid disconnect/reconnect cycles: all snapshots consistent after 100 cycles", async () => {
    const nodeNames = ["users", "admin", "home", ""];
    const sources = Array.from({ length: 50 }, (_, i) =>
      createRouteNodeSource(router, nodeNames[i % nodeNames.length]),
    );

    const unsubs: (() => void)[] = sources.map((s) => s.subscribe(() => {}));

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 100; i++) {
      const idx = i % sources.length;

      unsubs[idx]();
      await router.navigate(routes[i % routes.length]);
      unsubs[idx] = sources[idx].subscribe(() => {});
    }

    const finalRoute = router.getState();

    for (const [i, source] of sources.entries()) {
      const nodeName = nodeNames[i % nodeNames.length];
      const snapshot = source.getSnapshot();
      const isActive =
        nodeName === "" ||
        (finalRoute !== undefined &&
          (finalRoute.name === nodeName ||
            finalRoute.name.startsWith(`${nodeName}.`)));

      const expectedRoute = isActive ? finalRoute : undefined;

      expect(snapshot.route).toStrictEqual(expectedRoute);
    }

    for (const u of unsubs) {
      u();
    }

    sources.forEach((s) => {
      s.destroy();
    });
  });

  it("S4.5: 50 RouteNodeSource('') root sources all receive all 200 navigations", async () => {
    const counters = Array.from({ length: 50 }, () => 0);
    const sources = Array.from({ length: 50 }, () =>
      createRouteNodeSource(router, ""),
    );
    const unsubs = sources.map((s, i) =>
      s.subscribe(() => {
        counters[i]++;
      }),
    );

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let j = 0; j < 200; j++) {
      await router.navigate(routes[j % routes.length]);
    }

    const finalState = router.getState();

    for (let i = 0; i < 50; i++) {
      expect(counters[i]).toBe(200);
      expect(sources[i].getSnapshot().route).toStrictEqual(finalState);
    }

    for (const u of unsubs) {
      u();
    }

    sources.forEach((s) => {
      s.destroy();
    });
  });
});
