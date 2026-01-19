// packages/real-router-plugin-browser/modules/browser.ts

import { isHistoryState } from "type-guards";

import { LOGGER_CONTEXT } from "./constants";
import { escapeRegExp } from "./utils";

import type { Browser, BrowserPluginOptions, HistoryState } from "./types";
import type { State } from "router6";

/** No-operation cleanup function for fallback browser */
const NOOP = (): void => {};

/**
 * Returns current base path from browser location
 */
const getBase = () => globalThis.location.pathname;

/**
 * Detects if browser supports popstate events on hash changes.
 * Old IE (Trident engine) doesn't fire popstate on hashchange.
 * Uses memoization based on userAgent for performance while remaining testable.
 */
const supportsPopStateOnHashChange = (() => {
  let cachedUserAgent: string | undefined;
  let cachedResult = false;

  return (): boolean => {
    // Note: This function is only called from real browser's addPopstateListener,
    // never from fallback browser (SSR), so window is guaranteed to exist
    const currentUserAgent = globalThis.navigator.userAgent;

    // Only recalculate if userAgent changed (or first call)
    if (currentUserAgent !== cachedUserAgent) {
      cachedUserAgent = currentUserAgent;
      cachedResult = !currentUserAgent.includes("Trident");
    }

    return cachedResult;
  };
})();

/**
 * Pushes new state to browser history
 */
const pushState = (state: State, title: string | null, path: string | URL) => {
  globalThis.history.pushState(state, title ?? "", path);
};

/**
 * Replaces current state in browser history
 */
const replaceState = (
  state: State,
  title: string | null,
  path: string | URL,
) => {
  globalThis.history.replaceState(state, title ?? "", path);
};

/**
 * Adds popstate/hashchange event listeners based on browser capabilities
 *
 * @param fn - Event handler function
 * @param opts - Browser plugin options
 * @returns Cleanup function to remove listeners
 */
const addPopstateListener: Browser["addPopstateListener"] = (fn, opts) => {
  const needsHashChangeListener =
    opts.useHash && !supportsPopStateOnHashChange();

  globalThis.addEventListener("popstate", fn as (evt: PopStateEvent) => void);

  if (needsHashChangeListener) {
    globalThis.addEventListener(
      "hashchange",
      fn as (evt: HashChangeEvent) => void,
    );
  }

  return () => {
    globalThis.removeEventListener(
      "popstate",
      fn as (evt: PopStateEvent) => void,
    );

    if (needsHashChangeListener) {
      globalThis.removeEventListener(
        "hashchange",
        fn as (evt: HashChangeEvent) => void,
      );
    }
  };
};

/**
 * Creates RegExp cache for getLocation optimization
 */
const createRegExpCache = () => {
  const cache = new Map<string, RegExp>();

  return (pattern: string): RegExp => {
    let regex = cache.get(pattern);

    if (!regex) {
      regex = new RegExp(pattern);
      cache.set(pattern, regex);
    }

    return regex;
  };
};

const getCachedRegExp = createRegExpCache();

/**
 * Gets current location path from browser, respecting plugin options
 *
 * @param opts - Browser plugin options
 * @returns Current path string
 */
const getLocation = (opts: BrowserPluginOptions) => {
  const { useHash, hashPrefix = "", base = "" } = opts;

  // Optimization: skip RegExp for empty values
  if (!hashPrefix && !base) {
    const rawPath = useHash
      ? globalThis.location.hash.slice(1)
      : globalThis.location.pathname;
    const safePath = safelyEncodePath(rawPath);

    return (safePath || "/") + globalThis.location.search;
  }

  const escapedHashPrefix = escapeRegExp(hashPrefix);
  const escapedBase = escapeRegExp(base);

  const rawPath = useHash
    ? globalThis.location.hash.replace(
        getCachedRegExp(`^#${escapedHashPrefix}`),
        "",
      )
    : globalThis.location.pathname.replace(
        getCachedRegExp(`^${escapedBase}`),
        "",
      );

  const safePath = safelyEncodePath(rawPath);

  return (safePath || "/") + globalThis.location.search;
};

/**
 * Safely encodes/decodes path to normalize URL encoding
 *
 * @param path - Path to normalize
 * @returns Normalized path or original on error
 */
const safelyEncodePath = (path: string): string => {
  try {
    return encodeURI(decodeURI(path));
  } catch (error) {
    console.warn(`[${LOGGER_CONTEXT}] Could not encode path "${path}"`, error);

    return path;
  }
};

/**
 * Gets current history state with validation.
 * Returns undefined instead of throwing for safer error handling.
 *
 * @returns Valid history state or undefined
 */
const getState = (): HistoryState | undefined => {
  if (!globalThis.history.state) {
    return undefined;
  }

  // Validate state structure instead of throwing
  if (!isHistoryState(globalThis.history.state)) {
    console.warn(
      `[${LOGGER_CONTEXT}] History state is not a valid state object, ignoring`,
      globalThis.history.state,
    );

    return undefined;
  }

  return globalThis.history.state as HistoryState;
};

/**
 * Gets current URL hash
 */
const getHash = () => globalThis.location.hash;

/**
 * Creates a fallback browser for non-browser environments (SSR).
 * Logs warning on first method call to help diagnose misconfiguration.
 *
 * @returns Browser API with no-op implementations
 */
function createFallbackBrowser(): Browser {
  let hasWarned = false;

  const warnOnce = (method: string) => {
    if (!hasWarned) {
      console.warn(
        `[${LOGGER_CONTEXT}] Browser plugin is running in a non-browser environment. ` +
          `Method "${method}" is a no-op. ` +
          `This is expected for SSR, but may indicate misconfiguration if you expected browser behavior.`,
      );
      hasWarned = true;
    }
  };

  return {
    getBase: () => {
      warnOnce("getBase");

      return "";
    },
    pushState: () => {
      warnOnce("pushState");
    },
    replaceState: () => {
      warnOnce("replaceState");
    },
    addPopstateListener: () => {
      warnOnce("addPopstateListener");

      return NOOP;
    },
    getLocation: () => {
      warnOnce("getLocation");

      return "";
    },
    getState: () => {
      warnOnce("getState");

      // eslint-disable-next-line unicorn/no-useless-undefined
      return undefined;
    },
    getHash: () => {
      warnOnce("getHash");

      return "";
    },
  };
}

/**
 * Creates browser API abstraction that works in both browser and SSR environments
 *
 * @returns Browser API object
 */
export function createSafeBrowser(): Browser {
  const isBrowser =
    typeof globalThis.window !== "undefined" && !!globalThis.history;

  return isBrowser
    ? {
        getBase,
        pushState,
        replaceState,
        addPopstateListener,
        getLocation,
        getState,
        getHash,
      }
    : createFallbackBrowser();
}
