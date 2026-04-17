import { createRouter } from "@real-router/core";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { Router, Route, Unsubscribe } from "@real-router/core";

export const noop = (): void => undefined;

export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "user", path: "/users/:id" },
  { name: "settings", path: "/settings" },
  { name: "profile", path: "/profile" },
];

export interface StressRouter {
  router: Router;
  unsubscribe: Unsubscribe;
}

export function createStressRouter(options?: {
  maxHistoryLength?: number;
}): StressRouter {
  const router = createRouter(ROUTES, { defaultRoute: "home" });
  const unsubscribe = router.usePlugin(memoryPluginFactory(options));

  return { router, unsubscribe };
}

export function settle(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}
