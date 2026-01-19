// packages/real-router-plugin-logger/modules/internal/timing.ts

/**
 * Function that returns high-resolution timestamp in milliseconds.
 */
type TimeProvider = () => number;

/**
 * State for Date.now() monotonic emulation
 */
let lastTimestamp = 0;
let timeOffset = 0;

/**
 * Creates monotonic Date.now() wrapper that ensures time never goes backwards.
 *
 * @returns Time provider function with monotonic guarantee
 */
function createMonotonicDateNow(): TimeProvider {
  // eslint-disable-next-line unicorn/consistent-function-scoping -- closure over module-level lastTimestamp/timeOffset
  return (): number => {
    const current: number = Date.now();

    if (current < lastTimestamp) {
      timeOffset += lastTimestamp - current;
    }

    lastTimestamp = current;

    return current + timeOffset;
  };
}

/**
 * Type guard to check if error is an unexpected module loading error.
 * Returns false for expected "module not found" errors.
 *
 * @param err - Unknown error object
 * @returns True if error is unexpected and should be logged
 */
export function isUnexpectedModuleError(
  err: unknown,
): err is NodeJS.ErrnoException {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string" &&
    (err as { code: string }).code !== "ERR_MODULE_NOT_FOUND" &&
    (err as { code: string }).code !== "MODULE_NOT_FOUND"
  );
}

/**
 * Logs warning for unexpected module loading errors.
 * Separated for testability.
 *
 * @param error - The error from module loading
 */
export function warnUnexpectedModuleError(error: unknown): void {
  if (isUnexpectedModuleError(error)) {
    console.warn(
      "[timing] Unexpected error loading perf_hooks, using Date.now() fallback:",
      error,
    );
  }
}

/**
 * Initialize time provider based on environment
 */
let nowFn: TimeProvider;

nowFn = createMonotonicDateNow();

if (
  typeof performance !== "undefined" &&
  typeof performance.now === "function"
) {
  // Browser or modern Node.js with global performance
  nowFn = (): number => performance.now();
} else {
  // Node.js without global performance - try perf_hooks
  /* eslint-disable promise/always-return */
  void import("node:perf_hooks")
    .then(({ performance: perfHooks }): void => {
      nowFn = (): number => perfHooks.now();
    })
    .catch(warnUnexpectedModuleError);
  /* eslint-enable promise/always-return */
}

/**
 * Returns high-resolution monotonic timestamp.
 *
 * - Browser: performance.now() (~0.001ms precision)
 * - Node.js 16+: performance.now() from perf_hooks (~0.001ms precision)
 * - Node.js <16: Date.now() with monotonic emulation (~1ms precision)
 *
 * @returns Timestamp in milliseconds
 */
export const now = (): number => nowFn();
