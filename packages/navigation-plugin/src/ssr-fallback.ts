import { createWarnOnce } from "./browser-env";

import type { NavigationBrowser } from "./types";

const NOOP = (): void => {};

export const createNavigationFallbackBrowser = (
  context: string,
): NavigationBrowser => {
  const warnOnce = createWarnOnce(context);

  return {
    getLocation: () => {
      warnOnce("getLocation");

      return "/";
    },
    getHash: () => {
      warnOnce("getHash");

      return "";
    },
    navigate: () => {
      warnOnce("navigate");
    },
    replaceState: () => {
      warnOnce("replaceState");
    },
    updateCurrentEntry: () => {
      warnOnce("updateCurrentEntry");
    },
    traverseTo: () => {
      warnOnce("traverseTo");
    },
    addNavigateListener: () => {
      warnOnce("addNavigateListener");

      return NOOP;
    },
    entries: () => {
      warnOnce("entries");

      return [];
    },
    currentEntry: null,
  };
};
