import { safelyEncodePath, extractPath } from "./browser-env";

import type { NavigationBrowser } from "./types";

/**
 * Creates a NavigationBrowser wrapping the real Navigation API.
 * Only call this when `"navigation" in globalThis` is true.
 */
export function createNavigationBrowser(base: string): NavigationBrowser {
  const nav = globalThis.navigation;

  return {
    getLocation: () =>
      safelyEncodePath(extractPath(globalThis.location.pathname, base)) +
      globalThis.location.search,

    getHash: () => globalThis.location.hash,

    navigate: (url, options) => {
      nav.navigate(url, options);
    },

    replaceState: (state, url) => {
      nav.navigate(url, {
        state,
        history: "replace",
      });
    },

    updateCurrentEntry: (options) => {
      nav.updateCurrentEntry(options);
    },

    traverseTo: (key) => {
      nav.traverseTo(key);
    },

    addNavigateListener: (fn) => {
      nav.addEventListener("navigate", fn);

      return () => {
        nav.removeEventListener("navigate", fn);
      };
    },

    entries: () => nav.entries(),

    get currentEntry() {
      return nav.currentEntry;
    },
  };
}
