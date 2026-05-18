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

/**
 * Audit 2026-05-16 §7.3: a silent `forceGC()` is worse than no GC at all — if
 * `--expose-gc` is missing from `execArgv` (vitest.config.stress.mts) every
 * `takeHeapSnapshot()` then measures uncollected debris and the heap-delta
 * thresholds pass for the wrong reason. Warn LOUDLY on the first call so a
 * misconfigured run shows up immediately in stress output.
 */
// eslint-disable-next-line vitest/require-hook -- module-level flag intentionally lives outside any hook; it gates a one-time console.warn across the whole stress run, not per-test
let warnedAboutMissingGC = false;

export function forceGC(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();

    return;
  }

  if (!warnedAboutMissingGC) {
    warnedAboutMissingGC = true;

    console.warn(
      "[stress] forceGC() is a no-op — globalThis.gc is undefined. " +
        "Heap-delta thresholds will measure uncollected garbage. " +
        "Run with `--expose-gc` (vitest.config.stress.mts → execArgv).",
    );
  }
}

/**
 * Use in `beforeAll` of stress tests whose passing/failing decision depends on
 * `process.memoryUsage().heapUsed` deltas. Throws if `globalThis.gc` is missing
 * — converts the silent-no-op into an explicit configuration error.
 */
export function assertGcExposed(): void {
  if (typeof globalThis.gc !== "function") {
    throw new TypeError(
      "[stress] This test relies on heap measurements and requires " +
        "`--expose-gc`. Add it to execArgv in vitest.config.stress.mts.",
    );
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
