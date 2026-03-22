import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import ManyConsumers from "./components/ManyConsumers.svelte";
import RouteAndNodeApp from "./components/RouteAndNodeApp.svelte";
import SameNodeConsumers from "./components/SameNodeConsumers.svelte";
import {
  createStressRouter,
  renderWithRouter,
  navigateSequentially,
  roundRobinRoutes,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("subscription-fanout stress tests (Svelte)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("1.1: 30 useRouteNode on different nodes + 50 navigations — each re-renders when its node is navigated to", async () => {
    const renderCounts: number[] = Array.from({ length: 30 }, () => 0);
    const onRenders = renderCounts.map((_, i) => () => {
      renderCounts[i]++;
    });

    renderWithRouter(router, ManyConsumers, {
      count: 30,
      onRenders,
    });

    await tick();

    const countsAfterMount = [...renderCounts];

    await router.navigate("users.list");
    await tick();

    const routeNames = Array.from({ length: 30 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 50);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    for (let i = 0; i < 30; i++) {
      const delta = renderCounts[i] - countsAfterMount[i];

      expect(delta).toBeGreaterThanOrEqual(2);
    }
  });

  it("1.2: 15 useRoute + 15 useRouteNode('') consumers + 50 navigations — each re-renders on every navigation", async () => {
    await router.navigate("users.list");
    await tick();

    let routeRenders = 0;
    let rootNodeRenders = 0;

    const { unmount } = render(RouteAndNodeApp, {
      props: {
        router,
        routeCount: 15,
        nodeCount: 15,
        onRouteRender: () => {
          routeRenders++;
        },
        onNodeRender: () => {
          rootNodeRenders++;
        },
      },
    });

    await tick();

    const routeAfterMount = routeRenders;
    const rootAfterMount = rootNodeRenders;

    const routeNames = Array.from({ length: 10 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 50);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    expect(routeRenders - routeAfterMount).toBe(15 * 50);
    expect(rootNodeRenders - rootAfterMount).toBe(15 * 50);

    unmount();
  });

  it("1.3: 30 useRouteNode('users') — renders during users navigations, minimal outside", async () => {
    let usersRenders = 0;
    const incrementUsersRenders = () => {
      usersRenders++;
    };
    const onRenders = Array.from({ length: 30 }, () => incrementUsersRenders);

    const { unmount } = renderWithRouter(router, SameNodeConsumers, {
      count: 30,
      nodeName: "users",
      onRenders,
    });

    await tick();

    const rendersAfterMount = usersRenders;

    const usersRoutes = [
      { name: "users.list" },
      { name: "users.view", params: { id: "1" } },
      { name: "users.edit", params: { id: "1" } },
      { name: "users.list" },
      { name: "users.view", params: { id: "2" } },
    ];

    for (let rep = 0; rep < 10; rep++) {
      for (const r of usersRoutes) {
        await router.navigate(r.name, r.params);
        await tick();
      }
    }

    const usersNavigationRenders = usersRenders - rendersAfterMount;

    expect(usersNavigationRenders).toBe(30 * 50);

    const outsideRoutes = roundRobinRoutes(
      ["route0", "route1", "route2", "route3", "route4"],
      50,
    );

    const rendersBeforeOutside = usersRenders;

    await navigateSequentially(
      router,
      outsideRoutes.map((name) => ({ name })),
    );

    const rendersAfterOutside = usersRenders - rendersBeforeOutside;

    expect(rendersAfterOutside).toBe(30);

    unmount();
  });

  it("1.4: mount/unmount 10 components concurrently with navigation — no errors thrown", async () => {
    let errorThrown: unknown = null;

    const { unmount } = renderWithRouter(router, ManyConsumers, {
      count: 10,
    });

    await tick();

    try {
      for (let i = 0; i < 10; i++) {
        unmount();

        const result = renderWithRouter(router, ManyConsumers, {
          count: 10,
        });

        await router.navigate(`route${(i % 5) + 1}`);
        await tick();

        result.unmount();

        const result2 = renderWithRouter(router, ManyConsumers, {
          count: 10,
        });

        await tick();
        result2.unmount();
      }
    } catch (error) {
      errorThrown = error;
    }

    expect(errorThrown).toBeNull();
  });
});
