// packages/router6-plugin-logger/modules/internal/formatting.ts

import type { State } from "@real-router/core";

/**
 * Formats route name for logging output.
 * Handles undefined/null.
 */
export const formatRouteName = (state?: State): string => {
  return state?.name ?? "(none)";
};

/**
 * Formats execution time information.
 * Uses adaptive units:
 * - Microseconds (μs) for <0.1ms
 * - Milliseconds (ms) for ≥0.1ms
 *
 * @param startTime - Start time or null
 * @param now - Function to get current time
 * @returns String with time or empty string
 */
export const formatTiming = (
  startTime: number | null,
  now: () => number,
): string => {
  if (startTime === null) {
    return "";
  }

  const durationMs = now() - startTime;

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return " (?)";
  }

  if (durationMs < 0.1) {
    const durationMks = (durationMs * 1000).toFixed(2);

    return ` (${durationMks}μs)`;
  } else {
    const duration = durationMs.toFixed(2);

    return ` (${duration}ms)`;
  }
};

/**
 * Creates a label for Performance API from route names.
 */
export const createTransitionLabel = (
  fromRoute: string,
  toRoute: string,
): string => {
  return `${fromRoute}→${toRoute}`;
};
