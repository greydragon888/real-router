// packages/core/src/namespaces/NavigationNamespace/transition/errorHandling.ts

import { errorCodes, UNSAFE_KEY } from "../../../constants";
import { isNavigationEnd } from "../../../navigationEnds";
import { RouterError, freezeThrownError } from "../../../RouterError";
import { putField } from "../../../utils/ingest";

import type { State } from "../../../types";
import type { NavigationDependencies } from "../types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;

/**
 * Is this thrown value already the router's quiet-cancel outcome?
 *
 * Asked by {@link handleGuardError} (a guard signalling a quiet cancel by
 * throwing the RouterError directly, #933), by {@link asCancellation}, which
 * must not re-wrap one, and by {@link routeTransitionError}, which sends one
 * through `CANCEL` (#2787).
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
 * Both failure arcs call it for a navigation that has LOST liveness, and every
 * way to lose it is a cancellation the navigation already announced. Carrying
 * the guard's verdict instead put a `FAIL` in the FSM under a navigation still
 * running, because {@link routeTransitionError} sends `FAIL` for anything that
 * is not a cancellation. Liveness
 * itself is asked at the call sites, from different facts
 * (`finishAsyncNavigation` off the signal, `handleNavigateError` off the
 * plan's `cancelReason`).
 *
 * A value already carrying the code is returned untouched — two pinned cells:
 * #1197's leave rejection keeps its `reason` (#943), and the resolve path's
 * cancellation is not wrapped twice.
 *
 * ⚠ The table does not make this redundant. `STARTING --FAIL--> IDLE` is how a
 * failed `start()` unwinds — unconditional, so a stale `FAIL` there kills a
 * RESTART — and which error `navigate()` rejects with is a contract, not an
 * edge. Measured: neutralising this reds the torn-down cells of
 * `superseded-guard-rejection-1609.test.ts`, the redirect cells of
 * `redirect-then-refuse-2788.test.ts` and the `dispose()` cell of
 * `commit-gate-1169.test.ts`, among others.
 */
export function asCancellation(error: unknown): unknown {
  return isTransitionCancelled(error)
    ? error
    : freezeThrownError(
        new RouterError(errorCodes.TRANSITION_CANCELLED, { reason: error }),
      );
}

/**
 * Hand a failed navigation to the machine: `CANCEL` for a cancellation, `FAIL`
 * for anything else (#2787) — each only while the machine still carries it.
 *
 * ⚑ The `CANCEL` arm is how a cancel raised by APPLICATION code leaves the band —
 * a guard's quiet cancel, a leave listener throwing or rejecting with it — so the
 * navigation gets `TRANSITION_CANCEL`, as it does from a newer navigation,
 * `stop()` or its own signal. `cancelIfInFlight` asks the identity itself.
 * Another navigation's end is not such a cancel: {@link handleGuardError} and
 * {@link leaveFailure} re-code it before it reaches here.
 *
 * ⚠ The `FAIL` arm asks only for the band: the band's `FAIL` edges ask the
 * identity (`mayFail`), and `STARTING`'s, which unwinds a failed `start()`, asks
 * nothing. Outside the band the machine has already moved past the navigation,
 * and a restart begun in between — from inside `completeTransition`'s own
 * `FAIL(ROUTE_NOT_FOUND)`, for one — must not receive its `FAIL`.
 */
export function routeTransitionError(
  deps: NavigationDependencies,
  error: unknown,
  fromState: State | undefined,
  nav: object,
): void {
  if (isTransitionCancelled(error)) {
    deps.cancelIfInFlight(nav, error);
  } else if (deps.isTransitioning()) {
    deps.sendTransitionFail(fromState, error, nav);
  }
}

