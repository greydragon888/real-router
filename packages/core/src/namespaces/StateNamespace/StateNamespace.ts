// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import { areParamValuesEqual } from "./helpers";
import { EMPTY_PARAMS } from "../../constants";
import { freezeStateInPlace } from "../../helpers";
import { setStateMetaParams } from "../../stateMetaStore";

import type { StateNamespaceDependencies } from "./types";
import type { Params, State } from "@real-router/types";
import type { RouteTreeStateMeta } from "route-tree";

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

  /**
   * Cache for URL params by route name.
   */
  readonly #urlParamsCache = new Map<string, string[]>();

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
    this.#urlParamsCache.clear();
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
   * `context` is initialized as a fresh empty object — intentionally NOT frozen
   * so plugins can publish data via `claim.write(state, value)` after creation.
   */
  makeState<P extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: RouteTreeStateMeta,
    skipFreeze?: boolean,
  ): State<P> {
    // Optimization: O(1) lookup instead of O(depth) ancestor iteration
    const defaultParamsConfig = this.#deps.getDefaultParams();
    const hasDefaultParams = Object.hasOwn(defaultParamsConfig, name);

    // Conditional allocation: avoid spreading when no defaultParams exist
    let mergedParams: P;

    if (hasDefaultParams) {
      mergedParams = Object.freeze({
        ...defaultParamsConfig[name],
        ...params,
      }) as P;
    } else if (!params || params === EMPTY_PARAMS) {
      mergedParams = EMPTY_PARAMS as P;
    } else {
      mergedParams = Object.freeze({ ...params }) as P;
    }

    const state: State<P> = {
      name,
      params: mergedParams,
      path: path ?? this.#deps.buildPath(name, params),
      context: {},
    };

    if (meta) {
      setStateMetaParams(state, meta as unknown as Params);
    }

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
      const urlParams = this.#getUrlParams(state1.name);

      for (const urlParam of urlParams) {
        if (
          !areParamValuesEqual(state1.params[urlParam], state2.params[urlParam])
        ) {
          return false;
        }
      }

      return true;
    }

    const state1Keys = Object.keys(state1.params);
    const state2Keys = Object.keys(state2.params);

    if (state1Keys.length !== state2Keys.length) {
      return false;
    }

    for (const param of state1Keys) {
      if (
        !(param in state2.params) ||
        !areParamValuesEqual(state1.params[param], state2.params[param])
      ) {
        return false;
      }
    }

    return true;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Gets URL params for a route name, using cache for performance.
   */
  #getUrlParams(name: string): string[] {
    const cached = this.#urlParamsCache.get(name);

    if (cached !== undefined) {
      return cached;
    }

    const result = this.#deps.getUrlParams(name);

    this.#urlParamsCache.set(name, result);

    return result;
  }
}
