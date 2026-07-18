// packages/validation-plugin/src/validators/eventBus.ts

import { computeThresholds } from "../helpers";

import type { Plugin, RouterLogger } from "@real-router/core";

const DEFAULT_MAX_LISTENERS = 10_000;

// Local types — mirrors EventName and EventMethodMap from @real-router/types
// (@real-router/types is not a direct dependency of this package)
export interface EventMethodMap {
  $start: "onStart";
  $stop: "onStop";
  $$start: "onTransitionStart";
  $$leaveApprove: "onTransitionLeaveApprove";
  $$cancel: "onTransitionCancel";
  $$success: "onTransitionSuccess";
  $$error: "onTransitionError";
}

export type EventName = keyof EventMethodMap;

// Single source of truth (plugin-owned): core has no `validEventNames` constant
// and does not enforce event-name validity — this set is the sole owner.
const validEventNames = new Set<EventName>([
  "$start",
  "$stop",
  "$$start",
  "$$leaveApprove",
  "$$cancel",
  "$$success",
  "$$error",
]);

export function validateEventName(eventName: unknown): void {
  if (!validEventNames.has(eventName as EventName)) {
    throw new TypeError(
      `[router.addEventListener] Invalid event name: ${String(eventName)}. Must be one of: $start, $stop, $$start, $$leaveApprove, $$cancel, $$success, $$error`,
    );
  }
}

export function validateListenerArgs<E extends EventName>(
  eventName: E,
  cb: Plugin[EventMethodMap[E]],
): void {
  validateEventName(eventName);

  if (typeof cb !== "function") {
    throw new TypeError(
      `[router.addEventListener] callback must be a function, got ${typeof cb}`,
    );
  }
}

/**
 * Proactive warn@20% / error@50% threshold for the per-event listener counter
 * (#1188) — the fourth resource counter, mirroring plugins / lifecycle /
 * dependencies. Fired by core from `subscribe` / `addEventListener` with the
 * POST-add count. Core keeps the emitter's bare-`Error` hard cap; this only
 * surfaces an actionable, `[router.<method>]`-prefixed signal well before it, so
 * a listener leak (e.g. a missing unsubscribe — #766) is caught early instead of
 * OOM-ing at the 10 000-listener wall. `maxListeners === 0` means unlimited.
 */
export function validateListenerCountThresholds(
  count: number,
  eventName: string,
  methodName: string,
  maxListeners: number = DEFAULT_MAX_LISTENERS,
  logger: RouterLogger,
): void {
  if (maxListeners === 0) {
    return;
  }

  const { warn, error } = computeThresholds(maxListeners);

  if (count >= error) {
    logger.error(
      `router.${methodName}`,
      `${count} listeners registered for "${eventName}"! This is excessive. Hard limit at ${maxListeners}.`,
    );
  } else if (count >= warn) {
    logger.warn(
      `router.${methodName}`,
      `${count} listeners registered for "${eventName}". Consider whether all are necessary — a growing count usually means a missing unsubscribe.`,
    );
  }
}
