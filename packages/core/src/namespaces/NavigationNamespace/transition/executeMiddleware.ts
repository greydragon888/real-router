import { logger } from "@real-router/logger";

import type { MiddlewareFn, State } from "@real-router/types";

export const executeMiddleware = (
  middlewareFunctions: MiddlewareFn[],
  toState: Readonly<State>,
  fromState: Readonly<State> | undefined,
): void => {
  for (const middlewareFn of middlewareFunctions) {
    try {
      const result = middlewareFn(toState, fromState);

      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          logger.error("core:middleware", "Async middleware error:", error);
        });
      }
    } catch (error: unknown) {
      logger.error("core:middleware", "Middleware error:", error);
    }
  }
};
