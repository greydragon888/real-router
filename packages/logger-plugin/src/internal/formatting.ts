// packages/logger-plugin/modules/internal/formatting.ts

import type { State } from "@real-router/core";

/**
 * Formats route name for logging output.
 * Handles undefined/null.
 */
export const formatRouteName = (state?: State): string => {
  return state?.name ?? "(none)";
};
