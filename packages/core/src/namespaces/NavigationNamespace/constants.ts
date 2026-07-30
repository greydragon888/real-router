// packages/core/src/namespaces/NavigationNamespace/constants.ts

import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

import type { State } from "../../types";

// =============================================================================
// Cached Errors & Rejected Promises (Performance Optimization)
// =============================================================================
// Pre-create error instances and rejected promises for sync error paths
// in navigate(). Eliminates per-call allocations:
//   - new RouterError() — object + stack trace capture (~500ns-2μs)
//   - Promise.reject()  — promise allocation
//   - .catch(handler)   — derived promise from suppression
//
// Trade-off: All error instances share the same stack trace (points here).
// This is acceptable because:
// 1. These errors indicate expected conditions, not internal bugs
// 2. Error code and message are sufficient for debugging
// 3. The facade skips .catch() suppression for cached promises (zero alloc)
// =============================================================================

export const CACHED_NOT_STARTED_ERROR = new RouterError(
  errorCodes.ROUTER_NOT_STARTED,
);

export const CACHED_ROUTE_NOT_FOUND_ERROR = new RouterError(
  errorCodes.ROUTE_NOT_FOUND,
);

export const CACHED_SAME_STATES_ERROR = new RouterError(errorCodes.SAME_STATES);

// Pre-suppressed rejected promises — .catch() at module load prevents
// unhandled rejection warnings. The facade skips additional .catch() calls
// via the lastSyncRejected flag (zero derived-promise allocation).
export const CACHED_NOT_STARTED_REJECTION: Promise<State> = Promise.reject(
  CACHED_NOT_STARTED_ERROR,
);

export const CACHED_ROUTE_NOT_FOUND_REJECTION: Promise<State> = Promise.reject(
  CACHED_ROUTE_NOT_FOUND_ERROR,
);

export const CACHED_SAME_STATES_REJECTION: Promise<State> = Promise.reject(
  CACHED_SAME_STATES_ERROR,
);

// Suppress once at module load — prevents unhandled rejection events.
// Subsequent .catch() / await by user code still works correctly:
// a rejected promise stays rejected forever, each .catch() creates
// its own derived promise and fires its handler.
CACHED_NOT_STARTED_REJECTION.catch(() => {}); // NOSONAR -- intentional suppression, not a promise chain
CACHED_ROUTE_NOT_FOUND_REJECTION.catch(() => {}); // NOSONAR
CACHED_SAME_STATES_REJECTION.catch(() => {}); // NOSONAR

// =============================================================================
// Fire-and-forget suppression policy (#721) — shared, not per-caller
// =============================================================================

/**
 * Rejection codes that are EXPECTED navigation outcomes owned by the caller,
 * not internal bugs. The fire-and-forget safety net stays silent for them and
 * lets an awaiting caller see the rejection. `CANNOT_ACTIVATE` /
 * `CANNOT_DEACTIVATE` belong here: a guard blocking (or a plugin's guard-blocked
 * `back()`/`forward()`) is a normal result, so a call without `await` must not
 * emit a spurious "Unexpected navigation error".
 *
 * Lives here rather than moving into the namespace with navigate-suppression,
 * because it is genuinely SHARED: `Router.start()` classifies its own failures
 * by the same policy (`#onSuppressedStartError`), and start commits through
 * `navigateToState`, so its rejections are navigation rejections. One owner, two
 * readers — duplicating the classifier is the copy this refactor exists to
 * remove.
 */
export const SUPPRESSED_ERROR_CODES: ReadonlySet<string> = new Set([
  errorCodes.SAME_STATES,
  errorCodes.TRANSITION_CANCELLED,
  errorCodes.ROUTER_NOT_STARTED,
  errorCodes.ROUTE_NOT_FOUND,
  errorCodes.CANNOT_ACTIVATE,
  errorCodes.CANNOT_DEACTIVATE,
]);

/** Module-level, so classifying allocates nothing per navigate()/start(). */
export function isExpectedRejection(error: unknown): boolean {
  return error instanceof RouterError && SUPPRESSED_ERROR_CODES.has(error.code);
}

/**
 * The three cached rejections ABOVE, by identity.
 *
 * They already carry a `.catch()` from module load, so they can never raise an
 * `unhandledRejection` — a second `.catch()` on them prevents nothing and only
 * allocates a derived promise (measured: ~40 ns, which is ~12.5% of a
 * SAME_STATES `navigate()`). This set is what lets the producer skip that work
 * without a mutable cross-layer flag.
 *
 * Identity, not a flag, because the two fail in OPPOSITE directions: a missed
 * identity costs 40 ns and nothing else, while a flag left stale-true skips
 * suppression on a LATER navigation and leaks the rejection — #721 exactly. The
 * mechanism is therefore fail-safe by construction: anything not recognised here
 * gets suppressed.
 */
export const PRE_SUPPRESSED: ReadonlySet<unknown> = new Set([
  CACHED_NOT_STARTED_REJECTION,
  CACHED_ROUTE_NOT_FOUND_REJECTION,
  CACHED_SAME_STATES_REJECTION,
]);
