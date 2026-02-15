// packages/core/src/namespaces/RouterLifecycleNamespace/constants.ts

import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

// =============================================================================
// Cached Errors (Performance Optimization)
// =============================================================================
// Pre-create error instances to avoid object allocation on hot paths.
// Error creation involves: new object, stack trace capture (~500ns-2μs).
// Cached errors skip this overhead entirely.
//
// Trade-off: All error instances share the same stack trace (points here).
// This is acceptable because:
// 1. These errors indicate user misconfiguration, not internal bugs
// 2. Error code and message are sufficient for debugging
// 3. Performance gain (~80% for error paths) outweighs stack trace loss
// =============================================================================

/**
 * Cached error for start() called when router is already started/starting.
 */
export const CACHED_ALREADY_STARTED_ERROR = new RouterError(
  errorCodes.ROUTER_ALREADY_STARTED,
);
