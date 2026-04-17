import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, useRoute, useRouteNode } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

// Scenario L1 from audit section 7.2 (follow-up to M1): 10 000 navigations
// on a SINGLE long-lived subscription. Where M1 churns Link mount/unmount to
// probe the WeakMap activeSourceCache, this test keeps the subscriber list
// constant and verifies that router-internal listener arrays in
// `createRouteSource` / `createRouteNodeSource` do not grow per-navigation.
describe("L1 — long-lived subscription through 10000 navigations", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("L1 — 10000 navigate() on stable subscribers — bounded heap, all effects fire", async () => {
    let rootEffectCount = 0;
    let nodeEffectCount = 0;

    function RootConsumer() {
      const routeState = useRoute();

      createEffect(() => {
        routeState();
        rootEffectCount++;
      });

      return null;
    }

    function NodeConsumer() {
      const routeState = useRouteNode("users");

      createEffect(() => {
        routeState();
        nodeEffectCount++;
      });

      return null;
    }

    render(() => (
      <RouterProvider router={router}>
        <RootConsumer />
        <NodeConsumer />
      </RouterProvider>
    ));

    const rootAfterMount = rootEffectCount;
    const nodeAfterMount = nodeEffectCount;

    const heapBefore = takeHeapSnapshot();

    // Alternate between route1 and route2 — starting route is route0, so the
    // very first navigate() must target a different route to avoid
    // SAME_STATES.
    for (let i = 0; i < 10_000; i++) {
      await router.navigate(`route${(i % 2) + 1}`);
    }

    const heapAfter = takeHeapSnapshot();

    // Root listener must fire on every navigation.
    expect(rootEffectCount - rootAfterMount).toBe(10_000);

    // Node("users") must NOT fire when navigating inside flat routes that do
    // not touch the users subtree.
    expect(nodeEffectCount - nodeAfterMount).toBe(0);

    // Bounded heap. With listener arrays that don't leak, growth stays small.
    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  }, 120_000);
});
