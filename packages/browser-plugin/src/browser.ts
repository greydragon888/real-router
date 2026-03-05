// packages/browser-plugin/modules/browser.ts

import { logger } from "@real-router/logger";
import { isHistoryState } from "type-guards";

import { LOGGER_CONTEXT } from "./constants";
import { createRegExpCache, extractPath } from "./url-utils";

import type {
  Browser,
  BrowserPluginOptions,
  HistoryState,
  URLParseOptions,
} from "./types";
import type { State } from "@real-router/core";

/** No-operation cleanup function for fallback browser */
const NOOP = (): void => {};

/**
 * Pushes new state to browser history
 */
const pushState = (state: State, title: string | null, path: string | URL) => {
  /* v8 ignore next -- @preserve: title is always "" from updateBrowserState, null branch is defensive */
  const passedTitle = title ?? "";

  globalThis.history.pushState(state, passedTitle, path);
};

/**
 * Replaces current state in browser history
 */
const replaceState = (
  state: State,
  title: string | null,
  path: string | URL,
) => {
  /* v8 ignore next -- @preserve: title is always "" from updateBrowserState, null branch is defensive */
  const passedTitle = title ?? "";

  globalThis.history.replaceState(state, passedTitle, path);
};

const addPopstateListener: Browser["addPopstateListener"] = (fn) => {
  globalThis.addEventListener("popstate", fn);

  return () => {
    globalThis.removeEventListener("popstate", fn);
  };
};

const regExpCache = createRegExpCache();

const getLocation = (opts: BrowserPluginOptions) => {
  const rawPath = extractPath(
    globalThis.location.pathname,
    globalThis.location.hash,
    opts as URLParseOptions,
    regExpCache,
  );

  return safelyEncodePath(rawPath) + globalThis.location.search;
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
    logger.warn(LOGGER_CONTEXT, `Could not encode path "${path}"`, error);

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
    logger.warn(
      LOGGER_CONTEXT,
      "History state is not a valid state object, ignoring",
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
      logger.warn(
        LOGGER_CONTEXT,
        `Browser plugin is running in a non-browser environment. ` +
          `Method "${method}" is a no-op. ` +
          `This is expected for SSR, but may indicate misconfiguration if you expected browser behavior.`,
      );
      hasWarned = true;
    }
  };

  return {
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
        pushState,
        replaceState,
        addPopstateListener,
        getLocation,
        getState,
        getHash,
      }
    : createFallbackBrowser();
}
