// packages/core/src/namespaces/EventBusNamespace/validators.ts

/**
 * Static validation functions for EventBusNamespace.
 * Called by Router facade before instance methods.
 */

import { validEventNames } from "../../constants";

import type { EventMethodMap } from "../../types";
import type { EventName, Plugin } from "@real-router/types";

/**
 * Validates event name is one of the known event names.
 */
export function validateEventName(eventName: unknown): void {
  if (!validEventNames.has(eventName as EventName)) {
    throw new Error(`Invalid event name: ${String(eventName)}`);
  }
}

/**
 * Validates addEventListener arguments (event name + callback).
 */
export function validateListenerArgs<E extends EventName>(
  eventName: E,
  cb: Plugin[EventMethodMap[E]],
): void {
  validateEventName(eventName);

  if (typeof cb !== "function") {
    throw new TypeError(
      `Expected callback to be a function for event ${eventName}`,
    );
  }
}
