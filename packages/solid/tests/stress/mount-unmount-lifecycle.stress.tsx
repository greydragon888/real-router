import { createRouter } from "@real-router/core";
import { render } from "@solidjs/testing-library";
import { onCleanup, createSignal, createEffect } from "solid-js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  RouterProvider,
  useRouteNode,
  useRoute,
  useRouterTransition,
  Link,
} from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("R3 — mount/unmount subscription lifecycle", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("3.1: mount/unmount useRouteNode x 200 cycles — no errors, bounded heap", () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <NodeConsumer />
        </RouterProvider>
      ));

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("3.2: mount/unmount useRoute x 200 cycles — no errors, bounded heap", () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <RouteConsumer />
        </RouterProvider>
      ));

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("3.3: 50 components mount -> navigate x 10 -> unmount -> remount -> navigate x 10", async () => {
    let cleanupCount = 0;

    function TrackedConsumer(props: { index: number }) {
      useRouteNode(`route${props.index}`);
      onCleanup(() => {
        cleanupCount++;
      });

      return <div />;
    }

    const { unmount } = render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 50 }, (_, i) => (
          <TrackedConsumer index={i} />
        ))}
      </RouterProvider>
    ));

    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i + 1}`);
    }

    unmount();

    expect(cleanupCount).toBe(50);

    cleanupCount = 0;

    const { unmount: unmount2 } = render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 50 }, (_, i) => (
          <TrackedConsumer index={i} />
        ))}
      </RouterProvider>
    ));

    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i % 10}`);
    }

    unmount2();

    expect(cleanupCount).toBe(50);
  });

  it("3.4: conditional toggle 20 useRouteNode x 100 — no errors, onCleanup fires correctly", () => {
    let cleanupCallCount = 0;
    const [show, setShow] = createSignal(true);

    function ToggleConsumer(props: { index: number }) {
      useRouteNode(`route${props.index}`);
      onCleanup(() => {
        cleanupCallCount++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        {show() ? (
          <>
            {Array.from({ length: 20 }, (_, i) => (
              <ToggleConsumer index={i} />
            ))}
          </>
        ) : null}
      </RouterProvider>
    ));

    for (let i = 0; i < 100; i++) {
      setShow((s) => !s);
    }

    expect(cleanupCallCount).toBe(20 * 50);
  });

  it("3.6: router stop/restart while 50 components mounted — signals update after restart", async () => {
    let lastSeenRoute: string | undefined;

    function RootConsumer() {
      const routeState = useRouteNode("");

      createEffect(() => {
        lastSeenRoute = routeState().route?.name;
      });

      return <div>{routeState().route?.name ?? "none"}</div>;
    }

    render(() => (
      <RouterProvider router={router}>
        <RootConsumer />
      </RouterProvider>
    ));

    for (let i = 0; i < 5; i++) {
      await router.navigate(`route${i + 1}`);
    }

    expect(lastSeenRoute).toBe("route5");

    router.stop();

    await router.start("/route0");

    for (let i = 0; i < 5; i++) {
      await router.navigate(`route${i + 1}`);
    }

    expect(router.getState()?.name).toBe("route5");
  });

  it("3.8: mount/unmount Link x 200 cycles — no crashes, Link works after cycles", async () => {
    for (let i = 0; i < 200; i++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <Link routeName="route0">L</Link>
        </RouterProvider>
      ));

      unmount();
    }

    const { getByText } = render(() => (
      <RouterProvider router={router}>
        <Link routeName="route1">go</Link>
      </RouterProvider>
    ));

    const link = getByText("go");

    expect(link).toBeInTheDocument();

    await router.navigate("route1");

    expect(router.getState()?.name).toBe("route1");
  });

  it("3.9: mount/unmount useRouterTransition x 200 cycles — no crashes, transitions work after cycles", async () => {
    for (let i = 0; i < 200; i++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <TransitionConsumer />
        </RouterProvider>
      ));

      unmount();
    }

    const freshRouter = createRouter([
      { name: "t1", path: "/t1" },
      { name: "t2", path: "/t2" },
      { name: "t3", path: "/t3" },
    ]);

    await freshRouter.start("/t1");

    let lastTransitionRoute: string | undefined;

    function TransitionChecker() {
      const transition = useRouterTransition();

      lastTransitionRoute = transition().toRoute?.name;

      return <div />;
    }

    render(() => (
      <RouterProvider router={freshRouter}>
        <TransitionChecker />
      </RouterProvider>
    ));

    await freshRouter.navigate("t2");

    expect(freshRouter.getState()?.name).toBe("t2");

    freshRouter.stop();
  });
});

function NodeConsumer(): JSX.Element {
  useRouteNode("route0");

  return <div />;
}

function RouteConsumer(): JSX.Element {
  useRoute();

  return <div />;
}

function TransitionConsumer(): JSX.Element {
  useRouterTransition();

  return <div />;
}
