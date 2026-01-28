import { logger } from "logger";

import type { State, RouterError as RouterErrorType } from "@real-router/types";

/**
 * Strict callback type where state is always provided.
 * Used internally in transition chain where state is guaranteed.
 *
 * @internal
 */
export type StrictDoneFn = (
  error: RouterErrorType | undefined,
  state: State,
) => void;

/**
 * Safely invokes a callback, catching and logging any errors.
 *
 * @internal
 */
export function safeCallback(
  callback: StrictDoneFn,
  error: RouterErrorType | undefined,
  state: State,
  logTag: string,
): void {
  try {
    callback(error, state);
  } catch (error_) {
    logger.error(logTag, "Error in callback:", error_);
  }
}
