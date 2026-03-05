import { createSafeBrowser } from "../../src/browser";
import { createRegExpCache } from "../../src/hash-utils";

import type { Browser } from "../../src/types";

export type OnStateChangeFn = (state: unknown) => void;

export function createMockedBrowser(
  onStateChange: OnStateChangeFn = () => {},
  hashPrefix = "",
): Browser {
  const regExpCache = createRegExpCache();
  const safeBrowser = createSafeBrowser(hashPrefix, regExpCache);

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
