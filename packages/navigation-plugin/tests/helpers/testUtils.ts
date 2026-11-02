import {
  createNavigationBrowser,
  PLUGIN_SYNC_INFO,
} from "../../src/navigation-browser";

import type { MockNavigation } from "./mockNavigation";
import type { NavigationBrowser } from "../../src/types";
import type { State } from "@real-router/core";

export const noop = (): void => undefined;

export const routerConfig = [
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

/**
 * `routerConfig` with a query channel declared on `users.list` (#1586).
 *
 * Kept beside the default rather than folded into it: every query-less test in
 * the package leans on `routerConfig` printing bare paths, and the whole reason
 * the dropped-query bugs shipped silently is that no fixture in this package
 * declared a `?` name. A separate fixture makes the channel explicit at the
 * call site instead of implicit in a shared default.
 */
export const queryRouterConfig = [
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "list", path: "/list?tab&sort" },
    ],
  },
  { name: "home", path: "/home" },
  { name: "index", path: "/" },
];

export function createMockNavigationBrowser(
  mock: MockNavigation,
): NavigationBrowser {
  const browser: Omit<NavigationBrowser, "currentEntry"> = {
    getLocation: () => {
      const url = new URL(mock.currentUrl);

      return url.pathname + url.search;
    },
    getHash: () => {
      const url = new URL(mock.currentUrl);

      return url.hash;
    },
    navigate: (
      url: string,
      options: { state: unknown; history: "push" | "replace" },
    ) => {
      mock.navigate(url, {
        state: options.state,
        history: options.history,
        info: PLUGIN_SYNC_INFO,
      });
    },
    replaceState: (state: unknown, url: string) => {
      mock.navigate(url, {
        state,
        history: "replace",
        info: PLUGIN_SYNC_INFO,
      });
    },
    updateCurrentEntry: (options: { state: unknown }) => {
      const entry = mock.currentEntry;

      if (entry) {
        entry._setState(options.state);
      }
    },
    traverseTo: (key: string) => {
      mock.traverseTo(key, { info: PLUGIN_SYNC_INFO });
    },
    addNavigateListener: (fn: (evt: NavigateEvent) => void) => {
      mock.addEventListener("navigate", fn);

      return () => {
        mock.removeEventListener("navigate", fn);
      };
    },
    entries: () => mock.entries(),
    getActivationType: () => mock.activation?.navigationType,
  };

  return Object.defineProperty(browser, "currentEntry", {
    get: () => mock.currentEntry,
    enumerable: true,
  }) as NavigationBrowser;
}

/**
 * The plugin's own `NavigationBrowser` over `mock`, where
 * `createMockNavigationBrowser` is a stand-in for it. It reads
 * `globalThis.navigation` once, when created; `getLocation` and `getHash` read
 * the document's location, so a router over it starts from an explicit path.
 */
export function createNavigationBrowserOver(
  mock: MockNavigation,
): NavigationBrowser {
  const scope = globalThis as unknown as Record<string, unknown>;

  scope.navigation = mock;

  const browser = createNavigationBrowser("");

  delete scope.navigation;

  return browser;
}

export const withoutMeta = (
  state: State,
): {
  name: string;
  params: Record<string, unknown>;
  path: string;
} => ({
  name: state.name,
  params: state.params,
  path: state.path,
});
