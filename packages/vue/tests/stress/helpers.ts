import { createRouter } from "@real-router/core";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";

import { RouterProvider } from "../../src/RouterProvider";

import type { Route, Router } from "@real-router/core";
import type { Component, VNode } from "vue";

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
 * Mounts a component tree inside RouterProvider.
 */
export function mountWithProvider(
  router: Router,
  content: () => VNode | VNode[],
) {
  return mount(
    defineComponent({
      setup: () => () => h(RouterProvider, { router }, { default: content }),
    }),
  );
}

/**
 * Navigates sequentially through a list of routes, flushing Vue updates after each.
 */
export async function navigateSequentially(
  router: Router,
  routes: { name: string; params?: Record<string, string> }[],
): Promise<void> {
  for (const { name, params } of routes) {
    await router.navigate(name, params);
    await nextTick();
    await flushPromises();
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

/**
 * Creates a render-counting wrapper component.
 * Returns the component and a function to read the count.
 */
export function createRenderCounter(testId: string): {
  Component: Component;
  getRenderCount: () => number;
} {
  let count = 0;

  const Component = defineComponent({
    name: `RenderCounter-${testId}`,
    setup() {
      return () => {
        count++;

        return h("div", { "data-testid": testId }, `rendered: ${count}`);
      };
    },
  });

  return { Component, getRenderCount: () => count };
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
