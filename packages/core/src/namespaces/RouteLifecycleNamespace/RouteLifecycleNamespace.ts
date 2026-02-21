// packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts

import { logger } from "@real-router/logger";
import { isBoolean, getTypeDescription } from "type-guards";

import {
  validateHandler,
  validateHandlerLimit,
  validateNotRegistering,
} from "./validators";
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

  #router!: Router<Dependencies>;
  #deps!: RouteLifecycleDependencies<Dependencies>;
  #limits: Limits = DEFAULT_LIMITS;

  // =========================================================================
  // Static validation methods (called by facade for input validation)
  // =========================================================================

  static validateHandler<D extends DefaultDependencies>(
    handler: unknown,
    methodName: string,
  ): asserts handler is GuardFnFactory<D> | boolean {
    validateHandler<D>(handler, methodName);
  }

  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  setDependencies(deps: RouteLifecycleDependencies<Dependencies>): void {
    this.#deps = deps;
  }

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
   */
  addCanActivate(
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    skipValidation: boolean,
  ): void {
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
   */
  addCanDeactivate(
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    skipValidation: boolean,
  ): void {
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
