import { createSafeBrowser } from "../../src/browser-env";
import { buildHashLocation, createHashPrefixRegex } from "../../src/hash-utils";

import type { Browser } from "../../src/browser-env";

export type OnStateChangeFn = (state: unknown) => void;

export function createMockedBrowser(
  onStateChange: OnStateChangeFn = () => {},
  hashPrefix = "",
): Browser {
  const prefixRegex = createHashPrefixRegex(hashPrefix);
  const safeBrowser = createSafeBrowser(
    () =>
      buildHashLocation(
        globalThis.location.hash,
        globalThis.location.search,
        prefixRegex,
      ),
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
