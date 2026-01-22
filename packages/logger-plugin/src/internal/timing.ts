// packages/logger-plugin/modules/internal/timing.ts

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
 * Initialize time provider based on environment.
 * Uses performance.now() in modern environments (Node.js 16+, all browsers),
 * falls back to monotonic Date.now() wrapper for edge cases.
 */
const nowFn: TimeProvider =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? (): number => performance.now()
    : createMonotonicDateNow();

/**
 * Returns high-resolution monotonic timestamp.
 *
 * Uses performance.now() in modern environments (Node.js 16+, all browsers).
 * Falls back to monotonic Date.now() wrapper (~1ms precision) for edge cases.
 *
 * @returns Timestamp in milliseconds
 */
export const now = (): number => nowFn();
