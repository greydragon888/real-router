import { logger } from "@real-router/logger";

import { LOGGER_CONTEXT } from "./constants";

import type { HistoryBrowser } from "./types";

const NOOP = (): void => {};

export const createWarnOnce = (context: string) => {
  let hasWarned = false;

  return (method: string): void => {
    if (!hasWarned) {
      logger.warn(
        LOGGER_CONTEXT,
        `Browser API is running in a non-browser environment (context: "${context}"). ` +
          `Method "${method}" is a no-op. ` +
          `This is expected for SSR, but may indicate misconfiguration if you expected browser behavior.`,
      );
      hasWarned = true;
    }
  };
};

export const createHistoryFallbackBrowser = (
  context: string,
): HistoryBrowser => {
  const warnOnce = createWarnOnce(context);

  return {
    pushState: () => {
      warnOnce("pushState");
    },
    replaceState: () => {
      warnOnce("replaceState");
    },
    addPopstateListener: () => {
      warnOnce("addPopstateListener");

      return NOOP;
    },
    getHash: () => {
      warnOnce("getHash");

      return "";
    },
  };
};
