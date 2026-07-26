// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import { areParamValuesEqual } from "./helpers";
import {
  DEFAULT_TRANSITION,
  EMPTY_PARAMS,
  EMPTY_SEARCH,
} from "../../constants";
import { freezeStateInPlace } from "../../helpers";

import type { StateNamespaceDependencies } from "./types";
import type { Params, SearchParams, State } from "../../types";

/**
 * Independent namespace for managing router state storage and creation.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle state storage, freezing, and creation.
 */
export class StateNamespace {
  /**
   * Cached frozen state - avoids structuredClone on every getState() call.
   */
  #frozenState: State | undefined = undefined;

  /**
   * Previous state before the last setState call.
   */
  #previousState: State | undefined = undefined;

  /**
   * Dependencies injected from Router.
   */
  #deps!: StateNamespaceDependencies;

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Returns the current router state.
   *
   * The returned state is deeply frozen (immutable) for safety.
   * Returns `undefined` if the router has not been started or has been stopped.
   */
  get<P extends Params = Params>(): State<P> | undefined {
    return this.#frozenState as State<P> | undefined; // NOSONAR -- generic narrowing needed for public API
  }

  /**
   * Sets the current router state.
   *
   * The state is deeply frozen before storage to ensure immutability.
   * The previous state is preserved and accessible via `getPrevious()`.
   *
   * @param state - Already validated by facade, or undefined to clear
   */
  set(state: State | undefined): void {
    // Preserve current state as previous before updating
    this.#previousState = this.#frozenState;

    // If state is already frozen (from makeState()), use it directly.
    // For external states, freeze in place without cloning.
    this.#frozenState = state ? freezeStateInPlace(state) : undefined;
  }

  /**
   * Returns the previous router state (before the last navigation).
   */
  getPrevious(): State | undefined {
    return this.#previousState;
  }

  reset(): void {
    this.#frozenState = undefined;
    this.#previousState = undefined;
  }

  // =========================================================================
  // Dependency Injection
  // =========================================================================

  /**
   * Sets dependencies for state creation methods.
   * Must be called before using makeState, areStatesEqual, etc.
   */
  setDependencies(deps: StateNamespaceDependencies): void {
    this.#deps = deps;
  }

  // =========================================================================
  // State Creation Methods
  // =========================================================================

  /**
   * Creates a state object for a route.
   *
   * `params` is frozen at creation so it is always immutable, even when
   * `skipFreeze=true` is passed to defer the outer `Object.freeze(state)` call.
   * This keeps params-freezing invariants independent of transition-pipeline
   * mutation (e.g. `completeTransition` attaching `state.transition`).
   *
   * Channels arrive ALREADY separated by construction (#1548/#1549): every
   * producer routes its input through `forwardState`, whose interceptable
   * canonicalizes the channels ONCE — a DECLARED query name (`?a&b`, colliding
   * path names excluded) → the query channel, everything else → path — after the
   * whole plugin chain has run. So `params` is path-only and `search` is the
   * query channel here. makeState never re-splits; it only merges each channel's
   * route default (`defaultParams` on path, `defaultSearch` on query) UNDER the
   * given value (caller wins), the two channels independent.
   *
   * `context` is initialized as a fresh empty object — intentionally NOT frozen
   * so plugins can publish data via `claim.write(state, value)` after creation.
   */
  makeState<P extends Params = Params, S extends SearchParams = SearchParams>(
    name: string,
    params?: P,
    search?: S,
    path?: string,
    skipFreeze?: boolean,
  ): State<P, S> {
    // Optimization: O(1) lookup instead of O(depth) ancestor iteration.
    // Defaults are pre-split by field (RFC-4 M2 / #1548): `defaultParams` owns
    // the path channel, `defaultSearch` the query channel — no declaration
    // inference. `config.*` maps are null-prototype, so a missing entry reads as
    // `undefined` (never a proto value).
    const routeDefaultParams = this.#deps.getDefaultParams()[name] as
      Params | undefined;
    const routeDefaultSearch = this.#deps.getDefaultSearch()[name] as
      SearchParams | undefined;

    // Channels are already canonical (separated upstream in forwardState) — no
    // re-split here. Each channel merges its route default UNDER the given value
    // (caller wins), reusing the EMPTY_PARAMS / EMPTY_SEARCH singleton (#1027)
    // when neither a default nor a value survives.
    const mergedParams = mergeWithDefault(
      routeDefaultParams,
      params,
      EMPTY_PARAMS,
    ) as P;
    const mergedSearch = mergeWithDefault(
      routeDefaultSearch,
      search,
      EMPTY_SEARCH,
    ) as S;

    const state = {
      name,
      params: mergedParams,
      // Query channel (RFC-4 M2 / #1548): the input is already canonical
      // (separated upstream), so declared query names live here, never in
      // `params`.
      search: mergedSearch,
      // Build the URL from the merged channels (not the raw args) so a state
      // built without an explicit path — canNavigateTo, isActiveRoute — has
      // `state.path` in step with `state.search` (RFC-4 M2 / #1548). buildPath
      // re-applies the same defaults idempotently.
      path: path ?? this.#deps.buildPath(name, mergedParams, mergedSearch),
      context: {},
      ...(!skipFreeze && { transition: DEFAULT_TRANSITION }),
    } as State<P, S>;

    return skipFreeze ? state : freezeStateInPlace(state);
  }

