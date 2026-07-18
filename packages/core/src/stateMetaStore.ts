// packages/core/src/stateMetaStore.ts

import type { Params, State } from "./types";

const store = new WeakMap<State, Params>();

/** @internal */
export function getStateMetaParams(state: State): Params | undefined {
  return store.get(state);
}

/** @internal */
export function setStateMetaParams(state: State, params: Params): void {
  store.set(state, params);
}
