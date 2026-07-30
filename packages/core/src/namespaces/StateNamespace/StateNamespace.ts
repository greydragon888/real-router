// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import { EMPTY_PARAMS } from "../../constants";
import { areParamValuesEqual, freezeStateInPlace } from "../../helpers";
import { buildURL, canonicalize, materialize } from "../../pipeline";

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
   * **The LITERAL form of the pipeline** (nav-pipeline Phase 4). This method
   * used to carry its own copy of stage ③ (merge each channel's route default
   * UNDER the caller's value) and of the mode gate — a second, parallel
   * canonicalisation living outside `src/pipeline`. Two terminals for one rule
   * is not a style problem: #1584's existence precondition landed on the
   * pipeline's terminal and NOT on this one, because it was found by sweeping
   * `canonicalize`'s PORT consumers, and this method read its own dependency
   * bag. It now IS `canonicalize(…, { resolveForward: false })` — the same form
   * `buildPath` and `isActiveRoute`'s literal arm take, which is exactly this
   * method's documented contract: `forwardTo` is not resolved (`makeState("src")`
   * stays on `"src"`) but the NAMED route's defaults are applied (forwardState
   * invariants #7/#8).
   *
   * ⚠ The literal form also applies `withholdFilledSlots` (a query default is
   * declined for a `?`-declared slot the caller filled in the PARAMS bag). That
   * is unreachable here rather than new behaviour: the only door to this method
   * is `PluginApi.makeState`, which runs the P1 channel guard first
   * (`getPluginApi.ts` → `throwOnMisChanneledKey`) on the SAME predicate — own
   * key, defined value, `?`-declared — so the bag that would trigger the
   * withholding is refused before it arrives. Verified by a 71-cell before/after
   * snapshot, not by reading.
   *
   * `context` is initialized as a fresh empty object — intentionally NOT frozen
   * so plugins can publish data via `claim.write(state, value)` after creation.
   */
  makeState<P extends Params = Params, S extends SearchParams = SearchParams>(
    name: string,
    params?: P,
    search?: S,
    path?: string,
  ): State<P, S> {
    // Stages ③ + the mode gate, from the ONE implementation (`canonicalize`) —
    // this method no longer carries its own. `resolveForward: false` is the
    // whole difference from `navigate`'s form, and it is this method's contract:
    // the route NAMED is the route answered about.
    const port = this.#deps.port();
    const canonical = canonicalize(port, name, params ?? EMPTY_PARAMS, search, {
      resolveForward: false,
    });

    // ⑤a only when the caller did not supply the URL. `buildURL` prints through
    // `port.buildPath` — the interceptable `ctx.buildPath` this method already
    // used — so the interceptor zone is unchanged, and the URL is built from the
    // SAME canonical intent the state is materialised from, which is what keeps
    // `state.path` in step with `state.search` for a caller that passes no path
    // (`canNavigateTo`, `isActiveRoute`).
    //
    // ⚠ No `skipFreeze` arm: the parameter died when Phase 2 moved the two
    // callers that used it (`canNavigateTo`, `isActiveRoute`) onto
    // `materialize({ skipFreeze: true })` directly, and the old body hid the
    // death because it forwarded `undefined` into a slot that needs no branch.
    // The public `PluginApi.makeState` type has four parameters and both call
    // sites pass four; unfreezing a state is the transition pipeline's business,
    // reached through `materialize`, not through this primitive. Coverage is
    // what surfaced it — the same way it caught `deps.makeState` and
    // `paramsMatchExcluding` when Phase 2 migrated their last consumers.
    return materialize<P, S>(canonical, {
      path: path ?? buildURL(canonical, port),
    });
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
