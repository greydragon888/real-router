import { handleGuardError, resolveAsyncGuard } from "./errorHandling";
import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { GuardFn, State } from "../../../types";

/**
 * The guard pipeline as ONE program and TWO interpreters (RFC two-pipelines,
 * разрез Б).
 *
 * The program is three fixed phases — deactivate, leave, activate — walked by a
 * cursor of two numbers. `runFrom` is the synchronous interpreter: it walks
 * until a step hands back a Promise, then stops and reports where it stopped.
 * `resumeFrom` is the asynchronous one: it settles that Promise and hands the
 * cursor straight back to `runFrom`. Switching pipelines is therefore a single
 * act — give up the cursor — rather than four continuation functions each wired
 * to its own entry point.
 *
 * What that buys, and it is the reason the step exists: **one cancellation
 * check**. There were eight, and five of them were mutationally unkillable —
 * their breakage was as unobservable as their removal, because a navigation
 * reaching them was already covered by the liveness check one layer up. A single
 * check in the head of the step runs at every position that mattered, and it
 * sits where nothing else guards it, so it is killable again (removing it fails
 * four tests).
 *
 * It does NOT reproduce the five redundant positions, deliberately: there is no
 * check after the LAST activation guard settles, nor after an async leave when
 * `shouldActivate` is false, because the walk simply ends there. Those were two
 * of the five, and `#finishAsyncNavigation`'s liveness check still covers both.
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
function runStep( // NOSONAR -- params kept flat to avoid object allocation on hot path
  phase: number,
  index: number,
  segments: string[],
  guards: Map<string, GuardFn>,
  errorCode: string,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isActive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Suspension | undefined {
  // THE cancellation check — the only one left in this file, and literally in
  // the head of a step. Eight became one, and unlike five of those eight it is
  // killable: nothing else guards this position.
  if (!isActive()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
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
    throw new RouterError(errorCode, { segment });
  }

  return undefined;
}

/**
 * One PHASE of the program: its short-circuit, then its steps.
 *
 * Split from the walk so neither function carries the whole program — phase-level
 * and step-level nesting in one body is what pushed the first draft past the
 * complexity budget, and past a lint rule against `continue` across nested loops.
 */
function runPhase( // NOSONAR -- params kept flat to avoid object allocation on hot path
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
  isActive: () => boolean,
  emitLeaveApprove: () => Promise<void> | undefined,
): Suspension | undefined {
  const isLeave = phase === PHASE_LEAVE;
  const isDeactivate = phase === PHASE_DEACTIVATE;

  // Today's per-phase short-circuits, reproduced. `shouldDeactivate` carries
  // `!opts.forceDeactivate`, so this is a user-facing contract and not merely an
  // emptiness test — forcing it on is measurably NOT equivalent.
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
      isActive,
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
function runFrom( // NOSONAR -- params kept flat to avoid object allocation on hot path
  deactivateGuards: Map<string, GuardFn>,
  activateGuards: Map<string, GuardFn>,
  toDeactivate: string[],
  toActivate: string[],
  shouldDeactivate: boolean,
  shouldActivate: boolean,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isActive: () => boolean,
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
      isActive,
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
async function resumeFrom( // NOSONAR -- params kept flat to avoid object allocation on hot path
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
  isActive: () => boolean,
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
      isActive,
      emitLeaveApprove,
      at.phase,
      at.index,
    );
  }
}

/**
 * Runs the guard program. Returns `undefined` when it completed synchronously,
 * or the Promise that finishes it otherwise — the same contract the three
 * orchestrators used to provide between them.
 */
export function executeGuardPipeline( // NOSONAR -- params kept flat to avoid object allocation on hot path
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
    isActive,
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
        isActive,
        emitLeaveApprove,
      );
}
