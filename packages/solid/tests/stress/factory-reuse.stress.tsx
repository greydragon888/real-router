import { render } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, MB, forceGC } from "./helpers";

// Scenario S4 from audit section 7.2: churn 100 router instances through
// the WeakMap caches (useRouteNode, useRouteNodeStore, useRouterTransition,
// Link slow path, useRouterError). Each router should be GC-collectable
// once all references to it are dropped — WeakMap keys auto-release.
describe("F1 — factory reuse (100 router instances)", () => {
  it("F1 — 100 router instances via factory — all disposed, heap stable", async () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(5);

      await router.start("/route0");

      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <Consumer />
        </RouterProvider>
      ));

      await router.navigate("users.list");

      unmount();
      router.stop();
    }

    forceGC();

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  }, 120_000);
});

function Consumer() {
  useRouteNode("users");

  return <div />;
}
