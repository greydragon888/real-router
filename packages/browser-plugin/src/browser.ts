// packages/browser-plugin/modules/browser.ts

import { logger } from "@real-router/logger";

import { LOGGER_CONTEXT } from "./constants";
import { createRegExpCache, extractPath } from "./url-utils";

import type { Browser, BrowserPluginOptions, URLParseOptions } from "./types";
import type { State } from "@real-router/core";

/** No-operation cleanup function for fallback browser */
const NOOP = (): void => {};

const pushState = (state: State, path: string) => {
  globalThis.history.pushState(state, "", path);
};

const replaceState = (state: State, path: string) => {
  globalThis.history.replaceState(state, "", path);
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
        getHash,
      }
    : createFallbackBrowser();
}
