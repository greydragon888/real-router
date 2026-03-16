// packages/core/src/namespaces/NavigationNamespace/constants.ts

import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

import type { State } from "@real-router/types";

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
CACHED_NOT_STARTED_REJECTION.catch(() => {});
CACHED_ROUTE_NOT_FOUND_REJECTION.catch(() => {});
CACHED_SAME_STATES_REJECTION.catch(() => {});
