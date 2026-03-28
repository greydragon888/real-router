import { createRouter, getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";

import type { Route, Router } from "@real-router/core";

export function createStressRouter(routeCount = 10): Router {
  const routes: Route[] = [
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "view", path: "/:id" },
        { name: "edit", path: "/:id/edit" },
      ],
    },
    {
      name: "admin",
      path: "/admin",
      children: [
        { name: "dashboard", path: "/dashboard" },
        { name: "settings", path: "/settings" },
      ],
    },
  ];

  for (let i = 0; i < routeCount; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}` });
  }

  return createRouter(routes, { defaultRoute: "route0" });
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function renderWithRouter(
  router: Router,

  Component: any,
  props: Record<string, unknown> = {},
) {
  const navigator = getNavigator(router);
  const source = createRouteSource(router);

  const unsub = source.subscribe(() => {});

  const context = new Map<string, unknown>([
    ["real-router:router", router],
    ["real-router:navigator", navigator],
    [
      "real-router:route",
      {
        navigator,
        get route() {
          return {
            get current() {
              return source.getSnapshot().route;
            },
          };
        },
        get previousRoute() {
          return {
            get current() {
              return source.getSnapshot().previousRoute;
            },
          };
        },
      },
    ],
  ]);

  const result = render(Component, { props, context });

  const originalUnmount = result.unmount;

  result.unmount = () => {
    unsub();
    originalUnmount();
  };

  return result;
}

export async function navigateSequentially(
  router: Router,
  routes: { name: string; params?: Record<string, string> }[],
): Promise<void> {
  for (const { name, params } of routes) {
    await router.navigate(name, params);
    await tick();
  }
}

export function roundRobinRoutes(
  routeNames: string[],
  count: number,
): string[] {
  return Array.from(
    { length: count },
    (_, i) => routeNames[i % routeNames.length],
  );
}

export function forceGC(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

export function getHeapUsedBytes(): number {
  return process.memoryUsage().heapUsed;
}

export function takeHeapSnapshot(): number {
  forceGC();

  return getHeapUsedBytes();
}

export const MB = 1024 * 1024;
