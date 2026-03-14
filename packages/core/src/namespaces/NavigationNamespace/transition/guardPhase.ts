import { handleGuardError } from "./errorHandling";
import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { GuardFn, State } from "@real-router/types";

export interface AsyncGuardDetection {
  result: Promise<boolean>;
  errorCode: string;
  segment: string;
  remainingIndex: number;
}

export function runGuardPhase(
  guards: Map<string, GuardFn>,
  segments: string[],
  errorCode: string,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal | undefined,
  isActive: () => boolean,
): AsyncGuardDetection | undefined {
  for (const [i, segment] of segments.entries()) {
    if (!isActive()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    const guardFn = guards.get(segment);

    if (!guardFn) {
      continue;
    }

    let guardResult: boolean | Promise<boolean> = false;

    try {
      guardResult = guardFn(toState, fromState, signal);
    } catch (error: unknown) {
      handleGuardError(error, errorCode, segment);
    }

    if (guardResult instanceof Promise) {
      return { result: guardResult, errorCode, segment, remainingIndex: i + 1 };
    }

    if (!guardResult) {
      throw new RouterError(errorCode, { segment });
    }
  }

  return undefined;
}

export async function drainGuardPhase(
  guards: Map<string, GuardFn>,
  segments: string[],
  errorCode: string,
  toState: State,
  fromState: State | undefined,
  signal: AbortSignal,
  isActive: () => boolean,
): Promise<void> {
  let remaining = segments;
  let detected = runGuardPhase(
    guards,
    remaining,
    errorCode,
    toState,
    fromState,
    signal,
    isActive,
  );

  while (detected) {
    let val: boolean;

    try {
      val = await detected.result;
    } catch (error: unknown) {
      handleGuardError(error, detected.errorCode, detected.segment);

      return; // unreachable — handleGuardError returns never
    }

    if (!val) {
      throw new RouterError(detected.errorCode, { segment: detected.segment });
    }

    remaining = remaining.slice(detected.remainingIndex);

    if (remaining.length === 0) {
      break;
    }

    detected = runGuardPhase(
      guards,
      remaining,
      errorCode,
      toState,
      fromState,
      signal,
      isActive,
    );
  }
}
