import { createRouter } from "@real-router/core";
import { act } from "@testing-library/preact";
import { useRef } from "preact/hooks";

import type { Route, Router } from "@real-router/core";
import type { FunctionComponent } from "preact";

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

/**
 * Creates a router with a deep tree: depth levels, breadth children at each level.
 * e.g. createDeepRouter(3, 2) → root, root.n0, root.n0.n00, root.n0.n01, ...
 */
export function createDeepRouter(depth: number, breadth: number): Router {
  function buildChildren(prefix: string, level: number): Route[] {
    if (level >= depth) {
      return [];
    }

    return Array.from({ length: breadth }, (_, i) => {
      const name = `${prefix}${i}`;

      return {
        name,
        path: `/${name}`,
        children: buildChildren(name, level + 1),
      };
    });
  }

  const routes: Route[] = [
    {
      name: "root",
      path: "/root",
      children: buildChildren("n", 0),
    },
    { name: "other", path: "/other" },
  ];

  return createRouter(routes, { defaultRoute: "other" });
}

/**
 * Creates a render-counting component.
 * Returns the component and a function to read the count.
 */
export function createRenderCounter(testId: string): {
  Component: FunctionComponent;
  getRenderCount: () => number;
} {
  let count = 0;

  const Component: FunctionComponent = () => {
    count++;

    return <div data-testid={testId}>rendered: {count}</div>;
  };

  Component.displayName = `RenderCounter(${testId})`;

  return { Component, getRenderCount: () => count };
}

/**
 * Creates a component that tracks renders via ref.
 */
export function createStatefulCounter(testId: string): {
  Component: FunctionComponent;
  getRenderCount: () => number;
} {
  let renderCount = 0;

  const Component: FunctionComponent = () => {
    const countRef = useRef(0);

    countRef.current++;
    renderCount = countRef.current;

    return <div data-testid={testId}>count: {countRef.current}</div>;
  };

  Component.displayName = `StatefulCounter(${testId})`;

  return { Component, getRenderCount: () => renderCount };
}

/**
 * Navigates sequentially through a list of routes inside act().
 */
export async function navigateSequentially(
  router: Router,
  routes: { name: string; params?: Record<string, string> }[],
): Promise<void> {
  for (const { name, params } of routes) {
    await act(async () => {
      await router.navigate(name, params);
    });
  }
}

/**
 * Generates a round-robin route name list from available routes.
 */
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
