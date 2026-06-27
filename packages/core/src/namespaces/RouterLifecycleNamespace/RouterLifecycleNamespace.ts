// packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts

import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

import type { RouterLifecycleDependencies } from "./types";
import type { NavigationOptions, State } from "@real-router/types";

const REPLACE_OPTS: NavigationOptions = { replace: true };

Object.freeze(REPLACE_OPTS);

/**
 * Independent namespace for managing router lifecycle.
 *
 * Handles start() and stop(). Lifecycle state (isActive, isStarted) is managed
 * by RouterFSM in the facade (Router.ts).
 */
export class RouterLifecycleNamespace {
  #deps!: RouterLifecycleDependencies;

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets dependencies for lifecycle operations.
   * Must be called before using lifecycle methods.
   */
  setDependencies(deps: RouterLifecycleDependencies): void {
    this.#deps = deps;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  /**
   * Starts the router with the given path.
   *
   * Guards (concurrent start, already started) are handled by the facade via
   * RouterFSM state checks before this method is called.
   */
  async start(startPath: string): Promise<State> {
    const deps = this.#deps;
    const options = deps.getOptions();

    // Invariant guard (#939): core is platform-agnostic, so the caller must
    // provide a string path. Without a browser-plugin start interceptor to
    // inject a location, a non-string `startPath` (e.g. `start(undefined)`)
    // would otherwise reach matchPath() and throw a cryptic, code-less
    // `TypeError: …codePointAt` deep inside path-matcher. This guard runs AFTER
    // the interceptor chain (browser-plugin substitutes the location upstream),
    // so it only fires when nothing supplied a path — turning the cryptic crash
    // into an actionable error. Symmetric with the subscribe / navigateToNotFound
    // type guards; the validator deliberately permits `undefined` at the facade
    // for exactly the browser-plugin-override case.
    if (typeof startPath !== "string") {
      throw new TypeError(
        `[router.start] path must be a string, got ${typeof startPath}`,
      );
    }

    const matchedState = deps.matchPath(startPath);

    if (!matchedState && !options.allowNotFound) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        path: startPath,
      });

      deps.emitTransitionError(undefined, undefined, err);

      throw err;
    }

    deps.completeStart();

    if (matchedState) {
      // navigateToState commits matchedState verbatim — same primitive URL
      // plugins use on popstate / navigate-event (#525). Keeps trailing-slash
      // and any other source-URL flavor that matchPath produced; skips the
      // redundant forwardState+buildPath round-trip in buildNavigateState.
      return deps.navigateToState(matchedState, REPLACE_OPTS);
    }

    return deps.navigateToNotFound(startPath);
  }

  /**
   * Stops the router and resets state.
   *
   * Called only for READY/TRANSITION_STARTED states (facade handles STARTING/IDLE/DISPOSED).
   */
  stop(): void {
    this.#deps.clearState();
  }
}
