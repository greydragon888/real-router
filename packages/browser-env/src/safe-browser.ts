import { isBrowserEnvironment } from "./detect";
import {
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
} from "./history-api";
import { createWarnOnce, createHistoryFallbackBrowser } from "./ssr-fallback";

import type { Browser } from "./types";

export function createSafeBrowser(
  getLocation: () => string,
  context: string,
): Browser {
  if (isBrowserEnvironment()) {
    return {
      pushState,
      replaceState,
      addPopstateListener,
      getLocation,
      getHash,
    };
  }

  const warnOnce = createWarnOnce(context);

  return {
    ...createHistoryFallbackBrowser(context),
    getLocation: () => {
      warnOnce("getLocation");

      return "";
    },
  };
}
