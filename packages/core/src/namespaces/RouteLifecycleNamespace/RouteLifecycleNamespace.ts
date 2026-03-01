// packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts

import { logger } from "@real-router/logger";
import { isBoolean, getTypeDescription } from "type-guards";

import { validateHandlerLimit, validateNotRegistering } from "./validators";
import { DEFAULT_LIMITS } from "../../constants";
import { computeThresholds } from "../../helpers";

import type { RouteLifecycleDependencies } from "./types";
import type { Router } from "../../Router";
import type { GuardFnFactory, Limits } from "../../types";
import type { DefaultDependencies, GuardFn, State } from "@real-router/types";

/**
 * Converts a boolean value to a guard function factory.
 * Used for the shorthand syntax where true/false is passed instead of a function.
 */
function booleanToFactory<Dependencies extends DefaultDependencies>(
  value: boolean,
): GuardFnFactory<Dependencies> {
  const guardFn: GuardFn = () => value;

  return () => guardFn;
}

/**
 * Independent namespace for managing route lifecycle handlers.
 *
 * Static methods handle input validation (called by facade).
 * Instance methods handle state-dependent validation, storage and business logic.
 */
export class RouteLifecycleNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly #canDeactivateFactories = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();
  readonly #canActivateFactories = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();
  readonly #canDeactivateFunctions = new Map<string, GuardFn>();
  readonly #canActivateFunctions = new Map<string, GuardFn>();

  readonly #registering = new Set<string>();
  readonly #definitionActivateGuardNames = new Set<string>();
  readonly #definitionDeactivateGuardNames = new Set<string>();

  #router!: Router<Dependencies>;
  #deps!: RouteLifecycleDependencies<Dependencies>;
  #limits: Limits = DEFAULT_LIMITS;

  /**
   * Injects the router instance during wiring phase.
   *
   * @param router - Router instance to use for factory compilation
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  /**
   * Injects namespace dependencies (getDependency accessor) during wiring phase.
   *
   * @param deps - Dependencies object containing getDependency accessor
   */
  setDependencies(deps: RouteLifecycleDependencies<Dependencies>): void {
    this.#deps = deps;
  }

  /**
   * Updates handler registration limits (max lifecycle handlers threshold).
   *
   * @param limits - Limits configuration with maxLifecycleHandlers
   */
  setLimits(limits: Limits): void {
    this.#limits = limits;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  /**
   * Adds a canActivate guard for a route.
   * Handles state-dependent validation, overwrite detection, and registration.
   *
   * @param name - Route name (input-validated by facade)
   * @param handler - Guard function or boolean (input-validated by facade)
   * @param skipValidation - True when called during route config building (#noValidate)
   * @param isFromDefinition - True when guard comes from route definition (tracked for HMR replace)
   */
  addCanActivate(
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    skipValidation: boolean,
    isFromDefinition = false,
  ): void {
    if (isFromDefinition) {
      this.#definitionActivateGuardNames.add(name);
    } else {
      this.#definitionActivateGuardNames.delete(name);
    }
    if (!skipValidation) {
      validateNotRegistering(
        this.#registering.has(name),
        name,
        "addActivateGuard",
      );
    }

    const isOverwrite = this.#canActivateFactories.has(name);

    if (!isOverwrite && !skipValidation) {
      validateHandlerLimit(
        this.#canActivateFactories.size + 1,
        "addActivateGuard",
        this.#limits.maxLifecycleHandlers,
      );
    }

    this.#registerHandler(
      "activate",
      name,
      handler,
      this.#canActivateFactories,
      this.#canActivateFunctions,
      "canActivate",
      isOverwrite,
    );
  }

  /**
   * Adds a canDeactivate guard for a route.
   * Handles state-dependent validation, overwrite detection, and registration.
   *
   * @param name - Route name (input-validated by facade)
   * @param handler - Guard function or boolean (input-validated by facade)
   * @param skipValidation - True when called during route config building (#noValidate)
   * @param isFromDefinition - True when guard comes from route definition (tracked for HMR replace)
   */
  addCanDeactivate(
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    skipValidation: boolean,
    isFromDefinition = false,
  ): void {
    if (isFromDefinition) {
      this.#definitionDeactivateGuardNames.add(name);
    } else {
      this.#definitionDeactivateGuardNames.delete(name);
    }
    if (!skipValidation) {
      validateNotRegistering(
        this.#registering.has(name),
        name,
        "addDeactivateGuard",
      );
    }

    const isOverwrite = this.#canDeactivateFactories.has(name);

    if (!isOverwrite && !skipValidation) {
      validateHandlerLimit(
        this.#canDeactivateFactories.size + 1,
        "addDeactivateGuard",
        this.#limits.maxLifecycleHandlers,
      );
    }

    this.#registerHandler(
      "deactivate",
      name,
      handler,
      this.#canDeactivateFactories,
      this.#canDeactivateFunctions,
      "canDeactivate",
      isOverwrite,
    );
  }

  /**
   * Removes a canActivate guard for a route.
   * Input already validated by facade (not registering).
   *
   * @param name - Route name (already validated by facade)
   */
  clearCanActivate(name: string): void {
    this.#canActivateFactories.delete(name);
    this.#canActivateFunctions.delete(name);
    this.#definitionActivateGuardNames.delete(name);
  }

  /**
   * Removes a canDeactivate guard for a route.
   * Input already validated by facade (not registering).
   *
   * @param name - Route name (already validated by facade)
   */
  clearCanDeactivate(name: string): void {
    this.#canDeactivateFactories.delete(name);
    this.#canDeactivateFunctions.delete(name);
    this.#definitionDeactivateGuardNames.delete(name);
  }

  /**
   * Clears all lifecycle handlers (canActivate and canDeactivate).
   * Used by clearRoutes to reset all lifecycle state.
   */
  clearAll(): void {
    this.#canActivateFactories.clear();
    this.#canActivateFunctions.clear();
    this.#canDeactivateFactories.clear();
    this.#canDeactivateFunctions.clear();
    this.#definitionActivateGuardNames.clear();
    this.#definitionDeactivateGuardNames.clear();
  }

  /**
   * Clears only lifecycle handlers that were registered from route definitions.
   * Used by HMR to remove definition-sourced guards without touching externally-added guards.
   */
  clearDefinitionGuards(): void {
    for (const name of this.#definitionActivateGuardNames) {
      this.#canActivateFactories.delete(name);
      this.#canActivateFunctions.delete(name);
    }
    for (const name of this.#definitionDeactivateGuardNames) {
      this.#canDeactivateFactories.delete(name);
      this.#canDeactivateFunctions.delete(name);
    }

    this.#definitionActivateGuardNames.clear();
    this.#definitionDeactivateGuardNames.clear();
  }

  /**
   * Returns lifecycle factories as records for cloning.
   *
   * @returns Tuple of [canDeactivateFactories, canActivateFactories]
   */
  getFactories(): [
    Record<string, GuardFnFactory<Dependencies>>,
    Record<string, GuardFnFactory<Dependencies>>,
  ] {
    const deactivateRecord: Record<string, GuardFnFactory<Dependencies>> = {};
    const activateRecord: Record<string, GuardFnFactory<Dependencies>> = {};

    for (const [name, factory] of this.#canDeactivateFactories) {
      deactivateRecord[name] = factory;
    }

    for (const [name, factory] of this.#canActivateFactories) {
      activateRecord[name] = factory;
    }

    return [deactivateRecord, activateRecord];
  }

  /**
   * Returns compiled lifecycle functions for transition execution.
   *
   * @returns Tuple of [canDeactivateFunctions, canActivateFunctions] as Maps
   */
  getFunctions(): [Map<string, GuardFn>, Map<string, GuardFn>] {
    return [this.#canDeactivateFunctions, this.#canActivateFunctions];
  }

  /**
   * Synchronously checks the canActivate guard for a route.
   * Returns `true` if no guard is registered or the guard allows activation.
   * Returns `false` if the guard blocks, returns a Promise, or throws.
   *
   * @param name - Route name to check the guard for
   * @param toState - Target navigation state
   * @param fromState - Current state (`undefined` on initial navigation)
   */
  checkActivateGuardSync(
    name: string,
    toState: State,
    fromState: State | undefined,
  ): boolean {
    return this.#checkGuardSync(
      this.#canActivateFunctions,
      name,
      toState,
      fromState,
      "checkActivateGuardSync",
    );
  }

  /**
   * Synchronously checks the canDeactivate guard for a route.
   * Returns `true` if no guard is registered or the guard allows deactivation.
   * Returns `false` if the guard blocks, returns a Promise, or throws.
   *
   * @param name - Route name to check the guard for
   * @param toState - Target navigation state
   * @param fromState - Current state (`undefined` on initial navigation)
   */
  checkDeactivateGuardSync(
    name: string,
    toState: State,
    fromState: State | undefined,
  ): boolean {
    return this.#checkGuardSync(
      this.#canDeactivateFunctions,
      name,
      toState,
      fromState,
      "checkDeactivateGuardSync",
    );
  }

  // =========================================================================
  // Private methods (business logic)
  // =========================================================================

  /**
   * Registers a handler.
   * Handles overwrite warning, count threshold warnings, and factory compilation.
   *
   * @param type - Guard type for log messages ("activate" or "deactivate")
   * @param name - Route name to register the guard for
   * @param handler - Guard factory function or boolean shorthand
   * @param factories - Target factory map (canActivate or canDeactivate)
   * @param functions - Target compiled functions map (canActivate or canDeactivate)
   * @param methodName - Public API method name for error/warning messages
   * @param isOverwrite - Whether this replaces an existing guard for the same route
   */
  #registerHandler(
    type: "activate" | "deactivate",
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    factories: Map<string, GuardFnFactory<Dependencies>>,
    functions: Map<string, GuardFn>,
    methodName: string,
    isOverwrite: boolean,
  ): void {
    // Emit warnings
    if (isOverwrite) {
      logger.warn(
        `router.${methodName}`,
        `Overwriting existing ${type} handler for route "${name}"`,
      );
    } else {
      this.#checkCountThresholds(factories.size + 1, methodName);
    }

    // Convert boolean to factory if needed
    const factory = isBoolean(handler)
      ? booleanToFactory<Dependencies>(handler)
      : handler;

    // Store factory
    factories.set(name, factory);

    // Mark route as being registered before calling user factory
    this.#registering.add(name);

    try {
      // Lifecycle factories receive full router as part of their public API
      const fn = factory(this.#router, this.#deps.getDependency);

      if (typeof fn !== "function") {
        throw new TypeError(
          `[router.${methodName}] Factory must return a function, got ${getTypeDescription(fn)}`,
        );
      }

      functions.set(name, fn);
    } catch (error) {
      // Rollback on failure to maintain consistency
      factories.delete(name);

      throw error;
    } finally {
      this.#registering.delete(name);
    }
  }

  /**
   * Shared implementation for synchronous guard checks.
   * Warns if a guard returns a Promise (async guards are not supported in sync mode).
   * Catches exceptions and treats them as navigation-blocking (`false`).
   *
   * @param functions - Map of compiled guard functions to look up
   * @param name - Route name to check the guard for
   * @param toState - Target navigation state
   * @param fromState - Current state (`undefined` on initial navigation)
   * @param methodName - Public API method name for warning messages
   */
  #checkGuardSync(
    functions: Map<string, GuardFn>,
    name: string,
    toState: State,
    fromState: State | undefined,
    methodName: string,
  ): boolean {
    const guardFn = functions.get(name);

    if (!guardFn) {
      return true;
    }

    try {
      const result = guardFn(toState, fromState);

      if (typeof result === "boolean") {
        return result;
      }

      logger.warn(
        `router.${methodName}`,
        `Guard for "${name}" returned a Promise. Sync check cannot resolve async guards — returning false.`,
      );

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Emits warn/error log messages when handler count approaches the configured limit.
   *
   * @param currentSize - Current handler count (after adding the new one)
   * @param methodName - Public API method name for warning messages
   */
  #checkCountThresholds(currentSize: number, methodName: string): void {
    const maxLifecycleHandlers = this.#limits.maxLifecycleHandlers;

    if (maxLifecycleHandlers === 0) {
      return;
    }

    const { warn, error } = computeThresholds(maxLifecycleHandlers);

    if (currentSize >= error) {
      logger.error(
        `router.${methodName}`,
        `${currentSize} lifecycle handlers registered! ` +
          `This is excessive. Hard limit at ${maxLifecycleHandlers}.`,
      );
    } else if (currentSize >= warn) {
      logger.warn(
        `router.${methodName}`,
        `${currentSize} lifecycle handlers registered. ` +
          `Consider consolidating logic.`,
      );
    }
  }
}
