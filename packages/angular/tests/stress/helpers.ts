import { Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";

import { provideRealRouter } from "../../src/providers";

import type { Type } from "@angular/core";
import type { ComponentFixture } from "@angular/core/testing";
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

/**
 * Configures TestBed with provideRealRouter and creates a component fixture.
 */
export function createFixtureWithRouter<T>(
  component: Type<T>,
  router: Router,
): ComponentFixture<T> {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [provideRealRouter(router)],
  });

  return TestBed.createComponent(component);
}

/**
 * Runs a callback within the TestBed injector's injection context.
 */
export function runInTestBedContext(fn: () => void): void {
  const injector = TestBed.inject(Injector);

  runInInjectionContext(injector, fn);
}

/**
 * Navigates sequentially through a list of routes.
 * Skips entries that match the current route (would cause SAME_STATES error).
 */
export async function navigateSequentially(
  router: Router,
  routes: { name: string; params?: Record<string, string> }[],
): Promise<void> {
  for (const { name, params } of routes) {
    if (router.getState()?.name === name) {
      continue;
    }

    await router.navigate(name, params);
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
