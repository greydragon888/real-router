import { createRouter } from "@real-router/core";

import { hashPluginFactory } from "@real-router/hash-plugin";

import {
  createSafeBrowser,
  safelyEncodePath,
} from "../../src/browser-env/index.js";
import { createHashPrefixRegex, extractHashPath } from "../../src/hash-utils";

import type { Browser } from "../../src/browser-env/index.js";
import type { Router, State, Unsubscribe } from "@real-router/core";

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
  browser: Browser;
  dispatchPopstate: (state: Record<string, unknown> | null) => void;
  unsubscribe: Unsubscribe;
}

export function createStressRouter(options?: {
  forceDeactivate?: boolean;
  base?: string;
  allowNotFound?: boolean;
  defaultRoute?: string;
  hashPrefix?: string;
}): StressRouterResult {
  const hashPrefix = options?.hashPrefix ?? "";
  const prefixRegex = createHashPrefixRegex(hashPrefix);

  const safeBrowser = createSafeBrowser(
    () =>
      safelyEncodePath(extractHashPath(globalThis.location.hash, prefixRegex)) +
      globalThis.location.search,
    "hash-plugin",
  );

  const browser: Browser = {
    ...safeBrowser,
    pushState: (state: State, url: string) => {
      safeBrowser.pushState(state, url);
    },
    replaceState: (state: State, url: string) => {
      safeBrowser.replaceState(state, url);
    },
  };

  const router = createRouter(routeConfig, {
    defaultRoute: options?.defaultRoute ?? "home",
    allowNotFound: options?.allowNotFound ?? true,
  });

  const unsubscribe = router.usePlugin(
    hashPluginFactory(
      {
        forceDeactivate: options?.forceDeactivate ?? true,
        base: options?.base ?? "",
        hashPrefix,
      },
      browser,
    ),
  );

  const dispatchPopstate = (state: Record<string, unknown> | null): void => {
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state }));
  };

  return { router, browser, dispatchPopstate, unsubscribe };
}

export function makePopstateState(
  name: string,
  params: Record<string, string>,
  path: string,
): Record<string, unknown> {
  return { name, params, path };
}

export async function waitForTransitions(ms = 50): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function roundRobinStates(
  count: number,
  states: { name: string; params: Record<string, string>; path: string }[],
): (Record<string, unknown> | null)[] {
  return Array.from<Record<string, unknown> | null>({ length: count }).map(
    (_, i) => {
      const s = states[i % states.length];

      return makePopstateState(s.name, s.params, s.path);
    },
  );
}
