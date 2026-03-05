// packages/browser-plugin/modules/browser.ts

import {
  isBrowserEnvironment,
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
  safelyEncodePath,
  createWarnOnce,
  createHistoryFallbackBrowser,
} from "browser-env";

import { createRegExpCache, extractPath } from "./url-utils";

import type { Browser, BrowserPluginOptions, URLParseOptions } from "./types";

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
 * Creates browser API abstraction that works in both browser and SSR environments
 *
 * @returns Browser API object
 */
export function createSafeBrowser(): Browser {
  if (isBrowserEnvironment()) {
    return {
      pushState,
      replaceState,
      addPopstateListener,
      getLocation,
      getHash,
    };
  }

  const warnOnce = createWarnOnce("browser-plugin");

  return {
    ...createHistoryFallbackBrowser("browser-plugin"),
    getLocation: () => {
      warnOnce("getLocation");

      return "";
    },
  };
}