export function handleGuardError(
  error: unknown,
  errorCode: string,
  segment: string,
): never {
  // ⚑ A navigation's END is never this guard's quiet cancel. Another
  // navigation's end means the guard was waiting on work that navigation
  // started; its own navigation's end means that navigation is cancelled, and
  // the failure arcs restate the failure as that cancellation.
  if (isNavigationEnd(error)) {
    rethrowAsRouterError(error, errorCode, segment);
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    throw freezeThrownError(new RouterError(errorCodes.TRANSITION_CANCELLED));
  }

  // A guard can also signal a quiet cancel by throwing
  // RouterError(TRANSITION_CANCELLED) directly — the same intent as a thrown
  // AbortError. Preserve it as-is instead of letting rethrowAsRouterError
  // overwrite the code with CANNOT_ACTIVATE / CANNOT_DEACTIVATE: that code
  // routes it downstream (routeTransitionError sends CANCEL rather than FAIL,
  // fire-and-forget stays silent), so re-coding would surface the intended
  // quiet cancel as a reported transition error (#933).
  if (isTransitionCancelled(error)) {
    throw error;
  }

  rethrowAsRouterError(error, errorCode, segment);
}

/**
 * A `subscribeLeave` listener's failure, as its navigation receives it.
 *
 * ⚑ A navigation's END is never this listener's quiet cancel, and it is
 * re-coded `CANNOT_DEACTIVATE` on a copy, as {@link handleGuardError} re-codes
 * it for a guard (#2786). Another navigation's end means the listener was
 * waiting on work that navigation started; its own navigation's end means that
 * navigation is cancelled, and the failure arcs restate the failure as that
 * cancellation. Every other value passes unchanged, a quiet cancel the listener
 * raised included (#2787).
 */
export function leaveFailure(error: unknown): unknown {
  // An END is a `RouterError`: only `freezeThrownError` records one.
  return isNavigationEnd(error)
    ? recodedCopy(error as RouterError, errorCodes.CANNOT_DEACTIVATE)
    : error;
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
    throw recodedCopy(error, errorCode);
  }

  throw freezeThrownError(
    new RouterError(errorCode, wrapSyncError(error, segment)),
  );
}

/** The frozen copy of `error` carrying `errorCode` — never `error` itself. */
function recodedCopy(error: RouterError, errorCode: string): RouterError {
  const { code, message, ...meta } = error.toJSON();

  const copy = new RouterError(code as string, {
    ...meta,
    message: message as string,
  });

  copy.setCode(errorCode);
  copy.stack = error.stack ?? "";

  return freezeThrownError(copy);
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
    // ⚑ ONE read per slot (#2085). `thrown` is whatever application code threw,
    // so each of these is a call into it — and the conditional below needs its
    // answer twice, for the test and for the value.
    //
    // ⚠ All three are hoisted, not just the one the conditional needs, and the
    // reason is ORDER rather than counting: reading `cause` above the literal
    // moves the caller's getters out of the sequence a plain literal gives them.
    // The order is what an instrumented Error observes, so it is part of the
    // door's behaviour and is pinned with the counts.
    const message = thrown.message;
    const stack = thrown.stack;
    // Error.cause requires ES2022+ - safely access if present
    const cause = "cause" in thrown ? thrown.cause : undefined;

    return {
      ...base,
      message,
      stack,
      ...(cause !== undefined && { cause }),
    };
  }

  // Handle plain objects - spread properties into metadata, filtering reserved props
  if (thrown && typeof thrown === "object") {
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of objectEntries(thrown)) {
      // Skip reserved / hazardous keys: #39 (constructor TypeError on code/
      // segment/path) and #947 (`then` would make the error thenable).
      // ⚑ `UNSAFE_KEY` skipped, the same decision the state channels take and for
      // the same reason (#1852). A `RouterError` is a CONTAINER core builds and
      // hands out: it reaches the `navigate()` rejection, every plugin's
      // `onTransitionError`, and `JSON.stringify` through `toJSON`. Measured with
      // the key carried, a guard throwing a plain object put `"__proto__"` into
      // the serialized error — so an error log shipped to a server became a
      // prototype-swap primitive after `JSON.parse` there.
      if (key !== UNSAFE_KEY && !reservedRouterErrorProps.has(key)) {
        // ⚑ `putField` (#1852): every key here is chosen by the application
        // code that THREW this object, so the name is entirely outside core's
        // control. Measured with an ambient accessor under one of them, the
        // navigation rejected with a `TypeError` from this line — a diagnostic
        // becoming the thing that fails — and with a setter the field's value
        // was replaced by the accessor's in the reported metadata.
        putField(filtered, key, value);
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
    throw freezeThrownError(new RouterError(errorCode, { segment }));
  }
}
