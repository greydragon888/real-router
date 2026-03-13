import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createRouteNodeSource,
  createActiveRouteSource,
} from "@real-router/sources";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";

describe("S8 notification pipeline correctness", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S8.1: RouteNodeSource('users') fires on every navigation in users↔about cycle", async () => {
    const source = createRouteNodeSource(router, "users");
    let counter = 0;
    const unsub = source.subscribe(() => {
      counter++;
    });

    for (let i = 0; i < 200; i++) {
      await (i % 2 === 0
        ? router.navigate("users.list")
        : router.navigate("about"));
    }

    expect(counter).toBe(200);

    unsub();
    source.destroy();
  });

  it("S8.2: ActiveRouteSource dedup suppresses notifications across users.list↔users.view", async () => {
    const source = createActiveRouteSource(router, "users");
    let counter = 0;
    const unsub = source.subscribe(() => {
      counter++;
    });

    for (let i = 0; i < 200; i++) {
      await (i % 2 === 0
        ? router.navigate("users.list")
        : router.navigate("users.view", { id: "1" }));
    }

    expect(counter).toBe(1);

    unsub();
    source.destroy();
  });

  it("S8.3: ActiveRouteSource fires on every users.list↔about alternation", async () => {
    const source = createActiveRouteSource(router, "users");
    let counter = 0;
    const unsub = source.subscribe(() => {
      counter++;
    });

    for (let i = 0; i < 200; i++) {
      await (i % 2 === 0
        ? router.navigate("users.list")
        : router.navigate("about"));
    }

    expect(counter).toBe(200);

    unsub();
    source.destroy();
  });

  it("S8.4: getSnapshot returns consistent reference within each listener invocation", async () => {
    const source = createRouteSource(router);
    let allConsistent = true;

    const unsub = source.subscribe(() => {
      const first = source.getSnapshot();

      for (let j = 1; j < 100; j++) {
        if (!Object.is(source.getSnapshot(), first)) {
          allConsistent = false;
        }
      }
    });

    for (let i = 0; i < 100; i++) {
      await router.navigate(i % 2 === 0 ? "about" : "home");
    }

    expect(allConsistent).toBe(true);
    expect(source.getSnapshot().route?.name).toBe(router.getState()?.name);

    unsub();
    source.destroy();
  });

  it("S8.5: fan-out: 100 sources across 4 nodes, 200 navigations", async () => {
    let rootCount = 0;
    let usersCount = 0;
    let adminCount = 0;
    let homeCount = 0;

    const rootSources = Array.from({ length: 25 }, () => {
      const source = createRouteNodeSource(router, "");

      source.subscribe(() => {
        rootCount++;
      });

      return source;
    });

    const usersSources = Array.from({ length: 25 }, () => {
      const source = createRouteNodeSource(router, "users");

      source.subscribe(() => {
        usersCount++;
      });

      return source;
    });

    const adminSources = Array.from({ length: 25 }, () => {
      const source = createRouteNodeSource(router, "admin");

      source.subscribe(() => {
        adminCount++;
      });

      return source;
    });

    const homeSources = Array.from({ length: 25 }, () => {
      const source = createRouteNodeSource(router, "home");

      source.subscribe(() => {
        homeCount++;
      });

      return source;
    });

    const cycle = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 200; i++) {
      await router.navigate(cycle[i % 4]);
    }

    expect(rootCount).toBe(25 * 200);
    expect(rootCount + usersCount + adminCount + homeCount).toBeLessThanOrEqual(
      100 * 200,
    );

    rootSources.forEach((s) => {
      s.destroy();
    });
    usersSources.forEach((s) => {
      s.destroy();
    });
    adminSources.forEach((s) => {
      s.destroy();
    });
    homeSources.forEach((s) => {
      s.destroy();
    });
  });
});
