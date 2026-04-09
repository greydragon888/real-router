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
      });
    },
    replaceState: (state: unknown, url: string) => {
      mock.navigate(url, { state, history: "replace" });
    },
    updateCurrentEntry: (options: { state: unknown }) => {
      const entry = mock.currentEntry;

      if (entry) {
        entry._setState(options.state);
      }
    },
    traverseTo: (key: string) => {
      mock.traverseTo(key);
    },
    addNavigateListener: (fn: (evt: NavigateEvent) => void) => {
      mock.addEventListener("navigate", fn);

      return () => {
        mock.removeEventListener("navigate", fn);
      };
    },
    entries: () => mock.entries(),
  };

  return Object.defineProperty(browser, "currentEntry", {
    get: () => mock.currentEntry,
    enumerable: true,
  }) as NavigationBrowser;
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
