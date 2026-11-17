// packages/validation-plugin/src/validators/eventBus.ts

import { computeThresholds, CORE_LIMIT_DEFAULTS } from "../helpers";

import type { RouterLogger } from "@real-router/core";

/**
 * Proactive warn@20% / error@50% threshold for the per-event listener counter
 * (#1188) — the fourth resource counter, mirroring plugins / lifecycle /
 * dependencies. Fired by core from `subscribe` / `addEventListener`, and from
 * `usePlugin` for a plugin's hooks, with the POST-add count. Core keeps the
 * emitter's bare-`Error` hard cap; this only surfaces an actionable,
 * `[router.<method>]`-prefixed signal well before it, so a listener leak (e.g. a
 * missing unsubscribe — #766) is caught early instead of OOM-ing at the
 * 10 000-listener wall. `maxListeners === 0` means unlimited.
 */
export function validateListenerCountThresholds(
  count: number,
  eventName: string,
  methodName: string,
  // logger precedes the defaulted maxListeners — defaults must come last
  // (S1788; logger was appended when the per-router RouterLogger replaced the
  // former global singleton, #724).
  logger: RouterLogger,
  maxListeners: number = CORE_LIMIT_DEFAULTS.maxListeners,
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
