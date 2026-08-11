// packages/core/src/namespaces/NavigationNamespace/constants.ts

import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

import type { State } from "../../types";

// =============================================================================
// Cached Errors & Rejected Promises (Performance Optimization)
// =============================================================================
// Pre-created error instances and rejected promises for the sync error paths in
// navigate(), which eliminates a `new RouterError()` (object + stack capture,
// ~500ns-2μs), a `Promise.reject()` and a suppression `.catch()` per call.
//
// Trade-off: every instance shares one stack trace, pointing here. Acceptable
// because these are expected conditions rather than internal bugs, and code +
// message identify them.
// =============================================================================

export const CACHED_NOT_STARTED_ERROR = new RouterError(
  errorCodes.ROUTER_NOT_STARTED,
);

export const CACHED_ROUTE_NOT_FOUND_ERROR = new RouterError(
  errorCodes.ROUTE_NOT_FOUND,
);

export const CACHED_SAME_STATES_ERROR = new RouterError(errorCodes.SAME_STATES);

/**
 * The boot window's sentence. Same code as `CACHED_NOT_STARTED_ERROR` — this IS
 * the not-started window — with a message that names it, because the bare code
 * reads as "you forgot to call start()" while the caller is INSIDE `start()`.
 *
 * The REFUSAL is the table's (`canNavigate()` is false in STARTING,
 * `SYSTEM_COMMIT` is undeclared there); only the message is chosen here, at the
 * refusal site, by `deps.isStarting()` — an ordinary never-started router keeps
 * the plain error (#1647).
 */
export const CACHED_PRE_BOOT_COMMIT_ERROR = new RouterError(
  errorCodes.ROUTER_NOT_STARTED,
  {
    message:
      "[router] cannot commit before the start navigation does — the boot would overwrite it; defer with queueMicrotask/await, or navigate after start() resolves",
  },
);

// #1606 backstop: these instances are handed to arbitrary consumer code (every
// `.catch()`, `onTransitionError`, leave-signal `reason`) process-wide, so an
// in-place write — core's own `setCode` was one — rewrites the error every
// OTHER consumer sees, across routers (SSR: across requests). Freezing turns
// that corruption into a strict-mode TypeError at the writer (sloppy-mode
// writes become silent no-ops); reading, including `stack`, is unaffected.
Object.freeze(CACHED_NOT_STARTED_ERROR);
Object.freeze(CACHED_ROUTE_NOT_FOUND_ERROR);
Object.freeze(CACHED_SAME_STATES_ERROR);
Object.freeze(CACHED_PRE_BOOT_COMMIT_ERROR);

// Pre-suppressed rejected promises — see `PRE_SUPPRESSED` at the bottom for
// what their identity buys the producer.
export const CACHED_NOT_STARTED_REJECTION: Promise<State> = Promise.reject(
  CACHED_NOT_STARTED_ERROR,
);

export const CACHED_ROUTE_NOT_FOUND_REJECTION: Promise<State> = Promise.reject(
  CACHED_ROUTE_NOT_FOUND_ERROR,
);

export const CACHED_SAME_STATES_REJECTION: Promise<State> = Promise.reject(
  CACHED_SAME_STATES_ERROR,
);

export const CACHED_PRE_BOOT_COMMIT_REJECTION: Promise<State> = Promise.reject(
  CACHED_PRE_BOOT_COMMIT_ERROR,
);

// Suppress once at module load — prevents unhandled rejection events.
// Subsequent .catch() / await by user code still works correctly:
// a rejected promise stays rejected forever, each .catch() creates
// its own derived promise and fires its handler.
CACHED_NOT_STARTED_REJECTION.catch(() => {}); // NOSONAR -- intentional suppression, not a promise chain
CACHED_ROUTE_NOT_FOUND_REJECTION.catch(() => {}); // NOSONAR
CACHED_SAME_STATES_REJECTION.catch(() => {}); // NOSONAR
CACHED_PRE_BOOT_COMMIT_REJECTION.catch(() => {}); // NOSONAR

// =============================================================================
// Fire-and-forget suppression policy (#721) — shared, not per-caller
// =============================================================================

/**
 * Rejection codes that are EXPECTED, caller-owned outcomes, not internal bugs.
 * The fire-and-forget safety net stays silent for them and lets an awaiting
 * caller see the rejection. `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE` belong here:
 * a guard blocking (or a plugin's guard-blocked `back()`/`forward()`) is a
 * normal result, so a call without `await` must not emit a spurious "Unexpected
 * navigation error".
 *
 * Most of them are navigation outcomes, but not all — `ROUTER_ALREADY_STARTED`
 * is a LIFECYCLE precondition (#1605), and it is the same kind of thing:
 * `start()` called twice says "already done", exactly as `SAME_STATES` does for
 * `navigate()`. Silence is the symmetric answer; logging it would report a
 * caller's own no-op as an internal fault. It costs nothing on the navigation
 * side — `navigate()` cannot produce that code.
 *
 * SHARED, which is why it is here and not in the namespace: `Router.start()`
 * classifies its own failures by the same policy (`#onSuppressedStartError`).
 */
export const SUPPRESSED_ERROR_CODES: ReadonlySet<string> = new Set([
  errorCodes.SAME_STATES,
  errorCodes.TRANSITION_CANCELLED,
  errorCodes.ROUTER_NOT_STARTED,
  errorCodes.ROUTE_NOT_FOUND,
  errorCodes.CANNOT_ACTIVATE,
  errorCodes.CANNOT_DEACTIVATE,
  errorCodes.ROUTER_ALREADY_STARTED,
]);

/** Module-level, so classifying allocates nothing per navigate()/start(). */
export function isExpectedRejection(error: unknown): boolean {
  return error instanceof RouterError && SUPPRESSED_ERROR_CODES.has(error.code);
}

/**
 * The four cached rejections ABOVE, by identity.
 *
 * They carry a `.catch()` from module load already, so a second one prevents
 * nothing and only allocates a derived promise (measured: ~40 ns, ~12.5% of a
 * SAME_STATES `navigate()`); this set lets the producer skip it.
 *
 * Identity, not a flag, because the two fail in OPPOSITE directions: a missed
 * identity costs 40 ns, while a flag left stale-true skips suppression on a
 * LATER navigation and leaks the rejection — #721 exactly. Fail-safe by
 * construction: anything not recognised here gets suppressed.
 */
export const PRE_SUPPRESSED: ReadonlySet<unknown> = new Set([
  CACHED_NOT_STARTED_REJECTION,
  CACHED_ROUTE_NOT_FOUND_REJECTION,
  CACHED_SAME_STATES_REJECTION,
  CACHED_PRE_BOOT_COMMIT_REJECTION,
]);
