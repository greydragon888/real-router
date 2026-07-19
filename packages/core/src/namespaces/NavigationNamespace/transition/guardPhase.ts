import { handleGuardError } from "./errorHandling";
import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { GuardFn, State } from "../../../types";

async function resolveAsyncGuard(
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

async function resolveRemainingGuards( // NOSONAR -- params kept flat to avoid object allocation on hot path
  guards: Map<string, GuardFn>,
  segments: string[],
  errorCode: string,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isActive: () => boolean,
  startIndex: number,
  firstResult: Promise<boolean>,
  firstSegment: string,
): Promise<void> {
  await resolveAsyncGuard(firstResult, errorCode, firstSegment);

  for (let i = startIndex; i < segments.length; i++) {
    // Stryker disable next-line BlockStatement: equivalent — emptying the body drops the async-tail cancellation throw, but supersession is independently enforced by the navigationId/isCurrentNav checks in NavigationNamespace, so the navigation still rejects with TRANSITION_CANCELLED (full suite green). The ConditionalExpression sibling stays live (its →true variant always-cancels and is killed by async-guard tests).
    if (!isActive()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    const segment = segments[i];
    const guardFn = guards.get(segment);

    if (!guardFn) {
      continue;
    }

    // Stryker disable next-line BooleanLiteral: equivalent — guardResult is unconditionally reassigned by guardFn() on the next line, or the catch calls handleGuardError() (returns never), so the init value is never read.
    let guardResult: boolean | Promise<boolean> = false;

    try {
      guardResult = guardFn(toState, fromState, signal);
    } catch (error: unknown) {
      handleGuardError(error, errorCode, segment);
    }

    if (guardResult instanceof Promise) {
      await resolveAsyncGuard(guardResult, errorCode, segment);
      continue;
    }

    if (!guardResult) {
      throw new RouterError(errorCode, { segment });
    }
  }
}

async function finishAsyncPipeline( // NOSONAR
  deactivateCompletion: Promise<void>,
  activateGuards: Map<string, GuardFn>,
  toActivate: string[],
  shouldActivate: boolean,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal,
  isActive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Promise<void> {
  await deactivateCompletion;

  if (!isActive()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  const leaveResult = emitLeaveApprove();

  if (leaveResult !== undefined) {
    await leaveResult;

    // Stryker disable next-line BlockStatement: equivalent — defensive-redundancy: this post-leave cancellation re-check is already enforced upstream (navigationId / isCurrentNav supersession in NavigationNamespace), so emptying the throw is unobservable. Mirrors the disabled L42/L115/L228 cancel-checks.
    /* v8 ignore next 3 -- @preserve: V8 cannot track cancellation check through async leave continuation after Promise.allSettled */
    if (!isActive()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }
  }

  if (shouldActivate) {
    const pending = runGuards(
      activateGuards,
      toActivate,
      errorCodes.CANNOT_ACTIVATE,
      toState,
      fromState,
      signal,
      isActive,
    );

    if (pending !== undefined) {
      await pending;
    }

    // Stryker disable next-line BlockStatement: equivalent — same async-tail cancellation throw as L42; dropping it is covered by the outer navigationId guard (full suite green). CE sibling stays live (→true killed by async-guard tests).
    if (!isActive()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }
  }
}

export function executeGuardPipeline( // NOSONAR
  deactivateGuards: Map<string, GuardFn>,
  activateGuards: Map<string, GuardFn>,
  toDeactivate: string[],
  toActivate: string[],
  shouldDeactivate: boolean,
  shouldActivate: boolean,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal,
  isActive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Promise<void> | undefined {
  if (shouldDeactivate) {
    const pending = runGuards(
      deactivateGuards,
      toDeactivate,
      errorCodes.CANNOT_DEACTIVATE,
      toState,
      fromState,
      signal,
      isActive,
    );

    if (pending !== undefined) {
      return finishAsyncPipeline(
        pending,
        activateGuards,
        toActivate,
        shouldActivate,
        toState,
        fromState,
        signal,
        isActive,
        emitLeaveApprove,
      );
    }
  }

  if (!isActive()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  const leaveResult = emitLeaveApprove();

  if (leaveResult !== undefined) {
    return finishAfterAsyncLeave(
      leaveResult,
      /* v8 ignore next -- @preserve: false-branch unreachable — navigateToNotFound bypasses guards pipeline */
      shouldActivate ? activateGuards : undefined,
      toActivate,
      toState,
      fromState,
      signal,
      isActive,
    );
  }

  if (shouldActivate) {
    return runGuards(
      activateGuards,
      toActivate,
      errorCodes.CANNOT_ACTIVATE,
      toState,
      fromState,
      signal,
      isActive,
    );
  }

  return undefined;
}

async function finishAfterAsyncLeave(
  leaveCompletion: Promise<void>,
  activateGuards: Map<string, GuardFn> | undefined,
  toActivate: string[],
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal,
  isActive: () => boolean,
): Promise<void> {
  await leaveCompletion;

  // Stryker disable next-line BlockStatement: equivalent — defensive-redundancy: same post-leave cancellation re-check as guardPhase's other `!isActive()` guards; supersession is enforced upstream (navigationId / isCurrentNav), so emptying the throw is unobservable.
  /* v8 ignore next 3 -- @preserve: unreachable after #663 — signal abort
     mid-leave rejects via settleLeavePromises, so `await leaveCompletion`
     throws directly instead of completing with a stale isActive() */
  if (!isActive()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  /* v8 ignore next -- @preserve: false-branch unreachable — navigateToNotFound bypasses guards pipeline */
  if (activateGuards !== undefined) {
    const pending = runGuards(
      activateGuards,
      toActivate,
      errorCodes.CANNOT_ACTIVATE,
      toState,
      fromState,
      signal,
      isActive,
    );

    if (pending !== undefined) {
      await pending;
    }

    // Stryker disable next-line BlockStatement: equivalent — same async-tail cancellation throw as L42; dropping it is covered by the outer navigationId guard (full suite green). CE sibling stays live (→true killed by async-guard tests).
    if (!isActive()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }
  }
}

function runGuards(
  guards: Map<string, GuardFn>,
  segments: string[],
  errorCode: string,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isActive: () => boolean,
): Promise<void> | undefined {
  for (const [i, segment] of segments.entries()) {
    if (!isActive()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    const guardFn = guards.get(segment);

    if (!guardFn) {
      continue;
    }

    // Stryker disable next-line BooleanLiteral: equivalent — guardResult is unconditionally reassigned by guardFn() on the next line, or the catch calls handleGuardError() (returns never), so the init value is never read.
    let guardResult: boolean | Promise<boolean> = false;

    try {
      guardResult = guardFn(toState, fromState, signal);
    } catch (error: unknown) {
      handleGuardError(error, errorCode, segment);
    }

    if (guardResult instanceof Promise) {
      return resolveRemainingGuards(
        guards,
        segments,
        errorCode,
        toState,
        fromState,
        signal,
        isActive,
        i + 1,
        guardResult,
        segment,
      );
    }

    if (!guardResult) {
      throw new RouterError(errorCode, { segment });
    }
  }

  return undefined;
}
