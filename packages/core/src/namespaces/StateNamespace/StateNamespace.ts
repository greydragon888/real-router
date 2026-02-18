// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import {
  getTypeDescription,
  isParams,
  isString,
  validateState,
} from "type-guards";

import { areParamValuesEqual, getUrlParamsFromMeta } from "./helpers";
import { constants } from "../../constants";
import { freezeStateInPlace } from "../../helpers";

import type { StateNamespaceDependencies } from "./types";
import type {
  NavigationOptions,
  Params,
  State,
  StateMetaInput,
} from "@real-router/types";
import type { RouteTreeStateMeta } from "route-tree";

/**
 * Independent namespace for managing router state storage and creation.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle state storage, freezing, and creation.
 */
export class StateNamespace {
  /**
   * Auto-incrementing state ID for tracking navigation history.
   */
  #stateId = 0;

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
  #depsStore: StateNamespaceDependencies | undefined;

  /**
   * Cache for URL params by route name.
   */
  readonly #urlParamsCache = new Map<string, string[]>();

  /**
   * Gets dependencies or throws if not initialized.
   */
  get #deps(): StateNamespaceDependencies {
    /* v8 ignore next 3 -- @preserve: deps always set by Router.ts */
    if (!this.#depsStore) {
      throw new Error(
        "[real-router] StateNamespace: dependencies not initialized",
      );
    }

    return this.#depsStore;
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates makeState arguments.
   */
  static validateMakeStateArgs(
    name: unknown,
    params: unknown,
    path: unknown,
    forceId: unknown,
  ): void {
    // Validate name is a string
    if (!isString(name)) {
      throw new TypeError(
        `[router.makeState] Invalid name: ${getTypeDescription(name)}. Expected string.`,
      );
    }

    // Validate params if provided
    if (params !== undefined && !isParams(params)) {
      throw new TypeError(
        `[router.makeState] Invalid params: ${getTypeDescription(params)}. Expected plain object.`,
      );
    }

    // Validate path if provided
    if (path !== undefined && !isString(path)) {
      throw new TypeError(
        `[router.makeState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
      );
    }

    // Validate forceId if provided
    if (forceId !== undefined && typeof forceId !== "number") {
      throw new TypeError(
        `[router.makeState] Invalid forceId: ${getTypeDescription(forceId)}. Expected number.`,
      );
    }
  }

  /**
   * Validates areStatesEqual arguments.
   */
  static validateAreStatesEqualArgs(
    state1: unknown,
    state2: unknown,
    ignoreQueryParams: unknown,
  ): void {
    // null/undefined are valid (represent "no state")
    if (state1 != null) {
      validateState(state1, "areStatesEqual");
    }

    if (state2 != null) {
      validateState(state2, "areStatesEqual");
    }

    if (
      ignoreQueryParams !== undefined &&
      typeof ignoreQueryParams !== "boolean"
    ) {
      throw new TypeError(
        `[router.areStatesEqual] Invalid ignoreQueryParams: ${getTypeDescription(ignoreQueryParams)}. Expected boolean.`,
      );
    }
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Returns the current router state.
   *
   * The returned state is deeply frozen (immutable) for safety.
   * Returns `undefined` if the router has not been started or has been stopped.
   */
  get<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#frozenState as State<P, MP> | undefined;
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
    if (!state) {
      this.#frozenState = undefined;
    } else if (Object.isFrozen(state)) {
      // State is already frozen (typically from makeState)
      this.#frozenState = state;
    } else {
      // External state - freeze in place without cloning.
      this.#frozenState = freezeStateInPlace(state);
    }
  }

  /**
   * Returns the previous router state (before the last navigation).
   */
  getPrevious<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#previousState as State<P, MP> | undefined;
  }

  reset(): void {
    this.#frozenState = undefined;
    this.#previousState = undefined;
    this.#urlParamsCache.clear();
    this.#stateId = 0;
  }

  // =========================================================================
  // Dependency Injection
  // =========================================================================

  /**
   * Sets dependencies for state creation methods.
   * Must be called before using makeState, areStatesEqual, etc.
   */
  setDependencies(deps: StateNamespaceDependencies): void {
    this.#depsStore = deps;
  }

  // =========================================================================
  // State Creation Methods
  // =========================================================================

  /**
   * Creates a frozen state object for a route.
   */
  makeState<P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ): State<P, MP> {
    const madeMeta = meta
      ? {
          ...meta,
          id: forceId ?? ++this.#stateId,
          params: meta.params,
          options: meta.options,
          redirected: meta.redirected,
        }
      : undefined;

    // Optimization: O(1) lookup instead of O(depth) ancestor iteration
    const defaultParamsConfig = this.#deps.getDefaultParams();
    const hasDefaultParams = Object.hasOwn(defaultParamsConfig, name);

    // Conditional allocation: avoid spreading when no defaultParams exist
    let mergedParams: P;

    if (hasDefaultParams) {
      mergedParams = { ...defaultParamsConfig[name], ...params } as P;
    } else if (params) {
      mergedParams = { ...params };
    } else {
      mergedParams = {} as P;
    }

    const state: State<P, MP> = {
      name,
      params: mergedParams,
      path: path ?? this.#deps.buildPath(name, params),
      meta: madeMeta,
    };

    return freezeStateInPlace(state);
  }

  /**
   * Creates a frozen state object for the "not found" route.
   */
  makeNotFoundState(path: string, options: NavigationOptions): State {
    return this.makeState<{ path: string }>(
      constants.UNKNOWN_ROUTE,
      { path },
      path,
      {
        options,
        params: {},
        redirected: false,
      },
    );
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
      const stateMeta = (state1.meta?.params ?? state2.meta?.params) as
        | RouteTreeStateMeta
        | undefined;

      const urlParams = stateMeta
        ? getUrlParamsFromMeta(stateMeta)
        : this.#getUrlParams(state1.name);

      return urlParams.every((param) =>
        areParamValuesEqual(state1.params[param], state2.params[param]),
      );
    }

    const state1Keys = Object.keys(state1.params);
    const state2Keys = Object.keys(state2.params);

    if (state1Keys.length !== state2Keys.length) {
      return false;
    }

    return state1Keys.every(
      (param) =>
        param in state2.params &&
        areParamValuesEqual(state1.params[param], state2.params[param]),
    );
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
