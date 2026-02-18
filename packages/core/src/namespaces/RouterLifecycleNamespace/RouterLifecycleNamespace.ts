// packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts

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
 * Handles start() and stop(). Lifecycle state (isActive, isStarted) is managed
 * by RouterFSM in the facade (Router.ts).
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
   * Starts the router with the given path.
   *
   * Guards (concurrent start, already started) are handled by the facade via
   * RouterFSM state checks before this method is called.
   */
  async start(startPath: string): Promise<State> {
    const deps = this.#deps;
    const options = deps.getOptions();

    // Base options for all operations in start() method
    const startOptions: NavigationOptions = {
      replace: true, // start() always replace history
    };

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

    // KEEP: triggers routerFSM.send("STARTED") → STARTING→READY via #handleEvent chain
    deps.invokeEventListeners(events.ROUTER_START);

    // KEEP: triggers transitionFSM.send("DONE") → RUNNING→IDLE via #handleEvent chain
    // (routerFSM.send("COMPLETE") is a no-op since FSM is already READY)
    deps.invokeEventListeners(
      events.TRANSITION_SUCCESS,
      finalState,
      undefined,
      {
        replace: true,
      },
    );

    return finalState;
  }

  /**
   * Stops the router and resets state.
   *
   * Called only for READY/TRANSITIONING states (facade handles STARTING/IDLE/DISPOSED).
   * Order: setState(undefined) → invokeEventListeners(ROUTER_STOP) → chain →
   *        routerFSM.send("STOP") → onTransition → observable.invoke(ROUTER_STOP)
   * State is cleared BEFORE ROUTER_STOP emission ✓
   */
  stop(): void {
    const deps = this.#deps;

    deps.setState();

    deps.invokeEventListeners(events.ROUTER_STOP);
  }
}
