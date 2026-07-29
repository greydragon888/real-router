// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import { EMPTY_PARAMS, EMPTY_SEARCH } from "../../constants";
import {
  admittedSearch,
  areParamValuesEqual,
  createStateObject,
  freezeStateInPlace,
  mergeWithDefault,
} from "../../helpers";

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
    // The route's OWN defaults are split by the channel the route DECLARES
    // (#1549), mirroring what #1570 does for a forwarding hop's defaults.
    // `defaultParams` is a v1 config's only default slot and stays legal for a
    // `?`-declared name, so a default spelled there for a query key belongs to
    // the query channel; `defaultSearch` is spread last and wins the collision.
    // Without this the key rode `state.params` while `state.path` never showed
    // it — and the always-on P3 guard then rejected core's OWN state on `start`.
    // Each slot IS its channel (see `pipeline/canonicalize`): the router does
    // not move a key between them, and a `defaultParams` naming a `?`-declared
    // key never gets registered in the first place.
    const routeDefaults = {
      params: routeDefaultParams,
      search: routeDefaultSearch,
    };

    const mergedParams = mergeWithDefault(
      routeDefaults.params,
      params,
      EMPTY_PARAMS,
    ) as P;
    const rawSearch = mergeWithDefault(
      routeDefaults.search,
      search,
      EMPTY_SEARCH,
    ) as S;
    // The mode gate (#1575): under `default` / `strict` the URL build prints
    // declared names only, so an undeclared key surviving here would sit in
    // `state.search` while `state.path` — built from this same bag below — could
    // never show it. Applied AFTER the default merge, so a `defaultSearch` for an
    // undeclared key is dead config in those modes rather than a way around the
    // rule. `loose` prints undeclared keys, so it short-circuits and pays nothing.
    const mergedSearch = this.#deps.admitsUndeclaredQuery()
      ? rawSearch
      : admittedSearch(rawSearch, this.#deps.getQueryParams(name), (key) => {
          this.#deps.getDropReporter()?.(name, key);
        });

    // Query channel (RFC-4 M2 / #1548): the input is already canonical
    // (separated upstream), so declared query names live in `search`, never in
    // `params`. The URL is built from the MERGED channels (not the raw args) so
    // a state built without an explicit path — canNavigateTo, isActiveRoute —
    // has `state.path` in step with `state.search`; buildPath re-applies the
    // same defaults idempotently. `createStateObject` is shared with
    // `pipeline/materialize` so both producers emit one state shape.
    return createStateObject(
      name,
      mergedParams,
      mergedSearch,
      path ?? this.#deps.buildPath(name, mergedParams, mergedSearch),
      skipFreeze,
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
