// packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts

import { logger } from "@real-router/logger";
import { isBoolean, isPromise, getTypeDescription } from "type-guards";

import {
  validateHandler,
  validateHandlerLimit,
  validateNotRegistering,
} from "./validators";
import { DEFAULT_LIMITS } from "../../constants";
import { computeThresholds } from "../../helpers";

import type { RouteLifecycleDependencies } from "./types";
import type { Router } from "../../Router";
import type { ActivationFnFactory, Limits } from "../../types";
import type {
  ActivationFn,
  DefaultDependencies,
  State,
} from "@real-router/types";

/**
 * Converts a boolean value to an activation function factory.
 * Used for the shorthand syntax where true/false is passed instead of a function.
 */
function booleanToFactory<Dependencies extends DefaultDependencies>(
  value: boolean,
): ActivationFnFactory<Dependencies> {
  const activationFn: ActivationFn = () => value;

  return () => activationFn;
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
    ActivationFnFactory<Dependencies>
  >();
  readonly #canActivateFactories = new Map<
    string,
    ActivationFnFactory<Dependencies>
  >();
  readonly #canDeactivateFunctions = new Map<string, ActivationFn>();
  readonly #canActivateFunctions = new Map<string, ActivationFn>();

  readonly #registering = new Set<string>();

  #routerStore: Router<Dependencies> | undefined;
  #depsStore: RouteLifecycleDependencies<Dependencies> | undefined;
  #limits: Limits = DEFAULT_LIMITS;

  /**
   * Gets router or throws if not initialized.
   */
  get #router(): Router<Dependencies> {
    /* v8 ignore next 3 -- @preserve: router always set by Router.ts */
    if (!this.#routerStore) {
      throw new Error(
        "[real-router] RouteLifecycleNamespace: router not initialized",
      );
    }

    return this.#routerStore;
  }

  /**
   * Gets dependencies or throws if not initialized.
   */
  get #deps(): RouteLifecycleDependencies<Dependencies> {
    /* v8 ignore next 3 -- @preserve: deps always set by Router.ts */
    if (!this.#depsStore) {
      throw new Error(
        "[real-router] RouteLifecycleNamespace: dependencies not initialized",
      );
    }

    return this.#depsStore;
  }

  // =========================================================================
  // Static validation methods (called by facade for input validation)
  // =========================================================================

  static validateHandler<D extends DefaultDependencies>(
    handler: unknown,
    methodName: string,
  ): asserts handler is ActivationFnFactory<D> | boolean {
    validateHandler<D>(handler, methodName);
  }

  setRouter(router: Router<Dependencies>): void {
    this.#routerStore = router;
  }

  setDependencies(deps: RouteLifecycleDependencies<Dependencies>): void {
    this.#depsStore = deps;
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
    handler: ActivationFnFactory<Dependencies> | boolean,
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
    handler: ActivationFnFactory<Dependencies> | boolean,
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
    Record<string, ActivationFnFactory<Dependencies>>,
    Record<string, ActivationFnFactory<Dependencies>>,
  ] {
    const deactivateRecord: Record<
      string,
      ActivationFnFactory<Dependencies>
    > = {};
    const activateRecord: Record<
      string,
      ActivationFnFactory<Dependencies>
    > = {};

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
  getFunctions(): [Map<string, ActivationFn>, Map<string, ActivationFn>] {
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
    handler: ActivationFnFactory<Dependencies> | boolean,
    factories: Map<string, ActivationFnFactory<Dependencies>>,
    functions: Map<string, ActivationFn>,
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
    functions: Map<string, ActivationFn>,
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

      if (isPromise(result)) {
        logger.warn(
          `router.${methodName}`,
          `Guard for "${name}" returned a Promise. Sync check cannot resolve async guards — returning false.`,
        );

        return false;
      }

      // Guard returned void/State — permissive default
      return true;
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
