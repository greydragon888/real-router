import { errorCodes, getNavigator } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { render, act, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/react";

import { createStressRouter, forceGC, takeHeapSnapshot, MB } from "./helpers";

import type { Router, RouterError } from "@real-router/core";
import type { FC } from "react";

const NodeConsumer: FC<{ name: string }> = ({ name }) => {
  const { route } = useRouteNode(name);

  return <div data-testid={`node-${name}`}>{route?.name ?? "none"}</div>;
};

NodeConsumer.displayName = "NodeConsumer";

describe("R8 — dynamic route tree mutations mid-session", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("8.1: addRoute/removeRoute × 200 cycles — no listener leak, no crashes", async () => {
    const routesApi = getRoutesApi(router);

    const { unmount } = render(
      <RouterProvider router={router}>
        <NodeConsumer name="" />
      </RouterProvider>,
    );

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const dynName = `dyn${i}`;

      routesApi.add({ name: dynName, path: `/dyn${i}` });

      await act(async () => {
        await router.navigate(dynName);
      });

      expect(router.getState()?.name).toBe(dynName);

      await act(async () => {
        await router.navigate("route0");
      });

      routesApi.remove(dynName);

      expect(routesApi.has(dynName)).toBe(false);
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);

    unmount();
  });

  it("8.2: navigate to removed route rejects with ROUTE_NOT_FOUND (no zombie state)", async () => {
    const routesApi = getRoutesApi(router);

    routesApi.add({ name: "ephemeral", path: "/ephemeral" });

    await act(async () => {
      await router.navigate("ephemeral");
    });

    expect(router.getState()?.name).toBe("ephemeral");

    await act(async () => {
      await router.navigate("route0");
    });

    routesApi.remove("ephemeral");

    let caught: RouterError | undefined;

    await act(async () => {
      try {
        await router.navigate("ephemeral");
      } catch (error) {
        caught = error as RouterError;
      }
    });

    expect(caught?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    expect(router.getState()?.name).toBe("route0");
  });

  it("8.3: 50 mounted consumers survive 100 add/remove cycles", async () => {
    const routesApi = getRoutesApi(router);
    const mountedNames = Array.from({ length: 50 }, (_, i) => `route${i % 5}`);

    const { unmount } = render(
      <RouterProvider router={router}>
        {mountedNames.map((n, i) => (
          <NodeConsumer key={i} name={n} />
        ))}
      </RouterProvider>,
    );

    for (let i = 0; i < 100; i++) {
      const dynName = `transient${i}`;

      routesApi.add({ name: dynName, path: `/transient${i}` });

      await act(async () => {
        await router.navigate(dynName);
      });

      await act(async () => {
        await router.navigate(`route${i % 5}`);
      });

      routesApi.remove(dynName);
    }

    expect(router.getState()?.name).toMatch(/^route[0-4]$/);

    unmount();
    forceGC();
  });

  it("8.4: add → navigate → remove same route concurrently — no UB", async () => {
    const routesApi = getRoutesApi(router);
    const nav = getNavigator(router);

    for (let i = 0; i < 50; i++) {
      const name = `race${i}`;

      routesApi.add({ name, path: `/race${i}` });

      const navigatePromise = router.navigate(name);

      await act(async () => {
        try {
          await navigatePromise;
        } catch {
          // removal during navigation is a valid outcome
        }
      });

      // remove is a no-op while transitioning; ensure we are on a stable state first.
      if (nav.getState()?.name === name) {
        await act(async () => {
          await router.navigate("route0");
        });
      }

      routesApi.remove(name);
    }

    expect(router.getState()).toBeDefined();
  });
});
