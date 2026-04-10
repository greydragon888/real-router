import { isBrowserEnvironment } from "./detect.js";
import {
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
} from "./history-api.js";
import {
  createWarnOnce,
  createHistoryFallbackBrowser,
} from "./ssr-fallback.js";

import type { Browser } from "./types.js";

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
