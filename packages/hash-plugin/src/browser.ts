// packages/hash-plugin/src/browser.ts

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

import { extractHashPath } from "./hash-utils";

import type { RegExpCache } from "./hash-utils";
import type { Browser } from "./types";

/**
 * Creates browser API abstraction that works in both browser and SSR environments.
 * Hash-specific: getLocation extracts path from URL hash.
 *
 * @param hashPrefix - Hash prefix (e.g., "!")
 * @param regExpCache - RegExp cache for compiled patterns
 * @returns Browser API object
 */
export function createSafeBrowser(
  hashPrefix: string,
  regExpCache: RegExpCache,
): Browser {
  if (isBrowserEnvironment()) {
    const getLocation = () => {
      const rawPath = extractHashPath(
        globalThis.location.hash,
        hashPrefix,
        regExpCache,
      );

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

  const warnOnce = createWarnOnce("hash-plugin");

  return {
    ...createHistoryFallbackBrowser("hash-plugin"),
    getLocation: () => {
      warnOnce("getLocation");

      return "";
    },
  };
}
