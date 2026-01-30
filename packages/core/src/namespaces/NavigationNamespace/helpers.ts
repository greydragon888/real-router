import { logger } from "@real-router/logger";

import type { RouterError } from "../../RouterError";
import type { DoneFn, State } from "@real-router/types";

export const noop = (): void => {};

/**
 * Safely invokes a callback, catching and logging any errors.
 * Prevents user callback errors from crashing the router.
 */
export function safeCallback(
  callback: DoneFn,
  ...args: [error?: RouterError, state?: State]
): void {
  try {
    callback(...args);
  } catch (error) {
    logger.error("router.navigate", "Error in navigation callback:", error);
  }
}
