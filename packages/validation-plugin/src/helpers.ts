// packages/validation-plugin/src/helpers.ts

import type { LimitsConfig } from "@real-router/core";

/**
 * Core's `DEFAULT_LIMITS`, mirrored — the plugin's ONE copy (#1879).
 *
 * ⚑ A copy on purpose: core keeps the table internal, and exporting it to remove
 * the duplication would make the numbers part of its published contract (owner
 * decision, #1879). What keeps the copy honest is
 * `limit-defaults-authority-1879.test.ts`, which reads what core actually
 * ENFORCES rather than what any source file says.
 *
 * ⚑ `Readonly<LimitsConfig>` is core's own interface, so a sixth limit added
 * there fails this object with TS2741 before a test runs — the same thing that
 * catches a limit `createLimits` forgets.
 */
export const CORE_LIMIT_DEFAULTS: Readonly<LimitsConfig> = Object.freeze({
  maxDependencies: 100,
  maxPlugins: 50,
  maxListeners: 10_000,
  warnListeners: 1000,
  maxLifecycleHandlers: 200,
});

export function computeThresholds(limit: number): {
  warn: number;
  error: number;
} {
  return {
    warn: Math.floor(limit * 0.2),
    error: Math.floor(limit * 0.5),
  };
}
