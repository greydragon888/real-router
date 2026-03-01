// packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts

import { errorCodes } from "../../constants";
import { RouterError } from "../../RouterError";

import type { RouterLifecycleDependencies } from "./types";
import type { NavigationOptions, State } from "@real-router/types";

// ═══════════════════════════════════════════════════════════════════════════════
// CYCLIC DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════
// RouterLifecycle → Navigation.navigateToState() (for start transitions)
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

  // Dependencies injected via setDependencies (replaces full router reference)
  #navigateToState!: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => Promise<State>;

  #deps!: RouterLifecycleDependencies;

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
   * Sets the navigateToState reference (cyclic dependency on NavigationNamespace).
   * Must be called before using start().
   */
  setNavigateToState(
    fn: (
      toState: State,
      fromState: State | undefined,
      opts: NavigationOptions,
    ) => Promise<State>,
  ): void {
    this.#navigateToState = fn;
  }

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

    const startOptions: NavigationOptions = {
      replace: true,
    };

    const matchedState = deps.matchPath(startPath);

    if (!matchedState && !options.allowNotFound) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        path: startPath,
      });

      deps.emitTransitionError(undefined, undefined, err);

      throw err;
    }

    deps.completeStart();

    let finalState: State;

    if (matchedState) {
      finalState = await this.#navigateToState(
        matchedState,
        undefined,
        startOptions,
      );
    } else {
      const notFoundState = deps.makeNotFoundState(startPath);

      finalState = await this.#navigateToState(
        notFoundState,
        undefined,
        startOptions,
      );
    }

    return finalState;
  }

  /**
   * Stops the router and resets state.
   *
   * Called only for READY/TRANSITIONING states (facade handles STARTING/IDLE/DISPOSED).
   */
  stop(): void {
    this.#deps.clearState();
  }
}
