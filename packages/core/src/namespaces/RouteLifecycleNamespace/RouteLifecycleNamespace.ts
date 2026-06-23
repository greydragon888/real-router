// packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts

import { DEFAULT_LIMITS } from "../../constants";

import type { RouteLifecycleDependencies } from "./types";
import type { GuardFnFactory, Limits } from "../../types";
import type { RouterValidator } from "../../types/RouterValidator";
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
  // Storage split by origin: definition vs external. External wins at compile
  // time for the same slot; clearDefinitionGuards / removeXGuard semantics are
  // expressed in terms of these primary Maps.
  readonly #definitionActivateFactories = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();
  readonly #externalActivateFactories = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();
  readonly #definitionDeactivateFactories = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();
  readonly #externalDeactivateFactories = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();
  // Compiled-function view. Single Map per kind because navigation does not
  // distinguish origin — it just runs the effective guard. Set on add (last
  // add wins) and recompiled on clear from whichever origin Map still holds
  // the slot.
  readonly #canDeactivateFunctions = new Map<string, GuardFn>();
  readonly #canActivateFunctions = new Map<string, GuardFn>();
  // Cached tuple — Maps never change reference, so this is stable
  readonly #functionsTuple: [Map<string, GuardFn>, Map<string, GuardFn>] = [
    this.#canDeactivateFunctions,
    this.#canActivateFunctions,
  ];

  #deps!: RouteLifecycleDependencies<Dependencies>;
  #limits: Limits = DEFAULT_LIMITS;
  #getValidator: (() => RouterValidator | null) | null = null;

  setDependencies(deps: RouteLifecycleDependencies<Dependencies>): void {
    this.#deps = deps;
  }

  /**
   * Updates handler registration limits (max lifecycle handlers threshold).
   *
   * @param limits - Limits configuration with maxLifecycleHandlers
   */
  // Stryker disable next-line BlockStatement: equivalent — #limits is write-only here (stored then `void`-ed; never read). setLimits is a stub awaiting validator integration, so emptying the body has no observable effect.
  setLimits(limits: Limits): void {
    this.#limits = limits;
    // eslint-disable-next-line sonarjs/void-use -- @preserve: Wave 3 validator reads limits via RouterInternals; void suppresses TS6133 until then
    void this.#limits;
  }

  setValidatorGetter(getter: () => RouterValidator | null): void {
    this.#getValidator = getter;
  }

  getHandlerCount(type: "activate" | "deactivate"): number {
    const definitionMap =
      type === "activate"
        ? this.#definitionActivateFactories
        : this.#definitionDeactivateFactories;
    const externalMap =
      type === "activate"
        ? this.#externalActivateFactories
        : this.#externalDeactivateFactories;

    if (definitionMap.size === 0) {
      return externalMap.size;
    }

    if (externalMap.size === 0) {
      return definitionMap.size;
    }

    const names = new Set(definitionMap.keys());

    for (const name of externalMap.keys()) {
      names.add(name);
    }

    return names.size;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  /**
   * Adds a canActivate guard for a route.
   *
   * @param name - Route name (input-validated by facade)
   * @param handler - Guard function or boolean (input-validated by facade)
   * @param isFromDefinition - True when guard comes from route definition
   *   (lands in the definition Map; subject to `clearDefinitionGuards()`).
   *   False (default) when added via `getLifecycleApi().addActivateGuard(...)`
   *   (lands in the external Map; survives `replace()`).
   *
   * Last add wins at runtime: the compiled function reflects the factory
   * passed to the most recent call, regardless of origin. Origin only
   * determines which Map the factory is filed under (relevant for
   * `clearDefinitionGuards()` and `cloneRouter` re-registration).
   */
  addCanActivate(
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    isFromDefinition = false,
  ): void {
    this.#registerHandler(
      "activate",
      name,
      handler,
      isFromDefinition,
      "canActivate",
    );
  }

  /**
   * Adds a canDeactivate guard for a route.
   *
   * Symmetric counterpart to {@link addCanActivate}.
   */
  addCanDeactivate(
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    isFromDefinition = false,
  ): void {
    this.#registerHandler(
      "deactivate",
      name,
      handler,
      isFromDefinition,
      "canDeactivate",
    );
  }

  /**
   * Removes a canActivate guard for a route — both the definition and external
   * slots. (Origin-selective clearing was removed: no caller ever needed it;
   * `clearDefinitionGuards()` handles the definition-only case on `replace()`.)
   *
   * @param name - Route name (already validated by facade)
   */
  clearCanActivate(name: string): void {
    const clearedDefinition = this.#definitionActivateFactories.delete(name);
    const clearedExternal = this.#externalActivateFactories.delete(name);

    if (clearedDefinition || clearedExternal) {
      this.#recompileSlot("activate", name);
    }
  }

  /**
   * Removes a canDeactivate guard for a route (both slots).
   *
   * Symmetric counterpart to {@link clearCanActivate}.
   */
  clearCanDeactivate(name: string): void {
    const clearedDefinition = this.#definitionDeactivateFactories.delete(name);
    const clearedExternal = this.#externalDeactivateFactories.delete(name);

    if (clearedDefinition || clearedExternal) {
      this.#recompileSlot("deactivate", name);
    }
  }

  /**
   * Clears all lifecycle handlers (canActivate and canDeactivate).
   * Used by clearRoutes to reset all lifecycle state.
   */
  clearAll(): void {
    this.#definitionActivateFactories.clear();
    this.#externalActivateFactories.clear();
    this.#definitionDeactivateFactories.clear();
    this.#externalDeactivateFactories.clear();
    this.#canActivateFunctions.clear();
    this.#canDeactivateFunctions.clear();
  }

  /**
   * Clears only lifecycle handlers that were registered from route definitions.
   * Used by HMR `replace()` to remove definition-sourced guards without
   * touching externally-added guards.
   *
   * For slots where both definition and external exist, the external factory
   * stays and the compiled function is unchanged (external already won at
   * registration time). For definition-only slots, the compiled function is
   * dropped.
   */
  clearDefinitionGuards(): void {
    for (const name of this.#definitionActivateFactories.keys()) {
      if (!this.#externalActivateFactories.has(name)) {
        this.#canActivateFunctions.delete(name);
      }
    }

    for (const name of this.#definitionDeactivateFactories.keys()) {
      if (!this.#externalDeactivateFactories.has(name)) {
        this.#canDeactivateFunctions.delete(name);
      }
    }

    this.#definitionActivateFactories.clear();
    this.#definitionDeactivateFactories.clear();
  }

  /**
   * Returns lifecycle factories as a flat `[deactivate, activate]` tuple of
   * `Record<name, factory>` — the effective view where external wins over
   * definition for the same slot. Used by `getRoutesApi` to enrich route
   * objects with their current canActivate / canDeactivate factories and by
   * the route-removal cleanup path.
   *
   * For cloneRouter (which needs to preserve origin on re-registration), use
   * {@link getFactoriesByOrigin} instead.
   */
  getFactories(): [
    Record<string, GuardFnFactory<Dependencies>>,
    Record<string, GuardFnFactory<Dependencies>>,
  ] {
    const deactivateRecord: Record<string, GuardFnFactory<Dependencies>> = {};
    const activateRecord: Record<string, GuardFnFactory<Dependencies>> = {};

    for (const [name, factory] of this.#definitionDeactivateFactories) {
      deactivateRecord[name] = factory;
    }
    for (const [name, factory] of this.#externalDeactivateFactories) {
      deactivateRecord[name] = factory;
    }

    for (const [name, factory] of this.#definitionActivateFactories) {
      activateRecord[name] = factory;
    }
    for (const [name, factory] of this.#externalActivateFactories) {
      activateRecord[name] = factory;
    }

    return [deactivateRecord, activateRecord];
  }

  /**
   * Returns factories tagged by origin — definition and external as separate
   * `[deactivate, activate]` tuples. Used by `cloneRouter` to re-register
   * guards on the clone with their original origin flag preserved.
   */
  getFactoriesByOrigin(): {
    definition: [
      Record<string, GuardFnFactory<Dependencies>>,
      Record<string, GuardFnFactory<Dependencies>>,
    ];
    external: [
      Record<string, GuardFnFactory<Dependencies>>,
      Record<string, GuardFnFactory<Dependencies>>,
    ];
  } {
    const defDeact: Record<string, GuardFnFactory<Dependencies>> = {};
    const defAct: Record<string, GuardFnFactory<Dependencies>> = {};
    const extensionDeact: Record<string, GuardFnFactory<Dependencies>> = {};
    const extensionAct: Record<string, GuardFnFactory<Dependencies>> = {};

    for (const [name, factory] of this.#definitionDeactivateFactories) {
      defDeact[name] = factory;
    }
    for (const [name, factory] of this.#definitionActivateFactories) {
      defAct[name] = factory;
    }
    for (const [name, factory] of this.#externalDeactivateFactories) {
      extensionDeact[name] = factory;
    }
    for (const [name, factory] of this.#externalActivateFactories) {
      extensionAct[name] = factory;
    }

    return {
      definition: [defDeact, defAct],
      external: [extensionDeact, extensionAct],
    };
  }

  /**
   * Returns compiled lifecycle functions for transition execution.
   *
   * @returns Tuple of [canDeactivateFunctions, canActivateFunctions] as Maps
   */
  getFunctions(): [Map<string, GuardFn>, Map<string, GuardFn>] {
    return this.#functionsTuple;
  }

  canNavigateTo(
    toDeactivate: string[],
    toActivate: string[],
    toState: State,
    fromState: State | undefined,
  ): boolean {
    for (const segment of toDeactivate) {
      if (
        !this.#checkGuardSync(
          this.#canDeactivateFunctions,
          segment,
          toState,
          fromState,
          "canNavigateTo",
        )
      ) {
        return false;
      }
    }

    for (const segment of toActivate) {
      if (
        !this.#checkGuardSync(
          this.#canActivateFunctions,
          segment,
          toState,
          fromState,
          "canNavigateTo",
        )
      ) {
        return false;
      }
    }

    return true;
  }

  // =========================================================================
  // Private methods (business logic)
  // =========================================================================

  /**
   * Routes a registration into the origin-specific factory Map and compiles
   * the just-added factory (last add wins for the compiled function).
   * Emits overwrite / threshold warnings symmetric with the pre-refactor
   * single-Map behaviour: any prior entry for the slot — same origin or
   * cross-origin — counts as an overwrite for the warning surface; only a
   * brand-new slot (no entry in either Map) increments the threshold check.
   */
  #registerHandler(
    type: "activate" | "deactivate",
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    isFromDefinition: boolean,
    methodName: string,
  ): void {
    const factoryMaps = this.#getFactoryMaps(type);
    const functions =
      type === "activate"
        ? this.#canActivateFunctions
        : this.#canDeactivateFunctions;
    const targetMap = isFromDefinition
      ? factoryMaps.definition
      : factoryMaps.external;
    const otherMap = isFromDefinition
      ? factoryMaps.external
      : factoryMaps.definition;

    const isOverwrite = targetMap.has(name) || otherMap.has(name);

    if (isOverwrite) {
      this.#getValidator?.()?.lifecycle.warnOverwrite(name, type, methodName);
    } else {
      this.#getValidator?.()?.lifecycle.validateCountThresholds(
        this.getHandlerCount(type) + 1,
        methodName,
      );
    }

    const factory =
      typeof handler === "boolean"
        ? booleanToFactory<Dependencies>(handler)
        : handler;

    targetMap.set(name, factory);

    try {
      const fn = this.#deps.compileFactory(factory);

      if (typeof fn !== "function") {
        throw new TypeError(
          `[router.${methodName}] Factory must return a function, got ${typeof fn}`,
        );
      }

      functions.set(name, fn);
    } catch (error) {
      // Rollback the slot we just touched to keep storage consistent. If a
      // cross-origin entry exists for the same name, its compiled function
      // remains in place — recompile so navigation still sees a valid guard.
      targetMap.delete(name);

      if (otherMap.has(name)) {
        this.#recompileSlot(type, name);
      } else {
        functions.delete(name);
      }

      throw error;
    }
  }

  /**
   * Recompiles the compiled-function slot from whichever origin Map still has
   * an entry for `name` after a clear. External wins over definition; if
   * neither has an entry, the compiled function is deleted.
   */
  #recompileSlot(type: "activate" | "deactivate", name: string): void {
    const factoryMaps = this.#getFactoryMaps(type);
    const functions =
      type === "activate"
        ? this.#canActivateFunctions
        : this.#canDeactivateFunctions;

    const effective =
      factoryMaps.external.get(name) ?? factoryMaps.definition.get(name);

    if (!effective) {
      functions.delete(name);

      return;
    }

    try {
      const fn = this.#deps.compileFactory(effective);

      /* v8 ignore next 4 -- @preserve: stored factories were validated at add time, compileFactory should yield a function on second call too */
      if (typeof fn !== "function") {
        functions.delete(name);

        return;
      }

      functions.set(name, fn);
    } catch {
      /* v8 ignore next 2 -- @preserve: defensive — a user-provided factory could theoretically throw on re-compile (state changed since add time); deleting the function blocks navigation on that slot */
      functions.delete(name);
    }
  }

  #getFactoryMaps(type: "activate" | "deactivate"): {
    definition: Map<string, GuardFnFactory<Dependencies>>;
    external: Map<string, GuardFnFactory<Dependencies>>;
  } {
    return type === "activate"
      ? {
          definition: this.#definitionActivateFactories,
          external: this.#externalActivateFactories,
        }
      : {
          definition: this.#definitionDeactivateFactories,
          external: this.#externalDeactivateFactories,
        };
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

      this.#getValidator?.()?.lifecycle.warnAsyncGuardSync(name, methodName);

      return false;
    } catch {
      return false;
    }
  }
}
