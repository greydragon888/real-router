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

import { extractPath } from "./url-utils";

import type { Browser } from "./types";

export function createSafeBrowser(base: string): Browser {
  if (isBrowserEnvironment()) {
    const getLocation = () => {
      const rawPath = extractPath(globalThis.location.pathname, base);

      return safelyEncodePath(rawPath) + globalThis.location.search;
    };

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
