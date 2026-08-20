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
import {
  constants,
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  errorCodes,
} from "../../constants";
import { mergeWithDefault, normalizeParams } from "../../helpers";
import { RouterError } from "../../RouterError";

import type { NavigationDependencies, NotFoundOptions } from "./types";
import type {
  NavigationOptions,
  Params,
  SearchParams,
  State,
} from "../../types";

/**
 * The navigation entry points, their fire-and-forget checkpoint and the DI bag —
 * and NO per-navigation state: the controller is a field of the plan the machine
 * carries (#1684), the supersession token is the plan's identity (#1664).
 *
 * Performance: navigate() runs optimistically synchronously — guards run inline
 * until one returns a Promise — so the common case pays for no Promise and no
 * AbortController.
 */
export class NavigationNamespace {
  #deps!: NavigationDependencies;
  #onSuppressed!: (error: unknown) => void;

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
   * Exactly two stretches raise `#preparingDepth`, and both run application code
   * before `TRANSITION_START`: `buildNavigateState` (the `forwardState` and
   * `buildPath` interceptor chains, a dynamic `forwardTo`, a route's
   * `encodeParams` — but NOT `decodeParams`, which serves the URL→state
   * direction and prepares no navigation) and `resolveDefault` (each of the
   * three default options may be a dependency-resolved callback). Everything
   * else before the announce is core's own code, except `abortPreviousNavigation`'s
   * `CANCEL` emit, which the dispatch depth covers already. That depth is why
   * the reentrancy ban missed this window: it keys off the emitter, and there
   * has been no emit yet.
   *
   * A DEPTH raised inline, not a boolean set by a wrapper: the wrapper allocated
   * a closure per navigation on the #307 hot path. Each site lowers it in a
   * `finally`, because the early refusals exit through this window too
   * (`ROUTE_NOT_FOUND`, `WRONG_CHANNEL`, any throw from user code) and a marker
   * left raised deadlocks the router against its own next call.
   *
   * Read by `Router.#assertNotReentrant` beside `EventBus.isProcessing()`;
   * between them they span every window where application code runs inside a
   * navigation core has not finished setting up. A GUARD is deliberately in
   * neither: it runs after the announce, so a guard-redirect stays a supersede.
   *
   * Interim form — pre-start becoming a STATE of the machine absorbs it, and a
   * nested navigation is then an ordinary supersede needing no marker.
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
      // Live region, covered: the always-on channel guard (#1572) throws from
      // core's own `buildNavigateState`, so this is not a validator-only path.
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
      // Boot-window sentence, as in `#navigate` above (#1647).
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
    // ⚑ Each channel read ONCE and committed as core's OWN copy (#1792). The
    // argument is a State a PLUGIN built, so its bags belong to the caller: the
    // shell used to carry them by reference, which left the committed
    // `state.search` writable through a reference the plugin still held, and any
    // later mutation landed in the committed state. The copy also runs the
    // define-safe path, so `__proto__` cannot ride in through this door either.
    const givenParams = state.params;
    const givenSearch = state.search;

    const writableState = {
      name: state.name,
      params: mergeWithDefault(
        undefined,
        normalizeParams(givenParams),
        EMPTY_PARAMS,
        true,
      ) as Params,
      // Carry the query channel through the writable shell (RFC-4 M2 / #1548) —
      // without this, start()'s navigateToState(matchPath(...)) would drop the
      // matched query from the committed state.
      search: mergeWithDefault(
        undefined,
        givenSearch,
        EMPTY_SEARCH,
      ) as SearchParams,
      path: state.path,
      context: { ...state.context },
    } as State;

    // No route-meta to carry: ownership is read from the live matcher by
    // `state.name` (`getTransitionPath`'s `getMeta`), so object identity does
    // not decide which path a state takes (RFC-4 M2 / #1548).

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

    // Both channels, never one bag (RFC-4 M2 / #1548): passing the query here is
    // what makes the default route's query defaults independent of the
    // `forwardState` seam, which used to re-separate them.
    return this.#navigate(route, params, search, opts);
  }
}