  // =========================================================================
  // State Comparison Methods
  // =========================================================================

  /**
   * Compares two states for equality.
   * By default, ignores query params (only compares URL params).
   */
  areStatesEqual(
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams = true,
  ): boolean {
    if (!state1 || !state2) {
      return !!state1 === !!state2;
    }

    if (state1.name !== state2.name) {
      return false;
    }

    if (ignoreQueryParams) {
      // URL (path) param names are cached at the routes layer and invalidated
      // on every tree mutation, so this stays correct after replace() (#723).
      const urlParams = this.#deps.getUrlParams(state1.name);

      for (const urlParam of urlParams) {
        if (
          !areParamValuesEqual(state1.params[urlParam], state2.params[urlParam])
        ) {
          return false;
        }
      }

      return true;
    }

    // Compare BOTH channels — path params and query (search). Query moved out
    // of `params` into `search` in M2 (#1548), so a full comparison must check
    // both. `search` is always present (makeState fills EMPTY_SEARCH).
    return (
      recordsShallowEqual(state1.params, state2.params) &&
      recordsShallowEqual(state1.search, state2.search)
    );
  }
}

/**
 * Merges a channel's route default UNDER a routed value (the value wins) and
 * freezes the result. Reuses the shared frozen `empty` singleton (EMPTY_PARAMS /
 * EMPTY_SEARCH, #1027) when there is neither a default nor a value — so the hot
 * path (no defaults, empty params) allocates zero objects. A defaulted channel
 * always spreads (a fresh frozen object); an undefined-default channel freezes a
 * copy of the value (never the caller's object).
 */
function mergeWithDefault(
  defaultValue: Record<string, unknown> | undefined,
  value: Record<string, unknown> | undefined,
  empty: Readonly<Record<string, never>>,
): Readonly<Record<string, unknown>> {
  if (defaultValue !== undefined) {
    return Object.freeze({ ...defaultValue, ...value });
  }

  return value === undefined || value === empty
    ? empty
    : Object.freeze({ ...value });
}

/**
 * Shallow key/value equality of two param-like records (path params or query),
 * using {@link areParamValuesEqual} per key so array values compare by content.
 */
function recordsShallowEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const leftKeys = Object.keys(left);

  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!(key in right) || !areParamValuesEqual(left[key], right[key])) {
      return false;
    }
  }

  return true;
}
