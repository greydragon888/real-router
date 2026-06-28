// packages/logger-plugin/src/internal/performance-marks.ts

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
export interface PerformanceTracker {
  mark: (name: string) => void;
  measure: (measureName: string, startMark: string, endMark: string) => void;
  clearMarks: (name: string) => void;
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
     * Creates a performance measure between two marks, then clears the two
     * marks and the measure by name.
     *
     * The User Timing buffer is unbounded per spec, so leaving entries behind
     * accumulates thousands over a long dev session. Clearing happens in a
     * `finally` (so a failed measure still reclaims its input marks) and only
     * targets our own names — the app's marks/measures are never touched. The
     * trace events for an in-progress DevTools recording were already emitted
     * when the mark/measure was created, so clearing does not erase them from
     * the timeline. Logs a warning if the marks don't exist. (#795)
     */
    measure(measureName: string, startMark: string, endMark: string): void {
      if (!isSupported) {
        return;
      }

      try {
        performance.measure(measureName, startMark, endMark);
      } catch (error) {
        console.warn(
          `[${context}] Failed to create performance measure: ${measureName}`,
          error,
        );
      } finally {
        performance.clearMarks(startMark);
        performance.clearMarks(endMark);
        performance.clearMeasures(measureName);
      }
    },

    /**
     * Clears a single performance mark by name. Used for standalone marks that
     * are never an endpoint of a measure (e.g. `router:leave-approved:*`), so
     * `measure()`'s name-based cleanup cannot reclaim them. (#795)
     */
    clearMarks(name: string): void {
      if (!isSupported) {
        return;
      }

      performance.clearMarks(name);
    },
  };
};
