import { handleGuardError, resolveAsyncGuard } from "./errorHandling";
import { errorCodes } from "../../../constants";
import { RouterError, freezeThrownError } from "../../../RouterError";

import type { GuardFn, State } from "../../../types";

/**
 * The guard pipeline as ONE program and TWO interpreters (RFC two-pipelines,
 * разрез Б): three fixed phases — deactivate, leave, activate — walked by a
 * cursor of two numbers. `runFrom` stops at the first Promise and reports
 * where; `resumeFrom` settles it and hands the cursor back, so switching
 * pipelines is one act — give up the cursor.
 *
 * The step exists for ONE cancellation check, and `runStep` carries what holds
 * it. The two positions at the end of the async walk deliberately have none:
 * `finishAsyncNavigation` already asks there, so a check in either spot reds
 * nothing.
 *
 * ⚑ Every function here takes its parameters FLAT rather than in a bag, and
 * carries a `NOSONAR` for it: the walk runs per guard step on the #307 path,
 * and an options object would be an allocation per call.
 */

const PHASE_DEACTIVATE = 0;
const PHASE_LEAVE = 1;
const PHASE_ACTIVATE = 2;

/**
 * Where the synchronous interpreter stopped, and what it is waiting on.
 *
 * Allocated ONLY when a step actually suspends — a fully synchronous navigation
 * never builds one, which is what keeps the hot path where it was. `index` is
 * already the cursor for the NEXT step, so resuming needs no off-by-one
 * reasoning.
 */
interface Suspension {
  phase: number;
  index: number;
  pending: Promise<unknown>;
}

/**
 * ONE step of the program: the cancellation check, then the step's own work.
 *
 * Returns a {@link Suspension} when the step handed back a Promise, `undefined`
 * when it finished synchronously, and throws when it refused — a guard returning
 * `false`, a guard throwing, or the navigation having been cancelled.
 */
