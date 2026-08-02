// packages/core/src/namespaces/NavigationNamespace/transition/errorHandling.ts

import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { State } from "../../../types";
import type { NavigationDependencies } from "../types";

/**
 * Is this thrown value already the router's quiet-cancel outcome?
 *
 * Asked by {@link handleGuardError} (a guard signalling a quiet cancel by
 * throwing the RouterError directly, #933) and by {@link asCancellation}, which
 * must not re-wrap one.
 */
function isTransitionCancelled(error: unknown): boolean {
  return (
    error instanceof RouterError &&
    error.code === errorCodes.TRANSITION_CANCELLED
  );
}

/**
 * Restate a failure as the cancellation it actually was (#1609).
 *
 * Called by both failure arcs for a navigation that has LOST liveness — and
 * every way to lose it (superseded, aborted, the router stopped, the FSM already
 * out of the transition band) is a cancellation, one the navigation has already
 * emitted `TRANSITION_CANCEL` to announce. Whatever verdict its guard or
 * listener reached in the meantime is about a navigation nobody is waiting for:
 * carrying it let a `FAIL` land in the FSM under a navigation that was still
 * running, because {@link routeTransitionError} filters by error CODE and
 * `CANNOT_ACTIVATE` is not `TRANSITION_CANCELLED` — and it left the caller's
 * promise contradicting the event stream for the same navigation.
 *
 * The liveness question itself stays at the call sites: the two arcs answer it
 * from different facts (see `finishAsyncNavigation` and `handleNavigateError`).
 *
 * A value that ALREADY carries the code is returned untouched, so #1197's
 * canonicalized leave rejection keeps its `reason` (#943) and the cancellation
 * the resolve path throws is not wrapped in a second one.
 *
 * ⚠ Interim form, and only PARTLY absorbed — the halves have different fates,
 * which is why this says more than "see RFC-10a". Once `FAIL` carries an epoch:
 *
 * - the **load-bearing** half goes by construction: `when: mayFail` on the
 *   `TRANSITION_STARTED` / `LEAVE_APPROVED` edges is already in the RFC-10a §7.3
 *   sketch, so a `FAIL` with a foreign epoch becomes a table no-op and the
 *   silent commit (state committed, no `TRANSITION_SUCCESS`, no subscriber
 *   notified) stops being expressible. That covers BOTH arcs — the table does
 *   not care which one sent it;
 * - the **noise** half does not, yet: the `READY` edge is unconditional in that
 *   same sketch, so a stale `FAIL` arriving after somebody else's
 *   `TRANSITION_SUCCESS` is still stopped by an operational check and not by the
 *   table. Whether to put `mayFail` there (or drop the edge outright) is the
 *   OPEN question RFC-10a §16.5.
 *
 * So: delete this when §7.3 lands **and** §16.5 is answered — not on §7.3 alone.
 * Plan `.claude/fsm-as-state-owner-2026-07-31.md` §10, phase 0 item 0.2.
 */
export function asCancellation(error: unknown): unknown {
  return isTransitionCancelled(error)
    ? error
    : new RouterError(errorCodes.TRANSITION_CANCELLED, { reason: error });
}

export function routeTransitionError(
  deps: NavigationDependencies,
  error: unknown,
  toState: State,
  fromState: State | undefined,
  epoch: number,
): void {
  const routerError = error as RouterError;

  if (
    routerError.code === errorCodes.TRANSITION_CANCELLED ||
    routerError.code === errorCodes.ROUTE_NOT_FOUND
  ) {
    return;
  }

  deps.sendTransitionFail(toState, fromState, routerError, epoch);
}

