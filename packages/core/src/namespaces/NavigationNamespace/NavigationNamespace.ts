import {
  CACHED_NOT_STARTED_REJECTION,
  CACHED_PRE_BOOT_COMMIT_REJECTION,
  CACHED_ROUTE_NOT_FOUND_ERROR,
  CACHED_ROUTE_NOT_FOUND_REJECTION,
  isExpectedRejection,
  PRE_SUPPRESSED,
} from "./constants";
import { executeNavigation } from "./transition/executeNavigation";
import { navigateToNotFound } from "./transition/navigateToNotFound";
import { findMisChanneledKey, misChanneledKeyMessage } from "../../channels";
import { errorCodes, constants } from "../../constants";
import { RouterError } from "../../RouterError";

import type { NavigationDependencies, NotFoundOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  SearchParams,
  State,
} from "../../types";

/**
 * Independent namespace for managing navigation.
 *
 * Handles navigate(), navigateToDefault(), navigateToNotFound(), and transition state.
 *
 * Performance: navigate() uses optimistic sync execution — guards run synchronously
 * until one returns a Promise, then switches to async. This eliminates Promise/AbortController
 * overhead for the common case (no guards or sync guards).
 */
export class NavigationNamespace {
  #deps!: NavigationDependencies;
  #onSuppressed!: (error: unknown) => void;
  // ⚑ No controller slot here any more (#1684). This namespace held the
  // `AbortController` of the navigation in flight at router level — one slot
  // outliving every navigation — and the machine held the navigation. Two
  // owners for one fact, and the slot was released BEFORE the commit on every
  // synchronous arc, so the FSM `CANCEL` action found it empty. The controller
  // is a field of the navigation now (`NavigationContext.controller`), which
  // the machine already carries as `ctx.inflight`: ownership is transitive and
  // there is nothing left to keep in step. Retired the same way #1664 retired
  // the supersession token that used to sit beside it.

  // Depth of the PRE-START window — see `#prepare`. Interim form of what
  // becomes a machine state in the state-ownership plan (§10, phase 4).
  #preparingDepth = 0;

  // =========================================================================
  // Dependency injection
  // =========================================================================

  setDependencies(deps: NavigationDependencies): void {
    this.#deps = deps;
    // Built once here rather than per call: the closure needs THIS router's
    // logger, so it cannot be static, and `setDependencies` is a pure
    // assignment that runs exactly once at wiring (#1331).
    this.#onSuppressed = (error: unknown): void => {
      if (isExpectedRejection(error)) {
        return;
      }

      deps.logger.error(
        "router.navigate",
        "Unexpected navigation error",
        error,
      );
    };
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  navigate(
    name: string,
    params: Params,
    search: SearchParams | undefined,
    opts: NavigationOptions,
  ): State | Promise<State> {
    return this.#settle(this.#navigate(name, params, search, opts));
  }

  /**
   * Navigate to a fully-built `State` directly, skipping `buildNavigateState`
   * (forwardState + buildPath + meta lookup). Used by URL plugins after they
   * have already produced a `State` from a browser-initiated event via
   * `api.matchPath(url)` — see issue #525.
   *
   * Semantics vs. `navigate(name, params, opts)`:
   * - `forwardState` is NOT re-applied. matchPath already runs it; reapplying
   *   is redundant in the idempotent case and can race in the dynamic case.
   * - `buildPath` is NOT re-run. The caller's `state.path` is used as-is —
   *   so `trailingSlash:"preserve"` matchedState paths flow through unchanged
   *   (closes #525 Q2). `buildPath` interceptors do NOT run; the URL the
   *   user navigated to is the source of truth for this code path.
   * - All other pipeline steps run unchanged: SAME_STATES check, FSM
   *   transition, guards, `subscribeLeave`, `completeTransition`,
   *   plugin lifecycle hooks.
   */
  navigateToState(
    state: State,
    opts: NavigationOptions,
  ): State | Promise<State> {
    return this.#settle(this.#navigateToState(state, opts));
  }

