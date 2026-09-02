// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import { assertShippedChannelCorrect } from "../../channels";
import { EMPTY_PARAMS } from "../../constants";
import { recordsShallowEqual, slotsShallowEqual } from "../../helpers";
import { buildURL, canonicalize, materialize } from "../../pipeline";

import type { StateNamespaceDependencies } from "./types";
import type { RouterFSMContext } from "../../routerFSM";
import type { Params, SearchParams, State } from "../../types";

/**
 * State SERVICE — no longer the owner of the state.
 *
 * The two cells live in the FSM context (plan §11.A2); this class keeps a
 * PRIVATE reference to it and reads through that rather than calling
 * `fsm.getContext()` per read. The form was chosen by measurement, not taste:
 * own field 569 ps, private ref 1.98 ns, `fsm.getContext()` 2.39 ns, port hop
 * 2.58 ns — and these reads sit on the render path, where `isActiveRoute` for
 * an inactive link costs ~33 ns in total.
 *
 * What stays here is the SERVICE half — `makeState` and `areStatesEqual` — which
 * never touched the cells: the two halves shared a class name and nothing else
 * (measured: the members' intersection is empty).
 */
export class StateNamespace {
  /**
   * The machine's context — the actual home of `current` / `previous`.
   * Assigned once, right after the FSM exists; nothing reads state before that.
   */
  #ctx!: RouterFSMContext;

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
    return this.#ctx.current as State<P> | undefined; // NOSONAR -- generic narrowing needed for public API
  }

  /**
   * Returns the previous router state (before the last navigation).
   */
  getPrevious(): State | undefined {
    return this.#ctx.previous;
  }

  /**
   * Hand the service its context. Separate from construction because the
   * namespace is built before the FSM exists — same shape as `setDependencies`.
   */
  setContext(ctx: RouterFSMContext): void {
    this.#ctx = ctx;
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
   * `params` is frozen at creation so it is always immutable, including on the
   * pending form that defers the outer `Object.freeze(state)` call. This keeps
   * params-freezing invariants independent of transition-pipeline mutation
   * (e.g. `completeTransition` overwriting `state.transition`).
   *
   * **The LITERAL form of the pipeline** (nav-pipeline Phase 4). ONE terminal
   * for one rule, and that is load-bearing rather than tidy: a sweep of
   * `canonicalize`'s PORT consumers cannot see a method that reads its own
   * dependency bag, so a second canonicalisation here would be invisible to
   * exactly the audits that maintain the first (#1584). It IS
   * `canonicalize(…, { resolveForward: false })` — the same form
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
    // Stages ③ + the mode gate come from the ONE implementation
    // (`canonicalize`); there is no second copy here. `resolveForward: false` is the
    // whole difference from `navigate`'s form, and it is this method's contract:
    // the route NAMED is the route answered about.
    const port = this.#deps.port();
    const canonical = canonicalize(port, name, params ?? EMPTY_PARAMS, search, {
      resolveForward: false,
    });

    // ⑤a only when the caller did not supply the URL, and it is built from the
    // SAME canonical intent the state is materialised from — which is what keeps
    // `state.path` in step with `state.search` for a caller that passes no path
    // (`canNavigateTo`, `isActiveRoute`).
    //
    // ⚠ This door reaches NO seam, on either arm (#1938). It is `canonicalize`'s
    // literal form, and its one production caller restores a state from popstate
    // rather than resolving an intent — `seam-coverage-authority-1938` owns the
    // two rows.
    //
    // ⚠ No pending arm: this method's own `skipFreeze` parameter died when
    // Phase 2 moved the two callers that used it (`canNavigateTo`,
    // `isActiveRoute`) onto the pipeline primitive directly, and the old body
    // hid the death because it forwarded `undefined` into a slot that needs no
    // branch. That primitive is `materializePending` since #1976.
    // The public `PluginApi.makeState` type has four parameters and both call
    // sites pass four; unfreezing a state is the transition pipeline's business,
    // reached through `materialize`, not through this primitive. Coverage is
    // what surfaced it — the same way it caught `deps.makeState` and
    // `paramsMatchExcluding` when Phase 2 migrated their last consumers.
    assertShippedChannelCorrect(
      "makeState",
      canonical.name,
      canonical.path,
      port.queryNames(canonical.name),
    );

    return materialize<P, S>(canonical, path ?? buildURL(canonical, port));
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

    // ⚑ ONE read of the caller's name (#2085). Both operands are the
    // caller's, and this slot decides TWO things: whether the states name the
    // same route, and — below — which slot set to compare them on. Asked
    // twice, the second answer picks the slots of a route neither state
    // carries, leaving nothing to differ on.
    const name1 = state1.name;

    if (name1 !== state2.name) {
      return false;
    }

    if (ignoreQueryParams) {
      // URL (path) param names are cached at the routes layer and invalidated
      // on every tree mutation, so this stays correct after replace() (#723).
      return slotsShallowEqual(
        state1.params,
        state2.params,
        this.#deps.getUrlParams(name1),
      );
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
