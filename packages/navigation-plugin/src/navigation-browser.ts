import { safelyEncodePath, extractPath } from "./browser-env";

import type { NavigationBrowser } from "./types";

/**
 * Mutable cell carrying the "syncing-from-router" flag shared between
 * `wrapNavigationBrowserWithSyncing` (which raises it around every router-driven
 * mutation) and the plugin's navigate handler (which reads it to short-circuit
 * the event fired by the plugin's own write).
 *
 * Internal to navigation-plugin — not part of the public type surface.
 */
export interface SyncingFlag {
  current: boolean;
}

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

    getActivationType: () => nav.activation?.navigationType,
  };
}

/**
 * Wraps every router-driven mutation of a NavigationBrowser with the syncing
 * flag — raised before the underlying call, lowered after, including the
 * throw path. The plugin's navigate handler reads `syncing.current` to
 * short-circuit the navigate event fired by the plugin's own write
 * (`nav.navigate(...)` and `nav.navigate({history:"replace"})` both fire
 * navigate events synchronously).
 *
 * Applied at the factory level to both the built-in `createNavigationBrowser`
 * and any user-supplied browser, so consumers don't need to manage the flag.
 */
export function wrapNavigationBrowserWithSyncing(
  browser: NavigationBrowser,
  syncing: SyncingFlag,
): NavigationBrowser {
  const wrap = <T>(fn: () => T): T => {
    syncing.current = true;
    try {
      return fn();
    } finally {
      syncing.current = false;
    }
  };

  return {
    getLocation: () => browser.getLocation(),
    getHash: () => browser.getHash(),

    navigate: (url, options) => {
      wrap(() => {
        browser.navigate(url, options);
      });
    },
    replaceState: (state, url) => {
      wrap(() => {
        browser.replaceState(state, url);
      });
    },
    updateCurrentEntry: (options) => {
      wrap(() => {
        browser.updateCurrentEntry(options);
      });
    },
    traverseTo: (key) => {
      wrap(() => {
        browser.traverseTo(key);
      });
    },

    addNavigateListener: (fn) => browser.addNavigateListener(fn),
    entries: () => browser.entries(),

    get currentEntry() {
      return browser.currentEntry;
    },

    getActivationType: () => browser.getActivationType(),
  };
}