  navigateToDefault(opts: NavigationOptions): State | Promise<State> {
    return this.#settle(this.#navigateToDefault(opts));
  }

  navigateToNotFound(path: string, opts?: NotFoundOptions): State {
    return navigateToNotFound(this.#deps, path, opts);
  }

  /**
   * Is a navigation between its entry point and its announce — the PRE-START
   * window (#1610)?
   *
   * Two stretches raise `#preparingDepth`, and both are application code running
   * before `TRANSITION_START`: `buildNavigateState` (the `forwardState` and
   * `buildPath` interceptor chains plus the route's own codecs) and
   * `resolveDefault` (`defaultRoute` / `defaultParams` / `defaultSearch` may
   * each be a dependency-resolved callback). That is precisely why the
   * reentrancy ban did not reach them: `Router.#assertNotReentrant` keys off the
   * emitter's dispatch depth, and there has been no emit yet — so a nested
   * `navigate()` ran to completion here, committing a state the outer navigation
   * overwrote a tick later and leaving the outer transition to report departing
   * from wherever the nested one had stopped.
   *
   * Those two calls are the whole window. Everything after them and before the
   * announce is core's own code, except the `CANCEL` emit inside
   * `abortPreviousNavigation` — which the dispatch depth already covers.
   *
   * A DEPTH rather than a boolean, raised inline rather than through a wrapper
   * taking a callback: the wrapper allocated a closure per navigation on the
   * #307 hot path, and the depth makes the two sites' relationship a
   * non-question (they are sequential today, and nesting would be safe anyway).
   * Each site lowers it in a `finally`, because every exit has to — the early
   * refusals live in this same window (`ROUTE_NOT_FOUND` when no state comes
   * back, `WRONG_CHANNEL` from the always-on channel guard, any throw from user
   * code), and a marker left raised deadlocks the router against its own next
   * call.
   *
   * Read by `Router.#assertNotReentrant` alongside `EventBus.isProcessing()`;
   * between them they span every window in which application code runs inside a
   * navigation core has not finished setting up. A GUARD is deliberately
   * neither: it runs after the announce, so the guard-redirect stays a supersede.
   *
   * ⚠ Interim form. It is absorbed by pre-start becoming a STATE of the machine
   * — then a nested navigation is an ordinary supersede for the table and needs
   * no marker at all. See `packages/core/.claude/fsm-as-state-owner-2026-07-31.md`
   * §8 (why that is 10b and not 10a) and the plan in §10, phase 4.
   */
  isPreparing(): boolean {
    return this.#preparingDepth > 0;
  }

  /**
   * The producer's own fire-and-forget guarantee (#721): whatever leaves a
   * public method here is safe to drop on the floor.
   *
   * ONE checkpoint per public method, deliberately — not a `.catch()` at each of
   * the six return sites. A forgotten site is invisible until it leaks, which is
   * the bug this replaces; a single choke point cannot be forgotten. And the
   * discriminator is the returned VALUE's identity, not a flag the facade reads
   * afterwards: `PRE_SUPPRESSED` promises already carry a module-load handler, so
   * re-suppressing them buys nothing and costs a derived promise.
   *
   * A synchronously-returned `State` needs nothing at all — there is no rejection
   * to suppress, which is precisely what makes `lastSyncResolved` unnecessary:
   * the TYPE now carries what the flag used to announce.
   */
  #settle(result: State | Promise<State>): State | Promise<State> {
    if (result instanceof Promise && !PRE_SUPPRESSED.has(result)) {
      result.catch(this.#onSuppressed);
    }

    return result;
  }

  /**
   * `navigate`'s body, minus the fire-and-forget checkpoint.
   *
   * Split out because `navigateToDefault` delegates HERE, not to the public
   * method: routing it through `navigate` would run `#settle` twice per default
   * navigation and attach a second, pointless `.catch()` — an extra derived
   * promise on a path that has none today.
   */
  #navigate(
    name: string,
    params: Params,
    search: SearchParams | undefined,
    opts: NavigationOptions,
  ): State | Promise<State> {
    const deps = this.#deps;

    // Fast-path sync rejections: cached error + cached Promise.reject.
    // No allocations, no throw/catch overhead; `#settle` recognises the
    // singleton by identity and skips its `.catch()`.
    if (!deps.canNavigate()) {
      // The boot WINDOW gets its own sentence (#1647): the bare code reads as
      // "you forgot to call start()" while the caller is inside start() — a
      // start interceptor navigating before `next()`. Selected here rather than
      // refused on the facade, because the refusal is already decided one line
      // up and the boot itself never lands in this branch.
      return deps.isStarting()
        ? CACHED_PRE_BOOT_COMMIT_REJECTION
        : CACHED_NOT_STARTED_REJECTION;
    }

    let toState: State | undefined;

    // PRE-START window (#1610) — user code runs in here, before any emit. See
    // `isPreparing`. The `finally` is load-bearing: the early refusals exit
    // through it too.
    this.#preparingDepth++;

    try {
      toState = deps.buildNavigateState(name, params, search);
    } catch (error) {
      // No `v8 ignore` here any more: the comment that used to sit above this
      // line claimed the path was "reachable only via validator-driven throws
      // … covered in @real-router/validation-plugin's suite, not in core", and
      // that stopped being true when the always-on channel guard (#1572) began
      // throwing from core's own `buildNavigateState`. Measured: with the ignore
      // removed, core's suite still reports 100% — it was masking a live region.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from user-provided buildNavigateState
      return Promise.reject(error);
    } finally {
      this.#preparingDepth--;
    }

    if (!toState) {
      deps.emitTransitionError(
        undefined,
        deps.getState(),
        CACHED_ROUTE_NOT_FOUND_ERROR,
      );

      return CACHED_ROUTE_NOT_FOUND_REJECTION;
    }

    return executeNavigation(this.#deps, toState, opts);
  }

  #navigateToState(
    state: State,
    opts: NavigationOptions,
  ): State | Promise<State> {
    const deps = this.#deps;

    if (!deps.canNavigate()) {
      // The boot WINDOW gets its own sentence (#1647): the bare code reads as
      // "you forgot to call start()" while the caller is inside start() — a
      // start interceptor navigating before `next()`. Selected here rather than
      // refused on the facade, because the refusal is already decided one line
      // up and the boot itself never lands in this branch.
      return deps.isStarting()
        ? CACHED_PRE_BOOT_COMMIT_REJECTION
        : CACHED_NOT_STARTED_REJECTION;
    }

    // Reject states whose route no longer exists (e.g. the route tree was
    // mutated between matchPath and navigateToState). UNKNOWN_ROUTE is
    // structurally legal — it is the navigateToNotFound output shape.
    if (state.name !== constants.UNKNOWN_ROUTE && !deps.hasRoute(state.name)) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        routeName: state.name,
      });

      deps.emitTransitionError(undefined, deps.getState(), err);

      // A FRESH reject (it carries `routeName`), so it is deliberately NOT in
      // `PRE_SUPPRESSED` and `#settle` will attach its `.catch()`. Adding it to
      // that set — the modern shape of the mistake that caused #721 — would skip
      // suppression on a promise nobody else handles and leak it.
      return Promise.reject(err);
    }

    // Channel guard, position P3 (#1572). `navigateToState` is the ONE producer
    // that takes a ready-made `State` instead of a `params` argument, so the
    // predicate reads `state.params ∩ queryNames(state.name)`. What it commits
    // becomes `getState()`, so a pre-M2 layout would be silent corruption: the
    // key sits in `state.params` and never reaches `state.path`.
    //
    // Costs nothing on healthy flows — a state produced by core (`matchPath`,
    // `makeState`) is channel-correct by construction, so the predicate is
    // empty on every popstate / memory-restore / SSR-hydration commit. `start()`
    // commits THROUGH here (`RouterLifecycleNamespace`), which is why the guard
    // lives in the namespace rather than on the plugin-API door.
    //
    // Rejects rather than throwing, mirroring the ROUTE_NOT_FOUND guard above:
    // this method returns `Promise<State>` and its URL-plugin callers invoke it
    // from popstate handlers, where a new synchronous throw would be a change
    // of failure shape rather than a new failure.
    const misChanneled = findMisChanneledKey(
      state.params,
      deps.getQueryParams(state.name),
    );

    if (misChanneled !== undefined) {
      const err = new RouterError(errorCodes.WRONG_CHANNEL, {
        routeName: state.name,
        message: `[router.navigateToState] ${misChanneledKeyMessage(
          state.name,
          misChanneled,
          "`state.params`",
        )}`,
      });

      deps.emitTransitionError(undefined, deps.getState(), err);

      return Promise.reject(err);
    }

    // States from `matchPath` are deeply frozen (`freezeStateShell`).
    // `completeTransition` mutates `toState.transition` and `context` is
    // intentionally extensible for plugin claim writes, so we hand the
    // pipeline a writable shell — same shape `makeState(skipFreeze=true)`
    // produces. `params` stays referentially shared (already frozen).
    // `transition` is omitted so completeTransition can assign it.
    const writableState = {
      name: state.name,
      params: state.params,
      // Carry the query channel through the writable shell (RFC-4 M2 / #1548) —
      // without this, start()'s navigateToState(matchPath(...)) would drop the
      // matched query from the committed state.
      search: state.search,
      path: state.path,
      context: { ...state.context },
    } as State;

    // No route-meta to carry any more (RFC-4 M2 / #1548): ownership is read from
    // the live matcher by `state.name` (`getTransitionPath`'s `getMeta`), not
    // from a per-State WeakMap. The former #1170 carry — which existed only so a
    // matchPath-derived writable shell stayed non-meta-less across consecutive
    // popstate navs — is obsolete: any state whose name is in the tree takes the
    // STANDARD PATH regardless of object identity.

    return executeNavigation(this.#deps, writableState, opts);
  }

  #navigateToDefault(opts: NavigationOptions): State | Promise<State> {
    const deps = this.#deps;
    const options = deps.getOptions();

    if (!options.defaultRoute) {
      return Promise.reject(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: "defaultRoute not configured",
        }),
      );
    }

    let route: string;
    let params: Params;
    let search: SearchParams;

    // PRE-START window too, and for the same reason (#1610): `defaultRoute` /
    // `defaultParams` / `defaultSearch` may each be a dependency-resolved
    // CALLBACK, so this runs user code before there is even a route name to
    // navigate to. Sequential with `#navigate`'s window below, never nested.
    this.#preparingDepth++;

    try {
      ({ route, params, search } = deps.resolveDefault());
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from user-provided resolveDefault callback
      return Promise.reject(error);
    } finally {
      this.#preparingDepth--;
    }

    if (!route) {
      return Promise.reject(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: "defaultRoute resolved to empty",
        }),
      );
    }

    // Both channels, never one bag (RFC-4 M2 / #1548). The query slot took
    // `undefined` until `defaultSearch` existed as a router option, so a
    // query-declared name in `defaultParams` reached the URL only via the
    // `forwardState` seam's channel re-separation — the repair the pipeline
    // design removes. Passing the query here makes the default route's query
    // defaults independent of that stage.
    //
    // Delegates to the PRIVATE core: the public `navigate` would run `#settle`
    // here and again in this method's own wrapper, costing a second `.catch()`
    // per default navigation.
    return this.#navigate(route, params, search, opts);
  }
}
