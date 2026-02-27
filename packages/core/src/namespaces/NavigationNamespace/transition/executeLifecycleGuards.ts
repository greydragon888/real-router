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
      result = await guardFn(toState, fromState);
    } catch (error: unknown) {
      rethrowAsRouterError(error, errorCode, segment);
    }

    if (!result) {
      throw new RouterError(errorCode, { segment });
    }
  }
}
