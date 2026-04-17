import {
  createSafeBrowser,
  safelyEncodePath,
} from "../../src/browser-env/index.js";
import { createHashPrefixRegex, extractHashPath } from "../../src/hash-utils";

import type { Browser } from "../../src/browser-env/index.js";

export type OnStateChangeFn = (state: unknown) => void;

export function createMockedBrowser(
  onStateChange: OnStateChangeFn = () => {},
  hashPrefix = "",
): Browser {
  const prefixRegex = createHashPrefixRegex(hashPrefix);
  const safeBrowser = createSafeBrowser(() => {
    const hashPath = safelyEncodePath(
      extractHashPath(globalThis.location.hash, prefixRegex),
    );

    return hashPath.includes("?")
      ? hashPath
      : hashPath + globalThis.location.search;
  }, "hash-plugin");

  return {
    ...safeBrowser,
    pushState: (state, url) => {
      onStateChange(state);
      safeBrowser.pushState(state, url);
    },
    replaceState: (state, url) => {
      onStateChange(state);
      safeBrowser.replaceState(state, url);
    },
  };
}
