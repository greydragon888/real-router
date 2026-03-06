import { createSafeBrowser, safelyEncodePath } from "browser-env";

import { createRegExpCache, extractHashPath } from "../../src/hash-utils";

import type { Browser } from "browser-env";

export type OnStateChangeFn = (state: unknown) => void;

export function createMockedBrowser(
  onStateChange: OnStateChangeFn = () => {},
  hashPrefix = "",
): Browser {
  const regExpCache = createRegExpCache();
  const safeBrowser = createSafeBrowser(
    () =>
      safelyEncodePath(
        extractHashPath(globalThis.location.hash, hashPrefix, regExpCache),
      ) + globalThis.location.search,
    "hash-plugin",
  );

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
