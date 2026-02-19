// packages/core/src/eventValidation.ts

import { validEventNames } from "./constants";

import type { EventMethodMap } from "./types";
import type { EventName, Plugin } from "@real-router/types";

export function validateEventName(eventName: unknown): void {
  if (!validEventNames.has(eventName as EventName)) {
    throw new Error(`Invalid event name: ${String(eventName)}`);
  }
}

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

export function validateSubscribeListener(listener: unknown): void {
  if (typeof listener !== "function") {
    throw new TypeError(
      "[router.subscribe] Expected a function. " +
        "For Observable pattern use @real-router/rx package",
    );
  }
}
