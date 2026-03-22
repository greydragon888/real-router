import { render } from "@solidjs/testing-library";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, useRouteNode, useRoute } from "@real-router/solid";

import {
  createStressRouter,
  navigateSequentially,
  roundRobinRoutes,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("subscription-fanout stress tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("1.1: 30 useRouteNode on different nodes + 100 navigations — signals track correctly", async () => {
    const signalReadCounts: number[] = Array.from<number>({ length: 30 }).fill(
      0,
    );

    function NodeSubscriber(props: { index: number }) {
      const routeState = useRouteNode(`route${props.index}`);

      createEffect(() => {
        routeState();
        signalReadCounts[props.index]++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 30 }, (_, i) => (
          <NodeSubscriber index={i} />
        ))}
      </RouterProvider>
    ));

    const countsAfterMount = [...signalReadCounts];

    await router.navigate("users.list");

    const routeNames = Array.from({ length: 30 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    for (let i = 0; i < 30; i++) {
      const delta = signalReadCounts[i] - countsAfterMount[i];

      expect(delta).toBeGreaterThanOrEqual(2);
    }
  });

  it("1.2: 20 useRoute + 30 useRouteNode('') consumers + 100 navigations — all signals update", async () => {
    await router.navigate("users.list");

    let routeEffectRuns = 0;
    let rootNodeEffectRuns = 0;

    function RouteConsumer() {
      const routeState = useRoute();

      createEffect(() => {
        routeState();
        routeEffectRuns++;
      });

      return <div />;
    }

    function RootNodeConsumer() {
      const routeState = useRouteNode("");

      createEffect(() => {
        routeState();
        rootNodeEffectRuns++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 20 }, (_, i) => (
          <RouteConsumer />
        ))}
        {Array.from({ length: 30 }, (_, i) => (
          <RootNodeConsumer />
        ))}
      </RouterProvider>
    ));

    const routeAfterMount = routeEffectRuns;
    const rootAfterMount = rootNodeEffectRuns;

    const routeNames = Array.from({ length: 10 }, (_, i) => `route${i}`);
    const sequence = roundRobinRoutes(routeNames, 100);

    await navigateSequentially(
      router,
      sequence.map((name) => ({ name })),
    );

    expect(routeEffectRuns - routeAfterMount).toBe(20 * 100);
    expect(rootNodeEffectRuns - rootAfterMount).toBe(30 * 100);
  });

  it("1.3: 50 useRouteNode('users') — effects fire only during users navigations", async () => {
    let usersEffectRuns = 0;

    function UsersSubscriber() {
      const routeState = useRouteNode("users");

      createEffect(() => {
        routeState();
        usersEffectRuns++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 50 }, (_, i) => (
          <UsersSubscriber />
        ))}
      </RouterProvider>
    ));

    const effectsAfterMount = usersEffectRuns;

    const usersRoutes = [
      { name: "users.list" },
      { name: "users.view", params: { id: "1" } },
      { name: "users.edit", params: { id: "1" } },
      { name: "users.list" },
      { name: "users.view", params: { id: "2" } },
    ];

    for (let i = 0; i < 10; i++) {
      for (const r of usersRoutes) {
        await router.navigate(r.name, r.params);
      }
    }

    const usersNavigationEffects = usersEffectRuns - effectsAfterMount;

    expect(usersNavigationEffects).toBe(50 * 50);

    const outsideRoutes = roundRobinRoutes(
      ["route0", "route1", "route2", "route3", "route4"],
      50,
    );

    const effectsBeforeOutside = usersEffectRuns;

    await navigateSequentially(
      router,
      outsideRoutes.map((name) => ({ name })),
    );

    const effectsAfterOutside = usersEffectRuns - effectsBeforeOutside;

    expect(effectsAfterOutside).toBe(50);
  });

  it("1.4: mount/unmount 10 components concurrently with navigation — no errors, cleanup fires", async () => {
    let errorThrown: unknown = null;
    let cleanupCount = 0;
    const [show, setShow] = createSignal(true);

    function NodeComp(props: { name: string }) {
      useRouteNode(props.name);
      onCleanup(() => {
        cleanupCount++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        {show()
          ? Array.from({ length: 10 }, (_, i) => (
              <NodeComp name={`route${i % 5}`} />
            ))
          : null}
      </RouterProvider>
    ));

    try {
      for (let i = 0; i < 10; i++) {
        setShow((s) => !s);
        await router.navigate(`route${(i % 5) + 1}`);
      }
    } catch (error) {
      errorThrown = error;
    }

    expect(errorThrown).toBeNull();
    expect(cleanupCount).toBeGreaterThan(0);
  });

  it("1.5: 50 components subscribe, navigate 50 times, then unmount — all cleanups fire", async () => {
    let cleanupCount = 0;

    function CleanupSubscriber(props: { index: number }) {
      useRouteNode(`route${props.index % 50}`);
      onCleanup(() => {
        cleanupCount++;
      });

      return <div />;
    }

    const { unmount } = render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 50 }, (_, i) => (
          <CleanupSubscriber index={i} />
        ))}
      </RouterProvider>
    ));

    for (let i = 0; i < 50; i++) {
      await router.navigate(`route${(i % 49) + 1}`);
    }

    unmount();

    expect(cleanupCount).toBe(50);
  });
});