function runStep( // NOSONAR -- see the note on flat parameters at the top of this file
  phase: number,
  index: number,
  segments: string[],
  guards: Map<string, GuardFn>,
  errorCode: string,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isLive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Suspension | undefined {
  // THE cancellation check — the only one in this file, and the head of the step
  // is where it has to stay: the leave phase returns before any guard lookup, so
  // a fence one statement lower stops covering it. Measured both ways — removing
  // it reds 13 tests, moving it below the leave branch reds 3 — and nothing
  // guards this position or the one downstream (`routerFSM.ts` records why the
  // LEAVE_APPROVE edge's `when` could never fire).
  //
  // Without it a superseded navigation walks on and sends its LEAVE_APPROVE, and
  // when it gets there FIRST (the named test's order — the reverse one diverges
  // in nothing) the machine enters LEAVE_APPROVED under the DEAD payload.
  // Measured on both channels: `onTransitionLeaveApprove` fires from the edge's
  // action, so it names the dead destination while the survivor's approval is a
  // table no-op; `subscribeLeave` is dispatched by the pipeline, so it hears
  // BOTH, dead first — the half `useRouteExit` sits on in six adapters. The
  // committed state is not the casualty; what diverges is what subscribers were
  // told, the #1609 silent-commit shape one event earlier, and the test naming
  // the symptom is `leave-approve-integration.test.ts` "the LEAVE_APPROVE event
  // names the SURVIVING navigation".
  if (!isLive()) {
    throw freezeThrownError(new RouterError(errorCodes.TRANSITION_CANCELLED));
  }

  if (phase === PHASE_LEAVE) {
    const leaveResult = emitLeaveApprove();

    return leaveResult === undefined
      ? undefined
      : { phase, index: index + 1, pending: leaveResult };
  }

  const segment = segments[index];
  const guardFn = guards.get(segment);

  if (!guardFn) {
    return undefined;
  }

  // Stryker disable next-line BooleanLiteral: equivalent — guardResult is unconditionally reassigned by guardFn() on the next line, or the catch calls handleGuardError() (returns never), so the init value is never read.
  let guardResult: boolean | Promise<boolean> = false;

  try {
    guardResult = guardFn(toState, fromState, signal);
  } catch (error: unknown) {
    handleGuardError(error, errorCode, segment);
  }

  if (guardResult instanceof Promise) {
    return { phase, index: index + 1, pending: guardResult };
  }

  if (!guardResult) {
    throw freezeThrownError(new RouterError(errorCode, { segment }));
  }

  return undefined;
}

/**
 * One PHASE of the program: its short-circuit, then its steps.
 *
 * Split from the walk so neither function carries the whole program — phase-level
 * and step-level nesting in one body exceeds the complexity budget and trips
 * `unicorn/no-break-in-nested-loop`, which asks for exactly this ("move this
 * nested loop into a function instead").
 */
function runPhase( // NOSONAR -- see the note on flat parameters at the top of this file
  phase: number,
  from: number,
  deactivateGuards: Map<string, GuardFn>,
  activateGuards: Map<string, GuardFn>,
  toDeactivate: string[],
  toActivate: string[],
  shouldDeactivate: boolean,
  shouldActivate: boolean,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isLive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Suspension | undefined {
  const isLeave = phase === PHASE_LEAVE;
  const isDeactivate = phase === PHASE_DEACTIVATE;

  // Both halves are contracts and both DECIDE: `shouldDeactivate` carries
  // `!opts.forceDeactivate`, `shouldActivate` carries `toState.name !==
  // UNKNOWN_ROUTE`. Reaching either takes a guard on the OTHER phase — a false
  // short-circuit also disarms `hasGuards`, so the navigation takes разрез А and
  // never arrives here — which is why the tier fired this 29 times on an EMPTY
  // segment list until `phase-short-circuits.test.ts` wrote the two cells.
  if (!isLeave && !(isDeactivate ? shouldDeactivate : shouldActivate)) {
    return undefined;
  }

  const segments = isDeactivate ? toDeactivate : toActivate;
  // The leave phase is a single step, so one loop shape covers all three phases
  // — which is what gives the cancellation check exactly one home.
  const stepCount = isLeave ? 1 : segments.length;
  const guards = isDeactivate ? deactivateGuards : activateGuards;
  const errorCode = isDeactivate
    ? errorCodes.CANNOT_DEACTIVATE
    : errorCodes.CANNOT_ACTIVATE;

  for (let index = from; index < stepCount; index++) {
    const suspension = runStep(
      phase,
      index,
      segments,
      guards,
      errorCode,
      toState,
      fromState,
      signal,
      isLive,
      emitLeaveApprove,
    );

    if (suspension !== undefined) {
      return suspension;
    }
  }

  return undefined;
}

/**
 * The synchronous interpreter: walk the program from `startPhase`/`startIndex`
 * until a step suspends (returns the {@link Suspension}) or the program ends
 * (returns `undefined` — done).
 *
 * Parameters are flat rather than a context object on purpose: a bag would be an
 * allocation on every guarded navigation, and this is the #307 hot path.
 */
function runFrom( // NOSONAR -- see the note on flat parameters at the top of this file
  deactivateGuards: Map<string, GuardFn>,
  activateGuards: Map<string, GuardFn>,
  toDeactivate: string[],
  toActivate: string[],
  shouldDeactivate: boolean,
  shouldActivate: boolean,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isLive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
  startPhase: number,
  startIndex: number,
): Suspension | undefined {
  for (let phase = startPhase; phase <= PHASE_ACTIVATE; phase++) {
    const suspension = runPhase(
      phase,
      phase === startPhase ? startIndex : 0,
      deactivateGuards,
      activateGuards,
      toDeactivate,
      toActivate,
      shouldDeactivate,
      shouldActivate,
      toState,
      fromState,
      signal,
      isLive,
      emitLeaveApprove,
    );

    if (suspension !== undefined) {
      return suspension;
    }
  }

  return undefined;
}

/**
 * The asynchronous interpreter: settle what the synchronous one stopped on, then
 * hand the cursor straight back to it.
 *
 * It owns no phase logic of its own, and that is the point — everything it knows
 * about the program it learns from the cursor, so the two interpreters cannot
 * drift apart the way the three continuation functions did.
 */
async function resumeFrom( // NOSONAR -- see the note on flat parameters at the top of this file
  suspension: Suspension,
  deactivateGuards: Map<string, GuardFn>,
  activateGuards: Map<string, GuardFn>,
  toDeactivate: string[],
  toActivate: string[],
  shouldDeactivate: boolean,
  shouldActivate: boolean,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isLive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Promise<void> {
  let at: Suspension | undefined = suspension;

  while (at !== undefined) {
    if (at.phase === PHASE_LEAVE) {
      await at.pending;
    } else {
      const isDeactivate = at.phase === PHASE_DEACTIVATE;

      await resolveAsyncGuard(
        at.pending as Promise<boolean>,
        isDeactivate
          ? errorCodes.CANNOT_DEACTIVATE
          : errorCodes.CANNOT_ACTIVATE,
        (isDeactivate ? toDeactivate : toActivate)[at.index - 1],
      );
    }

    at = runFrom(
      deactivateGuards,
      activateGuards,
      toDeactivate,
      toActivate,
      shouldDeactivate,
      shouldActivate,
      toState,
      fromState,
      signal,
      isLive,
      emitLeaveApprove,
      at.phase,
      at.index,
    );
  }
}

/**
 * Runs the guard program. Returns `undefined` when it completed synchronously,
 * or the Promise that finishes it otherwise — one contract for all three
 * phases, in one place.
 */
export function executeGuardPipeline( // NOSONAR -- see the note on flat parameters at the top of this file
  deactivateGuards: Map<string, GuardFn>,
  activateGuards: Map<string, GuardFn>,
  toDeactivate: string[],
  toActivate: string[],
  shouldDeactivate: boolean,
  shouldActivate: boolean,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal,
  isLive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Promise<void> | undefined {
  const suspension = runFrom(
    deactivateGuards,
    activateGuards,
    toDeactivate,
    toActivate,
    shouldDeactivate,
    shouldActivate,
    toState,
    fromState,
    signal,
    isLive,
    emitLeaveApprove,
    PHASE_DEACTIVATE,
    0,
  );

  return suspension === undefined
    ? undefined
    : resumeFrom(
        suspension,
        deactivateGuards,
        activateGuards,
        toDeactivate,
        toActivate,
        shouldDeactivate,
        shouldActivate,
        toState,
        fromState,
        signal,
        isLive,
        emitLeaveApprove,
      );
}
