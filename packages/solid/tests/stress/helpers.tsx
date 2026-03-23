import { createRouter } from "@real-router/core";

import type { Route, Router } from "@real-router/core";

/**
 * Creates a router with N flat routes (route0..routeN-1) plus
 * a "users" subtree with list/view/edit children.
 */
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

export async function navigateSequentially(
  router: Router,
  routes: { name: string; params?: Record<string, string> }[],
): Promise<void> {
  for (const { name, params } of routes) {
    await router.navigate(name, params);
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
