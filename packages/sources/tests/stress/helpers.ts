import { createRouter } from "@real-router/core";

import type { Router, Route } from "@real-router/core";

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

export function createStressRouter(): Router {
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "view", path: "/:id" },
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
    {
      name: "a",
      path: "/a",
      children: [
        {
          name: "b",
          path: "/b",
          children: [
            {
              name: "c",
              path: "/c",
              children: [
                {
                  name: "d",
                  path: "/d",
                  children: [
                    {
                      name: "e",
                      path: "/e",
                      children: [{ name: "f", path: "/f" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  return createRouter(routes, { defaultRoute: "home" });
}

export function createManySources<T>(factory: () => T, count: number): T[] {
  return Array.from({ length: count }, () => factory());
}
