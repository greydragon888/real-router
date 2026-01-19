// packages/real-router/modules/transition/mergeStates.ts

import type { Params, State, StateMeta } from "router6-types";

/**
 * Merges two states with toState taking priority over fromState.
 *
 * Priority order for state fields: toState > fromState
 * Priority order for meta fields: toState.meta > fromState.meta > defaults
 *
 * Special case: meta.params are merged (not replaced):
 * { ...toState.meta.params, ...fromState.meta.params }
 *
 * @param toState - Target state (higher priority)
 * @param fromState - Source state (lower priority)
 * @returns New merged state object
 */
export const mergeStates = (toState: State, fromState: State): State => {
  const toMeta = toState.meta;
  const fromMeta = fromState.meta;

  // Optimization #1: Conditional merge for params
  // Use spread only when both are defined
  const toParams = toMeta?.params;
  const fromParams = fromMeta?.params;

  // Both have params - need to merge; otherwise use whichever is defined
  const metaParams: Params =
    toParams && fromParams
      ? { ...toParams, ...fromParams }
      : (toParams ?? fromParams ?? {});

  // Optimization #2: Build meta with defaults, then apply fromMeta, then toMeta
  // Note: StateMeta can have custom fields added by guards/middleware, so we preserve them
  const resultMeta: StateMeta = {
    // Defaults first
    id: 1,
    options: {},
    redirected: false,
    // fromMeta fields (lower priority, may include custom fields)
    ...fromMeta,
    // toMeta fields (higher priority, may include custom fields)
    ...toMeta,
    // Explicitly set params to our merged version (override spread)
    params: metaParams,
  };

  // Optimization #4: Copy all toState fields (including custom ones)
  // then explicitly set meta to our merged version
  // Note: State can have custom fields added by middleware, so we must preserve them
  return {
    ...toState,
    meta: resultMeta,
  };
};