export function handleGuardError(
  error: unknown,
  errorCode: string,
  segment: string,
): never {
  if (error instanceof DOMException && error.name === "AbortError") {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  // A guard can also signal a quiet cancel by throwing
  // RouterError(TRANSITION_CANCELLED) directly — the same intent as a thrown
  // AbortError. Preserve it as-is instead of letting rethrowAsRouterError
  // overwrite the code with CANNOT_ACTIVATE / CANNOT_DEACTIVATE: that code
  // drives the downstream suppression (routeTransitionError early-returns,
  // fire-and-forget stays silent), so re-coding would surface the intended
  // quiet cancel as a reported transition error (#933).
  if (isTransitionCancelled(error)) {
    throw error;
  }

  rethrowAsRouterError(error, errorCode, segment);
}

/**
 * Error metadata structure for transition errors.
 * Contains information extracted from caught exceptions.
 */
export interface SyncErrorMetadata {
  [key: string]: unknown;
  message?: string;
  stack?: string | undefined;
  cause?: unknown;
  segment?: string;
}

/**
 * Re-throws a caught error as a RouterError with the given error code.
 * If the error is already a RouterError, re-codes a COPY of it — never the
 * caught instance itself. Otherwise wraps it with wrapSyncError metadata.
 *
 * Never mutate an error this function does not own (#1606): the three cached
 * rejection errors are module-level singletons, and a guard that merely awaits
 * a navigation rejecting with one of them propagates it here — `setCode` on the
 * caught instance would rewrite that singleton's code for every later consumer
 * in the process (SSR: across requests). The copy is built with the original
 * code and re-coded via its own `setCode`, so the message keeps the exact
 * setCode semantics (a standard-code message follows the new code, a custom one
 * is preserved); `toJSON()` carries `segment` / `path` / custom fields over.
 * The allocation is fine here: this is the guard-refusal path, whose common
 * arm (a guard returning `false`) already allocates a fresh RouterError.
 */
export function rethrowAsRouterError(
  error: unknown,
  errorCode: string,
  segment: string,
): never {
  if (error instanceof RouterError) {
    const { code, message, ...meta } = error.toJSON();

    const copy = new RouterError(code as string, {
      ...meta,
      message: message as string,
    });

    copy.setCode(errorCode);
    copy.stack = error.stack ?? "";

    throw copy;
  }

  throw new RouterError(errorCode, wrapSyncError(error, segment));
}

// Own-enumerable keys that must never be copied from a thrown object onto the
// RouterError metadata:
// - `code` / `segment` / `path` are reserved — the RouterError constructor
//   throws a TypeError on them (#39).
// - `then` would make the RouterError itself thenable, so a consumer that
//   awaits it (or passes it through Promise.resolve / returns it from an async
//   function) would have it assimilated as a Promise instead of treated as a
//   plain rejection reason (#947).
const reservedRouterErrorProps = new Set(["code", "segment", "path", "then"]);

/**
 * Wraps a synchronously thrown value into structured error metadata.
 *
 * This helper extracts useful debugging information from various thrown values:
 * - Error instances: extracts message, stack, and cause (ES2022+)
 * - Plain objects: spreads properties into metadata
 * - Primitives (string, number, etc.): returns minimal metadata
 *
 * @param thrown - The value caught in a try-catch block
 * @param segment - Route segment name (for lifecycle hooks)
 * @returns Structured error metadata for RouterError
 */
export function wrapSyncError(
  thrown: unknown,
  segment: string,
): SyncErrorMetadata {
  const base: SyncErrorMetadata = { segment };

  // Handle Error instances - extract all useful properties
  if (thrown instanceof Error) {
    return {
      ...base,
      message: thrown.message,
      stack: thrown.stack,
      // Error.cause requires ES2022+ - safely access if present
      ...("cause" in thrown &&
        thrown.cause !== undefined && { cause: thrown.cause }),
    };
  }

  // Handle plain objects - spread properties into metadata, filtering reserved props
  if (thrown && typeof thrown === "object") {
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(thrown)) {
      // Skip reserved / hazardous keys: #39 (constructor TypeError on code/
      // segment/path) and #947 (`then` would make the error thenable).
      if (!reservedRouterErrorProps.has(key)) {
        filtered[key] = value;
      }
    }

    return { ...base, ...filtered };
  }

  // Primitives (string, number, boolean, null, undefined, symbol, bigint)
  // Return base metadata only - the primitive value isn't useful as metadata
  return base;
}

/**
 * Settle a guard's Promise into the pipeline's terms: `false` and a rejection
 * both become the phase's `RouterError`, nothing else escapes.
 *
 * Lives here rather than with the interpreter because that IS this module's
 * concern — turning a guard's refusal into the right error (#1607). The
 * interpreter only decides WHERE it stopped.
 */
export async function resolveAsyncGuard(
  promise: Promise<boolean>,
  errorCode: string,
  segment: string,
): Promise<void> {
  let result: boolean;

  try {
    result = await promise;
  } catch (error: unknown) {
    handleGuardError(error, errorCode, segment);

    return; // unreachable — handleGuardError returns never
  }

  if (!result) {
    throw new RouterError(errorCode, { segment });
  }
}
