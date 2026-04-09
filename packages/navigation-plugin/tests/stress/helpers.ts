import { createRouter } from "@real-router/core";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";
import type { Router, Unsubscribe } from "@real-router/core";

export const noop = (): void => undefined;

export const routeConfig = [
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "list", path: "/list" },
    ],
  },
  { name: "home", path: "/home" },
  { name: "index", path: "/" },
];

export interface StressRouterResult {
  router: Router;
  mockNav: MockNavigation;
  browser: NavigationBrowser;
  unsubscribe: Unsubscribe;
}

export function createStressRouter(options?: {
  forceDeactivate?: boolean;
  base?: string;
  allowNotFound?: boolean;
  defaultRoute?: string;
}): StressRouterResult {
  const mockNav = new MockNavigation("http://localhost/");
  const browser = createMockNavigationBrowser(mockNav);

  const router = createRouter(routeConfig, {
    defaultRoute: options?.defaultRoute ?? "home",
    allowNotFound: options?.allowNotFound ?? true,
  });

  const unsubscribe = router.usePlugin(
    navigationPluginFactory(
      {
        forceDeactivate: options?.forceDeactivate ?? true,
        base: options?.base ?? "",
      },
      browser,
    ),
  );

  return { router, mockNav, browser, unsubscribe };
}

export async function waitForTransitions(ms = 50): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
