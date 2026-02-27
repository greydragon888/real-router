// packages/core/src/namespaces/NavigationNamespace/transition/executeLifecycleGuards.ts

import { rethrowAsRouterError } from "./errorHandling";
import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { GuardFn, State } from "@real-router/types";

// Helper: execution of the Lifecycle Guards group
export async function executeLifecycleGuards(
  guard: Map<string, GuardFn>,
  toState: State,
  fromState: State | undefined,
  segments: string[],
  errorCode: string,
  isCancelled: () => boolean,
  signal: AbortSignal,
): Promise<void> {
  const segmentsToProcess = segments.filter((name) => guard.has(name));

  if (segmentsToProcess.length === 0) {
    return;
  }

  let result: boolean | undefined;

  for (const segment of segmentsToProcess) {
    if (isCancelled()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    // Safe cast: segmentsToProcess only contains names that exist in guard (filtered above)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by filter
    const guardFn = guard.get(segment)!;

    try {
      // Pass signal only to guards that explicitly declare a 3rd parameter (opt-in).
      // Checking guardFn.length avoids breaking existing 2-param guards and vitest
      // toHaveBeenCalledWith(arg1, arg2) assertions that are strict about arg count.
      result = await (guardFn.length >= 3
        ? guardFn(toState, fromState, signal)
        : guardFn(toState, fromState));
    } catch (error: unknown) {
      /* v8 ignore next 4 -- @preserve: AbortError race condition guard — signal may abort between isCancelled check and guard execution; covered by AbortController API integration tests */
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
          reason: signal.reason,
        });
      }

      rethrowAsRouterError(error, errorCode, segment);
    }

    if (!result) {
      throw new RouterError(errorCode, { segment });
    }
  }
}
