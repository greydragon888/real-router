import { createRouter } from "@real-router/core";
import { render, cleanup } from "@testing-library/preact";
import { describe, it, expect, afterEach } from "vitest";

import { RouterProvider, useRoute, useRouteNode } from "@real-router/preact";

import { takeHeapSnapshot, MB } from "./helpers";

import type { FunctionComponent } from "preact";

/**
 * Audit section 7, scenario #7: one shared configuration / factory setup
 * reused to create N independent router instances. All N are mounted via
 * RouterProvider, consumed by hooks, then disposed. Heap must remain bounded.
 *
 * This catches regressions where source factories or WeakMap caches retain
 * references to disposed routers.
 */
describe("preact — factory reuse: 100 router instances, all disposed", () => {
  afterEach(() => {
    cleanup();
  });

  it("100 RouterProvider mount/unmount cycles with fresh routers — heap bounded", () => {
    const makeRoutes = () => [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
    ];

    const Consumer: FunctionComponent = () => {
      useRoute();
      useRouteNode("users");

      return <div />;
    };

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createRouter(makeRoutes(), { defaultRoute: "home" });

      // Synchronous start so we do not leak pending promises across iterations.
      void router.start("/");

      const { unmount } = render(
        <RouterProvider router={router}>
          <Consumer />
        </RouterProvider>,
      );

      unmount();
      router.stop();
    }

    const heapAfter = takeHeapSnapshot();

    // 100 routers × their subscriptions must not retain significant heap.
    // Tight bound (10 MB) deliberately — higher would mask leaks.
    expect(heapAfter - heapBefore).toBeLessThan(10 * MB);
  });

  it("source hooks per-router: no cross-instance state bleed", async () => {
    const routerA = createRouter(
      [
        { name: "home", path: "/" },
        { name: "a", path: "/a" },
      ],
      { defaultRoute: "home" },
    );
    const routerB = createRouter(
      [
        { name: "home", path: "/" },
        { name: "b", path: "/b" },
      ],
      { defaultRoute: "home" },
    );

    await routerA.start("/");
    await routerB.start("/");

    let lastFromA = "";
    let lastFromB = "";

    const ProbeA: FunctionComponent = () => {
      const { route } = useRoute();

      lastFromA = route?.name ?? "";

      return null;
    };

    const ProbeB: FunctionComponent = () => {
      const { route } = useRoute();

      lastFromB = route?.name ?? "";

      return null;
    };

    const { unmount: unmountA } = render(
      <RouterProvider router={routerA}>
        <ProbeA />
      </RouterProvider>,
    );
    const { unmount: unmountB } = render(
      <RouterProvider router={routerB}>
        <ProbeB />
      </RouterProvider>,
    );

    await routerA.navigate("a");
    await routerB.navigate("b");

    // Each probe sees its own router's route — no cross-instance bleed.
    expect(lastFromA).toBe("a");
    expect(lastFromB).toBe("b");

    unmountA();
    unmountB();
    routerA.stop();
    routerB.stop();
  });
});
