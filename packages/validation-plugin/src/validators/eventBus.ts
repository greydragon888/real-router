// packages/validation-plugin/src/validators/eventBus.ts

import type { Plugin } from "@real-router/core";

// Local types — mirrors EventName and EventMethodMap from @real-router/types
// (@real-router/types is not a direct dependency of this package)
type EventMethodMap = {
  $start: "onStart";
  $stop: "onStop";
  $$start: "onTransitionStart";
  $$cancel: "onTransitionCancel";
  $$success: "onTransitionSuccess";
  $$error: "onTransitionError";
};

type EventName = keyof EventMethodMap;

// Local set — mirrors validEventNames from @real-router/core/constants
// (not exported from @real-router/core public API)
const validEventNames = new Set<EventName>([
  "$start",
  "$stop",
  "$$start",
  "$$cancel",
  "$$success",
  "$$error",
]);

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
