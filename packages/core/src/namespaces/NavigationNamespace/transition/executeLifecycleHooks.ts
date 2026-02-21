import { rethrowAsRouterError } from "./makeError";
import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { GuardFn, State } from "@real-router/types";

// Helper: execution of the Lifecycle Hooks group
export const executeLifecycleHooks = async (
  hooks: Map<string, GuardFn>,
  toState: State,
  fromState: State | undefined,
  segments: string[],
  errorCode: string,
  isCancelled: () => boolean,
): Promise<void> => {
  const segmentsToProcess = segments.filter((name) => hooks.has(name));

  if (segmentsToProcess.length === 0) {
    return;
  }

  for (const segment of segmentsToProcess) {
    if (isCancelled()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    // Safe cast: segmentsToProcess only contains names that exist in hooks (filtered above)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by filter
    const hookFn = hooks.get(segment)!;

    let result: boolean | undefined;

    try {
      result = await hookFn(toState, fromState);
    } catch (error: unknown) {
      rethrowAsRouterError(error, errorCode, segment);
    }

    if (!result) {
      throw new RouterError(errorCode, { segment });
    }
  }
};
