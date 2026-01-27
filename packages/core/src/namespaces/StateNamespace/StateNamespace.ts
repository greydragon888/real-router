// packages/core/src/namespaces/StateNamespace/StateNamespace.ts

import { validateState } from "type-guards";

import { freezeStateInPlace } from "../../helpers";

import type { Params, State } from "@real-router/types";

/**
 * Independent namespace for managing router state storage.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle state storage and freezing.
 * Note: State building methods (makeState, buildState) remain in Router
 * due to dependencies on route tree, config, and path building.
 */
export class StateNamespace {
  /**
   * Auto-incrementing state ID for tracking navigation history.
   */
  #stateId = 0;

  /**
   * Cached frozen state - avoids structuredClone on every getState() call.
   */
  #frozenState: State | undefined = undefined;

  /**
   * Previous state before the last setState call.
   */
  #previousState: State | undefined = undefined;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates state structure.
   * Called by facade before setState.
   */
  static validateState(state: unknown): asserts state is State {
    validateState(state, "router.setState");
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Returns the current router state.
   *
   * The returned state is deeply frozen (immutable) for safety.
   * Returns `undefined` if the router has not been started or has been stopped.
   */
  get<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#frozenState as State<P, MP> | undefined;
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
    if (!state) {
      this.#frozenState = undefined;
    } else if (Object.isFrozen(state)) {
      // State is already frozen (typically from makeState)
      this.#frozenState = state;
    } else {
      // External state - freeze in place without cloning.
      this.#frozenState = freezeStateInPlace(state);
    }
  }

  /**
   * Returns the previous router state (before the last navigation).
   */
  getPrevious<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#previousState as State<P, MP> | undefined;
  }

  /**
   * Generates the next state ID.
   */
  nextId(): number {
    return ++this.#stateId;
  }

  /**
   * Gets the current state ID without incrementing.
   */
  getCurrentId(): number {
    return this.#stateId;
  }

  /**
   * Resets state to initial values (for router stop/restart).
   */
  reset(): void {
    this.#frozenState = undefined;
    this.#previousState = undefined;
    // Note: stateId is NOT reset to maintain unique IDs across router lifecycles
  }
}
