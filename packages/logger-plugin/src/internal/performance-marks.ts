// packages/logger-plugin/modules/internal/performance-marks.ts

import { logger } from "logger";

/**
 * Checks if Performance API is supported in the current environment.
 */
export const supportsPerformanceAPI = (): boolean => {
  return (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function"
  );
};

/**
 * Performance tracker interface with mark and measure methods.
 */
interface PerformanceTracker {
  mark: (name: string) => void;
  measure: (measureName: string, startMark: string, endMark: string) => void;
}

/**
 * Creates a tracker for working with the Performance API.
 * Ignores calls if the API is unavailable.
 *
 * @param enabled - Whether the functionality is enabled (from config)
 * @param context - Context for error logging
 * @returns Object with mark and measure methods
 */
export const createPerformanceTracker = (
  enabled: boolean,
  context: string,
): PerformanceTracker => {
  const isSupported = enabled && supportsPerformanceAPI();

  return {
    /**
     * Creates a performance mark with the specified name.
     */
    mark(name: string): void {
      if (!isSupported) {
        return;
      }

      performance.mark(name);
    },

    /**
     * Creates a performance measure between two marks.
     * Logs a warning if the marks don't exist.
     */
    measure(measureName: string, startMark: string, endMark: string): void {
      if (!isSupported) {
        return;
      }

      try {
        performance.measure(measureName, startMark, endMark);
      } catch (error) {
        logger.warn(
          context,
          `Failed to create performance measure: ${measureName}`,
          error,
        );
      }
    },
  };
};
