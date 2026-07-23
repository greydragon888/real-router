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
   * Channel routing (#1549): the committed channels are canonical — a DECLARED
   * query name (`?a&b`, colliding path names excluded) always lands in
   * `state.search` (whether it arrived as a default, a caller param, or a
   * decoder-injected key), with an explicit `search` value winning over any
   * params-bag/default value. `defaultParams` are applied channel-aware: a
   * query-declared default joins `search`; every other default keeps its v1
   * home in `params`, overridden only by a params-given value (the channels
   * are independent — a search-given key is the query twin, not an override).
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
    // Optimization: O(1) lookup instead of O(depth) ancestor iteration
    const defaultParamsConfig = this.#deps.getDefaultParams();
    const hasDefaultParams = Object.hasOwn(defaultParamsConfig, name);
    const queryNames = this.#deps.getQueryParams(name);

    // Conditional allocation: avoid spreading when no defaultParams exist
    let mergedParams: P;
    let mergedSearch: S;

    // Fast path — no declared query names means no key can change channel
    // (defaults and caller params all belong to `params`; `search` passes
    // through untouched). Keeps the pre-#1549 allocation profile
    // (EMPTY_PARAMS / EMPTY_SEARCH reuse, #1027).
    if (queryNames.length === 0) {
      if (hasDefaultParams) {
        mergedParams = Object.freeze({
          ...defaultParamsConfig[name],
          ...params,
        }) as P;
      } else if (!params || params === EMPTY_PARAMS) {
        mergedParams = EMPTY_PARAMS as P;
      } else {
        mergedParams = Object.freeze({ ...params });
      }

      mergedSearch = (
        search === undefined ? EMPTY_SEARCH : Object.freeze(search)
      ) as S;
    } else {
      const bags: ChannelBags = { params: undefined, search: undefined };

      routeDefaultsByChannel(
        hasDefaultParams ? defaultParamsConfig[name] : undefined,
        queryNames,
        params,
        bags,
      );
      routeCallerParamsByChannel(params, queryNames, search, bags);

      mergedParams = (
        bags.params === undefined ? EMPTY_PARAMS : Object.freeze(bags.params)
      ) as P;
      mergedSearch = sealSearchChannel(bags.search, search) as S;
    }

    const state = {
      name,
      params: mergedParams,
      // Query channel (RFC-4 M2 / #1548): canonical after the channel routing
      // above — declared query names (defaults included) live here, never in
      // `params`.
      search: mergedSearch,
      path: path ?? this.#deps.buildPath(name, params, search),
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
 * Lazily-allocated output bags of the #1549 channel routing — `undefined`
 * until a key actually lands in the channel, so an untouched channel reuses
 * its frozen empty singleton.
 */
interface ChannelBags {
  params: Record<string, unknown> | undefined;
  search: Record<string, unknown> | undefined;
}

/**
 * Routes a route's `defaultParams` into the channel each key's declaration
 * owns (#1549): a params-given value overwrites its default (same-channel
 * override), a query-declared default joins the search bag, and every other
 * default keeps its v1 home in params. A search-given key never suppresses a
 * params-channel default — the channels are independent (`/coll/:id?id`:
 * `search.id` is the query twin, not the path slot); a query-declared default
 * defers to an explicit `search` value later, via `sealSearchChannel`'s spread
 * order.
 */
function routeDefaultsByChannel(
  defaults: Params | undefined,
  queryNames: readonly string[],
  params: Params | undefined,
  bags: ChannelBags,
): void {
  for (const key in defaults) {
    if (
      !Object.hasOwn(defaults, key) ||
      (params !== undefined && Object.hasOwn(params, key))
    ) {
      continue;
    }

    if (queryNames.includes(key)) {
      bags.search ??= {};
      bags.search[key] = defaults[key];
    } else {
      bags.params ??= {};
      bags.params[key] = defaults[key];
    }
  }
}

/**
 * Routes the caller's params bag by declaration (#1549): a declared query name
 * belongs to the search channel (an explicit `search` value wins over it);
 * everything else stays in params.
 */
function routeCallerParamsByChannel(
  params: Params | undefined,
  queryNames: readonly string[],
  search: SearchParams | undefined,
  bags: ChannelBags,
): void {
  for (const key in params) {
    if (!Object.hasOwn(params, key)) {
      continue;
    }

    if (!queryNames.includes(key)) {
      bags.params ??= {};
      bags.params[key] = params[key];
      continue;
    }

    if (search === undefined || !Object.hasOwn(search, key)) {
      bags.search ??= {};
      bags.search[key] = params[key];
    }
  }
}

/**
 * Seals the search channel: merges the routed extras under the explicit
 * `search` bag (an explicit value wins) and freezes the result; with no extras
 * the input is frozen as-is, and an absent input reuses the shared frozen
 * EMPTY_SEARCH singleton (#1027).
 */
function sealSearchChannel(
  extra: Record<string, unknown> | undefined,
  search: SearchParams | undefined,
): SearchParams {
  if (extra !== undefined) {
    // Boundary cast (like splitParamsBySearch's): routed keys carry query
    // values typed loosely as unknown.
    return Object.freeze({ ...extra, ...search }) as SearchParams;
  }

  return search === undefined ? EMPTY_SEARCH : Object.freeze(search);
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
