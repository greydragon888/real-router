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
// #1606's backstop, applied to the fifth cached error — the one its sweep could
// not see, because that sweep was scoped to `NavigationNamespace/constants.ts`
// and this instance lives here. Same reasoning verbatim: it is handed to
// arbitrary consumer code process-wide (every `.catch()` on `start()`), so an
// in-place write rewrites the error every OTHER consumer sees, across routers
// and — under SSR — across requests (#1960).
Object.freeze(CACHED_ALREADY_STARTED_ERROR);
