// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import { logger } from "@real-router/logger";
import {
  getTypeDescription,
  isNavigationOptions,
  isParams,
  isString,
  validateState,
} from "type-guards";

import { constants } from "@real-router/core";

import { freezeStateInPlace } from "../../helpers";

import type {
  NavigationOptions,
  Params,
  State,
  StateMetaInput,
} from "@real-router/types";
import type { RouteTreeStateMeta } from "route-tree";

/**
 * Dependencies injected from Router for state creation.
 */
interface StateNamespaceDependencies {
  /** Get defaultParams config for a route */
  getDefaultParams: () => Record<string, Params>;
  /** Build URL path for a route */
  buildPath: (name: string, params?: Params) => string;
  /** Get URL params for a route (for areStatesEqual) */
  getUrlParams: (name: string) => string[];
}

/**
 * Extracts URL param names from RouteTreeStateMeta.
 * This is an O(segments × params) operation but avoids tree traversal.
 */
function getUrlParamsFromMeta(meta: RouteTreeStateMeta): string[] {
  const urlParams: string[] = [];

  for (const segmentName in meta) {
    const paramMap = meta[segmentName];

    for (const param in paramMap) {
      if (paramMap[param] === "url") {
        urlParams.push(param);
      }
    }
  }

  return urlParams;
}

/**
 * Compares two parameter values for equality.
 * Supports deep equality for arrays (common in route params like tags, ids).
 */
function areParamValuesEqual(val1: unknown, val2: unknown): boolean {
  if (val1 === val2) {
    return true;
  }

  if (Array.isArray(val1) && Array.isArray(val2)) {
    if (val1.length !== val2.length) {
      return false;
    }

    return val1.every((v, i) => areParamValuesEqual(v, val2[i]));
  }

  return false;
}

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
  #deps: StateNamespaceDependencies | undefined;

  /**
   * Cache for URL params by route name.
   */
  readonly #urlParamsCache = new Map<string, string[]>();

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates state structure.
   * Called by facade before setState.
   */
  /* c8 ignore next 3 -- static method, not currently used */
  static validateState(state: unknown): asserts state is State {
    validateState(state, "router.setState");
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

  /**
   * Generates the next state ID.
   */
  /* c8 ignore next 3 -- public API, not used internally */
  nextId(): number {
    return ++this.#stateId;
  }

  /**
   * Gets the current state ID without incrementing.
   */
  /* c8 ignore next 3 -- public API, not used internally */
  getCurrentId(): number {
    return this.#stateId;
  }

  /**
   * Resets state to initial values (for router stop/restart).
   */
  /* c8 ignore start -- currently unused, kept for future API */
  reset(): void {
    this.#frozenState = undefined;
    this.#previousState = undefined;
    // Note: stateId is NOT reset to maintain unique IDs across router lifecycles
  }
  /* c8 ignore stop */

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
   * Creates a frozen state object for a route.
   */
  makeState<P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ): State<P, MP> {
    /* c8 ignore next 4 -- defensive check, always set by Router */
    if (!this.#deps) {
      throw new Error(
        `[StateNamespace] Dependencies not set. Call setDependencies() first.`,
      );
    }

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

    const madeMeta = meta
      ? {
          ...meta,
          id: forceId ?? ++this.#stateId,
          params: meta.params,
          options: meta.options,
          redirected: meta.redirected,
        }
      : undefined;

    // Get default params from routes config, including ancestor routes
    const defaultParamsConfig = this.#deps.getDefaultParams();

    // Collect defaultParams from all ancestors (parent.child -> parent, parent.child)
    const segments = name.split(".");
    let mergedParams: P = {} as P;

    // Build up ancestor names and merge their defaultParams
    for (let i = 1; i <= segments.length; i++) {
      const ancestorName = segments.slice(0, i).join(".");

      if (Object.hasOwn(defaultParamsConfig, ancestorName)) {
        mergedParams = {
          ...mergedParams,
          ...defaultParamsConfig[ancestorName],
        } as P;
      }
    }

    // Finally merge with provided params (highest priority)
    if (params) {
      mergedParams = { ...mergedParams, ...params };
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
  makeNotFoundState(path: string, options?: NavigationOptions): State {
    if (!isString(path)) {
      throw new TypeError(
        `[router.makeNotFoundState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
      );
    }

    if (options !== undefined && !isNavigationOptions(options)) {
      throw new TypeError(
        `[router.makeNotFoundState] Invalid options: ${getTypeDescription(options)}. Expected NavigationOptions object.`,
      );
    }

    return this.makeState<{ path: string }>(
      constants.UNKNOWN_ROUTE,
      { path },
      path,
      options
        ? {
            options,
            params: {},
            redirected: false,
          }
        : undefined,
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
    /* c8 ignore next 4 -- defensive check, always set by Router */
    if (!this.#deps) {
      throw new Error(
        `[StateNamespace] Dependencies not set. Call setDependencies() first.`,
      );
    }

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

  /**
   * Checks if childState is a descendant of parentState.
   *
   * @deprecated Use router.isActiveRoute() instead.
   */
  areStatesDescendants(parentState: State, childState: State): boolean {
    validateState(parentState, "areStatesDescendants");
    validateState(childState, "areStatesDescendants");

    logger.warn(
      "real-router",
      "areStatesDescendants is deprecated and will be removed in the next major version. " +
        "Use router.isActiveRoute() instead.",
    );

    const parentPrefix = `${parentState.name}.`;

    if (!childState.name.startsWith(parentPrefix)) {
      return false;
    }

    return Object.keys(parentState.params).every((p) =>
      areParamValuesEqual(parentState.params[p], childState.params[p]),
    );
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Gets URL params for a route name, using cache for performance.
   */
  #getUrlParams(name: string): string[] {
    /* c8 ignore next 3 -- defensive check, always set by Router */
    if (!this.#deps) {
      return [];
    }

    const cached = this.#urlParamsCache.get(name);

    if (cached !== undefined) {
      return cached;
    }

    const result = this.#deps.getUrlParams(name);

    this.#urlParamsCache.set(name, result);

    return result;
  }
}
