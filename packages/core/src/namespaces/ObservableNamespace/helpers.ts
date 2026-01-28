// packages/core/src/namespaces/ObservableNamespace/helpers.ts

import { logger } from "@real-router/logger";

import type { EventMethodMap } from "./types";
import type { EventName, Plugin } from "@real-router/types";

/**
 * Invoke all listeners for a given event.
 */
export function invokeFor<E extends EventName>(
  eventName: E,
  set: Set<Plugin[EventMethodMap[E]]>,
  ...args: Parameters<NonNullable<Plugin[EventMethodMap[E]]>>
): void {
  if (set.size === 0) {
    return;
  }

  // Clone the listeners array so that removals/additions
  // during iteration won't affect this loop.
  const listeners = [...set];

  for (const cb of listeners) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Function.prototype.apply requires Function type
      Function.prototype.apply.call(cb as Function, undefined, args);
    } catch (error) {
      logger.error("Router", `Error in listener for ${eventName}:`, error);
    }
  }
}
