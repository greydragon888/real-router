import { createRouter } from "@real-router/core";

import type { Options, Route, Router } from "@real-router/core";

/** Requires `--expose-gc` flag (set in vitest.config.stress.mts pool options). */
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

export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? "-" : "";

  if (abs < 1024) {
    return `${sign}${abs} B`;
  }
  if (abs < 1024 * 1024) {
    return `${sign}${(abs / 1024).toFixed(1)} KB`;
  }

  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}

export const MB = 1024 * 1024;

export function createStressRouter(
  routeCount = 10,
  options?: Partial<Options>,
): Router {
  const routes = createFlatRoutes(routeCount);

  return createRouter(routes, { defaultRoute: "route0", ...options });
}

export function createFlatRoutes(count: number): Route[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `route${i}`,
    path: `/route${i}`,
  }));
}

export function createParamRoutes(count: number): Route[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `routeP${i}`,
    path: `/routeP${i}/:id`,
  }));
}

/**
 * depth=3, breadth=2 produces:
 *   level0_0 -> level0_0.level1_0 -> level0_0.level1_0.level2_0
 *                                  -> level0_0.level1_0.level2_1
 *            -> level0_0.level1_1 -> ...
 */
export function createDeepRouteTree(depth: number, breadth: number): Route[] {
  function buildLevel(currentDepth: number, prefix: string): Route[] {
    return Array.from({ length: breadth }, (_, i) => {
      const name = `${prefix}level${currentDepth}_${i}`;
      const route: Route = {
        name: prefix ? `level${currentDepth}_${i}` : name,
        path: `/level${currentDepth}_${i}`,
      };

      if (currentDepth < depth - 1) {
        route.children = buildLevel(currentDepth + 1, `${name}.`);
      }

      return route;
    });
  }

  return buildLevel(0, "");
}

export function measureTime<T>(fn: () => T): {
  result: T;
  durationMs: number;
} {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;

  return { result, durationMs };
}

export async function measureTimeAsync<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;

  return { result, durationMs };
}

export const noopPluginFactory = (): Record<string, never> => ({});

export const fullPluginFactory = (): {
  onStart: () => void;
  onStop: () => void;
  onTransitionStart: () => void;
  onTransitionSuccess: () => void;
  onTransitionError: () => void;
  onTransitionCancel: () => void;
  teardown: () => void;
} => ({
  onStart() {
    /* noop */
  },
  onStop() {
    /* noop */
  },
  onTransitionStart() {
    /* noop */
  },
  onTransitionSuccess() {
    /* noop */
  },
  onTransitionError() {
    /* noop */
  },
  onTransitionCancel() {
    /* noop */
  },
  teardown() {
    /* noop */
  },
});
