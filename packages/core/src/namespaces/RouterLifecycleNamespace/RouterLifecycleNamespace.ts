// packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts

import { CACHED_ALREADY_STARTED_ERROR } from "./constants";
import { errorCodes, events } from "../../constants";
import { RouterError } from "../../RouterError";

import type { RouterLifecycleDependencies } from "./types";
import type { NavigationOptions, State } from "@real-router/types";

// ═══════════════════════════════════════════════════════════════════════════════
// CYCLIC DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════
// RouterLifecycle → Navigation.navigateToState() (for start transitions)
// RouterLifecycle → Navigation.isNavigating() (check before stop)
//
// Solution: functional references configured in Router.#setupDependencies()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Independent namespace for managing router lifecycle.
 *
 * Handles start(), stop(), isStarted(), and isActive().
 */
export class RouterLifecycleNamespace {
  // ═══════════════════════════════════════════════════════════════════════════
  // Functional references for cyclic dependencies
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Functional reference to NavigationNamespace.navigateToState().
   * Must be set before calling start().
   */

  navigateToState!: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    emitSuccess: boolean,
  ) => Promise<State>;

  #started = false;
  #active = false;

  // Dependencies injected via setDependencies (replaces full router reference)
  #depsStore: RouterLifecycleDependencies | undefined;

  /**
   * Gets dependencies or throws if not initialized.
   */
  get #deps(): RouterLifecycleDependencies {
    /* v8 ignore next 3 -- @preserve: deps always set by Router.ts */
    if (!this.#depsStore) {
      throw new Error(
        "[real-router] RouterLifecycleNamespace: dependencies not initialized",
      );
    }

    return this.#depsStore;
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates start() arguments.
   */
  static validateStartArgs(args: unknown[]): void {
    /* v8 ignore next 4 -- @preserve: facade enforces 1 arg via TypeScript signature */
    if (args.length !== 1 || typeof args[0] !== "string") {
      throw new Error(
        "[router.start] Expected exactly 1 string argument (startPath).",
      );
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets dependencies for lifecycle operations.
   * Must be called before using lifecycle methods.
   */
  setDependencies(deps: RouterLifecycleDependencies): void {
    this.#depsStore = deps;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  /**
   * Checks if the router has completed its initial start.
   */
  isStarted(): boolean {
    return this.#started;
  }

  /**
   * Checks if the router is starting or started (allows transitions).
   * Used by transition to check if transitions should be cancelled.
   */
  isActive(): boolean {
    return this.#active;
  }

  /**
   * Starts the router with the given path.
   */
  async start(startPath: string): Promise<State> {
    const deps = this.#deps;
    const options = deps.getOptions();

    // Early return if already started or starting (concurrent start() protection)
    // Issue #50: Check both isStarted() and isActive() to block concurrent start() calls
    // - isStarted(): Router has completed initial start
    // - isActive(): Router is in the process of starting (async transition in progress)
    // Performance: Uses cached error to avoid object allocation (~500ns-2μs saved)
    if (this.#started || this.#active) {
      throw CACHED_ALREADY_STARTED_ERROR;
    }

    // Issue #50: Mark router as active BEFORE attempting transition
    // This allows the transition to proceed (isCancelled() checks isActive())
    this.#active = true;

    // Base options for all operations in start() method
    const startOptions: NavigationOptions = {
      replace: true, // start() always replace history
    };

    try {
      const matchedState = deps.matchPath(startPath);

      let finalState: State;

      if (matchedState) {
        finalState = await this.navigateToState(
          matchedState,
          undefined,
          startOptions,
          false, // emitSuccess = false - we will emit below
        );
      } else if (options.allowNotFound) {
        const notFoundState = deps.makeNotFoundState(startPath, startOptions);

        finalState = await this.navigateToState(
          notFoundState,
          undefined,
          startOptions,
          false, // emitSuccess = false - we will emit below
        );
      } else {
        const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          path: startPath,
        });

        if (deps.hasListeners(events.TRANSITION_ERROR)) {
          deps.invokeEventListeners(
            events.TRANSITION_ERROR,
            undefined,
            undefined,
            err,
          );
        }

        throw err;
      }

      // Two-phase start: Only set started and emit ROUTER_START on success
      // See: https://github.com/greydragon888/real-router/issues/50
      this.#started = true;
      deps.invokeEventListeners(events.ROUTER_START);

      // Note: ROUTER_START above triggers routerFSM STARTING→READY, which already
      // emits TRANSITION_SUCCESS via routerFSM.onTransition. This second invocation
      // is a no-op for emission (routerFSM ignores COMPLETE from READY), but it is
      // needed to transition transitionFSM from RUNNING→IDLE via the DONE event.
      deps.invokeEventListeners(
        events.TRANSITION_SUCCESS,
        finalState,
        undefined,
        {
          replace: true,
        },
      );

      return finalState;
    } catch (error) {
      // Issue #50: Unset active flag on failure (router is no longer starting)
      this.#active = false;

      throw error;
    }
  }

  /**
   * Stops the router and resets state.
   */
  stop(): void {
    const deps = this.#deps;

    // Issue #50: Always unset active flag when stopping
    // This cancels any in-flight transitions via isCancelled() check
    this.#active = false;

    if (this.#started) {
      this.#started = false;

      deps.setState();

      deps.invokeEventListeners(events.ROUTER_STOP);
    }
  }
}
