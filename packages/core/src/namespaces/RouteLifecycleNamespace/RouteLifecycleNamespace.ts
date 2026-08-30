// packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts

import type { RouteLifecycleDependencies } from "./types";
import type {
  DefaultDependencies,
  GuardFn,
  State,
  GuardFnFactory,
} from "../../types";

// Boolean shorthand has only two possible values, so the guard and its factory
// are module-level singletons — registering `true`/`false` reuses one cached
// factory instead of allocating a fresh closure per call (#962).
const TRUE_GUARD: GuardFn = () => true;
const FALSE_GUARD: GuardFn = () => false;
const TRUE_FACTORY: GuardFnFactory = () => TRUE_GUARD;
const FALSE_FACTORY: GuardFnFactory = () => FALSE_GUARD;

/**
 * Converts a boolean value to a guard function factory.
 * Used for the shorthand syntax where true/false is passed instead of a function.
 * Returns one of two cached factories — no per-call allocation (#962).
 */
function booleanToFactory<Dependencies extends DefaultDependencies>(
  value: boolean,
): GuardFnFactory<Dependencies> {
  return value ? TRUE_FACTORY : FALSE_FACTORY;
}

/**
 * Puts a slot back the way it was: re-seat the previous entry, or delete the
 * slot when there was none. Used for the factory Map and its compiled twin
 * alike — since #1649 the two are one unit and roll back together, so the
 * symmetry is the point rather than a coincidence (#963).
 */
function restoreSlot<T>(
  map: Map<string, T>,
  name: string,
  previous: T | undefined,
): void {
  if (previous === undefined) {
    map.delete(name);
  } else {
    map.set(name, previous);
  }
}

/**
 * Origin lane for a guard clear. Every `clearCanActivate` / `clearCanDeactivate`
 * caller names its lane — there is no origin-blind default — so a new call site
 * cannot silently wipe both the route-config and the external guard (#1171):
 *
 * - `"definition"` — clear only the route-config guard (`update(name, {…: null})`, #952).
 * - `"external"` — clear only the external, component-managed guard
 *   (`removeXGuard()` and post-leave auto-cleanup — the inverse of `addXGuard()`).
 * - `"both"` — clear both (route removal / router teardown; the route is gone).
 */
export type GuardClearScope = "definition" | "external" | "both";

/**
 * Source of truth for `canActivate` / `canDeactivate` guards.
 *
 * Storage is split by origin into four factory Maps (definition vs external,
 * each ×activate/deactivate); a single compiled-function Map per kind backs
 * navigation ("external wins" — when a route holds both a definition and an
 * external guard, the compiled guard is the external one, regardless of
 * registration order; #1174). `getFunctions()` returns a cached
 * `[deactivate, activate]` tuple for the hot path (stable reference, no
 * per-navigate allocation).
 *
 * All input validation is handled upstream by `getLifecycleApi` and
 * `getRoutesApi` — this class has no static methods.
 *
 * **Ordering convention.** Every paired surface lists **deactivate before
 * activate**: `getFunctions()` / `getFactories()` return `[deactivate,
 * activate]`, `getFactoriesByOrigin()` returns that tuple per origin, and
 * `canNavigateTo(toDeactivate, toActivate, …)` takes deactivate first. Keep
 * any new paired surface consistent with this order.
 */
export class RouteLifecycleNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  // Storage split by origin: definition vs external. Resolution is
  // EXTERNAL-WINS regardless of registration order (#1174): the compiled slot
  // reflects the external factory whenever one exists, else the definition. One
  // policy across every path — `#registerHandler` (keeps external over a later
  // definition), `#recompileSlot`, and `clearDefinitionGuards` (#1192) — so a
  // clone's fixed definition→external replay yields the source's effective guard
  // with no extra tracking. Both semantics are expressed over these primary Maps.
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
  // distinguish origin — it just runs the effective guard. Set on add
  // (external-wins — a definition does not overwrite a live external, #1174)
  // and re-derived on clear from whichever origin Map still holds the slot.
  readonly #canDeactivateFunctions = new Map<string, GuardFn>();
  readonly #canActivateFunctions = new Map<string, GuardFn>();
  // The compiled form kept BESIDE its factory, split by origin exactly like the
  // factory Maps above (#1649). This is the whole reason `#recompileSlot` is a
  // Map READ and not a factory INVOCATION: clearing a guard no longer runs
  // application code, so neither the destructive post-leave cleanup in
  // `completeTransition` nor `replace()`'s `clearDefinitionGuards` can be torn
  // down from inside itself. Nothing extra is compiled to fill them —
  // `#registerHandler` already compiled the definition factory and DISCARDED
  // the result whenever external won; these Maps keep it instead.
  // Contract consequence (named in the changeset): a guard factory runs exactly
  // ONCE per registration per router. Re-registration, `cloneRouter` and
  // route-CRUD still re-run it; a slot re-derivation no longer does, so a
  // factory that reads a dependency at compile time no longer silently
  // re-reads it at an unpredictable moment.
  readonly #compiledDefinitionDeactivate = new Map<string, GuardFn>();
  readonly #compiledExternalDeactivate = new Map<string, GuardFn>();
  readonly #compiledDefinitionActivate = new Map<string, GuardFn>();
  readonly #compiledExternalActivate = new Map<string, GuardFn>();
  // Cached tuple — Maps never change reference, so this is stable
  readonly #functionsTuple: [Map<string, GuardFn>, Map<string, GuardFn>] = [
    this.#canDeactivateFunctions,
    this.#canActivateFunctions,
  ];

  #deps!: RouteLifecycleDependencies<Dependencies>;

  setDependencies(deps: RouteLifecycleDependencies<Dependencies>): void {
    this.#deps = deps;
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

  /**
   * Pre-flights the #961 handler-limit `RangeError` into the route-CRUD PREPARE
   * phase (#1046). `#registerHandler`'s per-slot limit check throws AFTER the
   * tree/config swap, so `add`/`replace`/`update` tore post-commit when the
   * validator was installed and the per-type count was at `maxLifecycleHandlers`.
   * Running the same check here — before any store mutation — restores atomicity
   * (#951/#956/#698): a batch that would exceed the limit aborts before a single
   * write.
   *
   * Only NEW slots count (an overwrite leaves the union count unchanged, mirroring
   * `#registerHandler`). For `replace` (`clearsDefinition = true`) the definition
   * guards are about to be cleared, so the projection runs against the surviving
   * EXTERNAL guards only — exactly the post-clear state the install loop sees.
   * Plugin-gated: a no-op without the validator (the limit is opt-in).
   *
   * @param activateNames - route names a `canActivate` would be registered for
   * @param deactivateNames - route names a `canDeactivate` would be registered for
   * @param clearsDefinition - true for `replace` (definition guards cleared first)
   */
  preflightHandlerLimit(
    activateNames: Iterable<string>,
    deactivateNames: Iterable<string>,
    clearsDefinition: boolean,
  ): void {
    const validator = this.#deps.getValidator();

    if (!validator) {
      return;
    }

    const check = (
      type: "activate" | "deactivate",
      names: Iterable<string>,
      methodName: string,
    ): void => {
      const { definition, external } = this.#getFactoryMaps(type);

      // A name already holding a guard of this type is an overwrite (no new
      // slot, mirroring `#registerHandler`). After a definition-clear (replace)
      // only EXTERNAL guards survive, so the existing-name check — and the base
      // count below — run against `external` alone, matching the post-clear
      // install state the loop sees.
      let newSlots = 0;

      for (const name of names) {
        const isExisting = clearsDefinition
          ? external.has(name)
          : definition.has(name) || external.has(name);

        if (!isExisting) {
          newSlots++;
        }
      }

      if (newSlots === 0) {
        return;
      }

      // The install loop throws when a new-slot registration observes
      // `count >= max`. Starting from `base` and adding `newSlots` new names,
      // the highest pre-register count it reaches is `base + newSlots - 1` —
      // replicate that worst case so the pre-flight throws iff the loop would.
      const base = clearsDefinition
        ? external.size
        : this.getHandlerCount(type);

      validator.lifecycle.validateHandlerLimit(base + newSlots - 1, methodName);
    };

    check("activate", activateNames, "canActivate");
    check("deactivate", deactivateNames, "canDeactivate");
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
   *   False when added via `getLifecycleApi().addActivateGuard(...)` (lands in
   *   the external Map; survives `replace()`).
   *
   *   ⚑ REQUIRED, with no default (#1977). The clear side states the rule for
   *   itself — "there is no origin-blind default, so every caller commits to a
   *   lane and a new call site cannot silently clear both" — and this side used
   *   to contradict it, defaulting to the MINORITY polarity: three of the four
   *   in-repo callers are the definition lane and had to remember `true`. A
   *   forgotten argument filed a definition guard as EXTERNAL, where
   *   `clearDefinitionGuards()` does not reach it, so `replace()` kept a guard
   *   belonging to a tree that no longer existed (measured: 1 surviving guard
   *   against 0 for the same call with the argument). The type could not catch
   *   it while the parameter was optional.
   *
   * External wins at runtime (#1174): when a route holds both a definition and
   * an external guard, the compiled function is the external one, regardless of
   * registration order. Within one origin the most recent add overwrites. Origin
   * determines which Map the factory is filed under (relevant for
   * `clearDefinitionGuards()` and `cloneRouter` re-registration).
   */
  addCanActivate(
    name: string,
    handler: GuardFnFactory<Dependencies> | boolean,
    isFromDefinition: boolean,
    precompiledFn?: GuardFn,
  ): void {
    this.#registerHandler(
      "activate",
      name,
      handler,
      isFromDefinition,
      "canActivate",
      precompiledFn,
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
    isFromDefinition: boolean,
    precompiledFn?: GuardFn,
  ): void {
    this.#registerHandler(
      "deactivate",
      name,
      handler,
      isFromDefinition,
      "canDeactivate",
      precompiledFn,
    );
  }

  /**
   * Removes a canActivate guard for a route. `scope` names the origin lane
   * (see {@link GuardClearScope}) — there is no origin-blind default, so every
   * caller commits to a lane and a new call site cannot silently clear both.
   * Delegates to {@link #clearGuard} (mirrors the add side's `#registerHandler`).
   *
   * @param name - Route name (already validated by facade)
   * @param scope - Which origin(s) to clear: `"definition"` / `"external"` / `"both"`
   */
  clearCanActivate(name: string, scope: GuardClearScope): void {
    this.#clearGuard("activate", name, scope);
  }

  /**
   * Removes a canDeactivate guard for a route. Symmetric counterpart to
   * {@link clearCanActivate}.
   *
   * The `"external"` lane is what makes a route-config `canDeactivate` durable:
   * post-leave auto-cleanup (`completeTransition`) and `removeDeactivateGuard()`
   * unregister only the external, component-managed guard (router5 mount/unmount
   * heritage), while a definition guard survives for re-entry — symmetric with
   * definition `canActivate`, which lives as long as the route is in the tree
   * (#1171). Clearing both by default made a config guard one-shot: the first
   * permitted leave erased it, so re-entry was unguarded, `getRoutesApi().get()`
   * lost the field, and a clone taken after the leave never received it
   * (clone invariant #6).
   *
   * @param name - Route name (already validated by facade)
   * @param scope - Which origin(s) to clear: `"definition"` / `"external"` / `"both"`
   */
  clearCanDeactivate(name: string, scope: GuardClearScope): void {
    this.#clearGuard("deactivate", name, scope);
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
    this.#compiledDefinitionDeactivate.clear();
    this.#compiledExternalDeactivate.clear();
    this.#compiledDefinitionActivate.clear();
    this.#compiledExternalActivate.clear();
  }

  /**
   * Clears only lifecycle handlers that were registered from route definitions.
   * Used by HMR `replace()` to remove definition-sourced guards without
   * touching externally-added guards.
   *
   * For a slot where BOTH a definition and an external guard exist, the external
   * factory survives — and the compiled function is RE-DERIVED from it (#1192).
   * Under external-wins (#1174) the compiled slot is already the external guard,
   * so this re-derivation is idempotent — it goes through the same choke point
   * that keeps clearing correct (and stays robust if the compiled slot were ever
   * out of sync). For a definition-only slot, the compiled function is dropped.
   *
   * ⚑ Since #1649 the re-derivation READS the surviving external guard's stored
   * compiled form instead of invoking its factory, which is what stopped this
   * method from running application code mid-`replace()` (the #1627 site).
   */
  clearDefinitionGuards(): void {
    for (const name of this.#definitionActivateFactories.keys()) {
      this.#compiledDefinitionActivate.delete(name);

      if (this.#externalActivateFactories.has(name)) {
        this.#recompileSlot("activate", name);
      } else {
        this.#canActivateFunctions.delete(name);
      }
    }

    for (const name of this.#definitionDeactivateFactories.keys()) {
      this.#compiledDefinitionDeactivate.delete(name);

      if (this.#externalDeactivateFactories.has(name)) {
        this.#recompileSlot("deactivate", name);
      } else {
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
    // Null-prototype dictionaries: these are keyed by a ROUTE NAME, and core
    // accepts a route named after any `Object.prototype` member. A plain `{}`
    // breaks BOTH consumers of these records — `getRoutesApi` asks
    // `name in record` and finds an inherited member (a `canDeactivate`
    // nobody registered), while `cloneRouter` enumerates them, and the
    // `"__proto__"` write dispatches into the inherited setter so the record
    // has no own key to enumerate — the clone silently loses the guard
    // (#1801). The rest of this layer is already null-prototype for exactly
    // this reason: all six `RouteConfig` maps, `routeCustomFields`, and the
    // matcher's `staticChildren`.
    const deactivateRecord = Object.create(null) as Record<
      string,
      GuardFnFactory<Dependencies>
    >;
    const activateRecord = Object.create(null) as Record<
      string,
      GuardFnFactory<Dependencies>
    >;

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
    // Null-prototype, for the reason spelled out in `getFactories` above
    // (#1801) — and these four are the ones `cloneRouter` ENUMERATES, i.e.
    // the half where a swapped prototype loses the guard outright.
    const defDeact = Object.create(null) as Record<
      string,
      GuardFnFactory<Dependencies>
    >;
    const defAct = Object.create(null) as Record<
      string,
      GuardFnFactory<Dependencies>
    >;
    const extensionDeact = Object.create(null) as Record<
      string,
      GuardFnFactory<Dependencies>
    >;
    const extensionAct = Object.create(null) as Record<
      string,
      GuardFnFactory<Dependencies>
    >;

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

  /**
   * Compiles a guard factory to its `GuardFn` WITHOUT registering it — surfaces
   * a throwing / non-function factory eagerly. The prepare-then-commit
   * add/replace path (`adoptRouteArtifacts`) calls this for every pending guard
   * BEFORE the store swap (#956), so a malformed factory aborts the mutation
   * with the store untouched. The returned function is then installed via the
   * `precompiledFn` argument of {@link addCanActivate} / {@link addCanDeactivate}
   * — no re-compile, so a factory with compile-time side effects runs exactly
   * once. Same boolean-shorthand handling + compile + non-function check as the
   * inline `#registerHandler` path, so a route-config `canActivate: true`
   * (boolean shorthand, runtime-reachable via the public route type) compiles to
   * the cached `TRUE_GUARD`/`FALSE_GUARD` instead of throwing on a non-callable.
   */
  compileGuardFactory(
    handler: GuardFnFactory<Dependencies> | boolean,
    methodName: string,
  ): GuardFn {
    const factory =
      typeof handler === "boolean"
        ? booleanToFactory<Dependencies>(handler)
        : handler;
    const fn = this.#deps.compileFactory(factory);

    if (typeof fn !== "function") {
      throw new TypeError(
        `[router.${methodName}] Factory must return a function, got ${typeof fn}`,
      );
    }

    return fn;
  }

  // =========================================================================
  // Private methods (business logic)
  // =========================================================================

  /**
   * Routes a registration into the origin-specific factory Map and updates the
   * compiled function under EXTERNAL-WINS (#1174): the just-added factory becomes
   * the compiled guard unless it is a definition registered while an external
   * guard is already live (then external stays effective; the definition is still
   * stored for a later `clearDefinitionGuards()`). Within one origin the most
   * recent add overwrites.
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
    precompiledFn?: GuardFn,
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
      this.#deps
        .getValidator()
        ?.lifecycle.warnOverwrite(name, type, methodName);
    } else {
      // Single enforcement choke point for EVERY registration path: programmatic
      // (getLifecycleApi) and route-config (getRoutesApi.add/update, where
      // isFromDefinition=true). The hard limit throws here so route-config guards
      // are bounded exactly like programmatic ones (#961); the approaching-limit
      // warning follows. Only new slots count toward the limit — an overwrite
      // leaves the count unchanged. `getHandlerCount` is read once and only when
      // the validator is installed (opt-in), so the no-plugin path stays free.
      const validator = this.#deps.getValidator();

      if (validator) {
        const count = this.getHandlerCount(type);

        validator.lifecycle.validateHandlerLimit(count, methodName);
        validator.lifecycle.validateCountThresholds(count + 1, methodName);
      }
    }

    const factory =
      typeof handler === "boolean"
        ? booleanToFactory<Dependencies>(handler)
        : handler;

    // Capture the slot's prior factory (if any) BEFORE the overwrite, so a
    // compile-throw can be rolled back to the previously-valid guard rather
    // than dropping it (#963).
    const previousFactory = targetMap.get(name);
    // The compiled twin of the slot being overwritten, captured for the same
    // rollback (#1649): factory and compiled form are one unit now, so they
    // must move together or `#recompileSlot` would re-derive from a factory
    // whose compiled form belongs to a different registration.
    const compiledMaps = this.#getCompiledMaps(type);
    const compiledTarget = isFromDefinition
      ? compiledMaps.definition
      : compiledMaps.external;
    const previousCompiled = compiledTarget.get(name);

    targetMap.set(name, factory);

    // External-wins (#1174): the compiled slot reflects the external guard
    // whenever one exists, regardless of registration order. A definition
    // registered while an external guard is live is still stored (so a later
    // replace()-clear can re-derive from it via `#recompileSlot`) but does NOT
    // overwrite the compiled function — external stays effective. This makes
    // `#registerHandler` consistent with `#recompileSlot` / `clearDefinitionGuards`
    // (both external-wins, #1192), so the whole namespace has ONE policy, and
    // cloneRouter's fixed definition→external replay yields the same effective
    // guard as the source with no extra origin tracking. (The factory is still
    // compiled below to validate it and to keep the rollback path symmetric.)
    const externalWins = isFromDefinition && otherMap.has(name);

    try {
      // A pre-validated function (from the #956 add/replace pre-compile) is
      // installed directly — no re-compile; otherwise compile + non-function
      // check here (`compileGuardFactory` throws on a bad factory).
      const fn = precompiledFn ?? this.compileGuardFactory(factory, methodName);

      // Stored whatever the origin — INCLUDING the definition compile that
      // external-wins discards below. That discarded result is exactly what a
      // later `clearCanDeactivate`/`clearDefinitionGuards` used to re-obtain by
      // running the factory again (#1649).
      compiledTarget.set(name, fn);

      if (!externalWins) {
        functions.set(name, fn);
      }
    } catch (error) {
      // Roll the slot back to its pre-call state: restore the previous factory
      // on an overwrite (#963) — and its compiled twin with it (#1649) — else
      // clear both. `#recompileSlot` then resets the compiled function from
      // whichever origin still holds the slot: the restored same-origin entry,
      // a surviving cross-origin one, or (empty slot) deletes it.
      restoreSlot(targetMap, name, previousFactory);
      restoreSlot(compiledTarget, name, previousCompiled);

      this.#recompileSlot(type, name);

      throw error;
    }
  }

  /**
   * Shared implementation for {@link clearCanActivate} / {@link clearCanDeactivate}
   * — the clear-side counterpart to {@link #registerHandler}. `scope` selects the
   * origin lane (no origin-blind default, #1171); when one origin is cleared and
   * the other survives, `#recompileSlot` re-derives the compiled function from
   * the survivor's stored compiled form (external wins, #1174) — a READ, never a
   * re-compile, which is what keeps this clear free of application code (#1649).
   */
  #clearGuard(
    type: "activate" | "deactivate",
    name: string,
    scope: GuardClearScope,
  ): void {
    const { definition, external } = this.#getFactoryMaps(type);
    const compiled = this.#getCompiledMaps(type);
    const clearedDefinition =
      scope === "external" ? false : definition.delete(name);
    const clearedExternal =
      scope === "definition" ? false : external.delete(name);

    // The compiled form is part of the slot, so it is cleared with it (#1649).
    if (clearedDefinition) {
      compiled.definition.delete(name);
    }

    if (clearedExternal) {
      compiled.external.delete(name);
    }

    if (clearedDefinition || clearedExternal) {
      this.#recompileSlot(type, name);
    }
  }

  /**
   * Re-derives the compiled-function slot from whichever origin still has an
   * entry for `name` after a clear. External wins over definition; if neither
   * has an entry, the compiled function is deleted.
   *
   * ⚑ **A READ, not a re-compile (#1649).** It used to call the surviving
   * factory — application code executing inside two DESTRUCTIVE operations
   * (`completeTransition`'s post-leave cleanup and `replace()`'s
   * `clearDefinitionGuards`), which is how a guard factory got to `dispose()` /
   * `stop()` / start a navigation from inside a teardown it was not supposed to
   * observe (#1611 / #1626 / #1627). Each factory's compiled form is stored
   * beside it at registration, so the survivor's is already in hand and no user
   * code runs here at all. The two `v8 ignore` blocks that guarded the re-compile
   * (a factory throwing, or returning a non-function, on its SECOND call) went
   * with it — there is no second call to defend against.
   */
  #recompileSlot(type: "activate" | "deactivate", name: string): void {
    const compiled = this.#getCompiledMaps(type);
    const functions =
      type === "activate"
        ? this.#canActivateFunctions
        : this.#canDeactivateFunctions;

    const effective =
      compiled.external.get(name) ?? compiled.definition.get(name);

    if (!effective) {
      functions.delete(name);

      return;
    }

    functions.set(name, effective);
  }

  /**
   * The compiled-form counterpart of {@link #getFactoryMaps} — same origin
   * split, same `deactivate`-before-`activate` reading order.
   */
  #getCompiledMaps(type: "activate" | "deactivate"): {
    definition: Map<string, GuardFn>;
    external: Map<string, GuardFn>;
  } {
    return type === "activate"
      ? {
          definition: this.#compiledDefinitionActivate,
          external: this.#compiledExternalActivate,
        }
      : {
          definition: this.#compiledDefinitionDeactivate,
          external: this.#compiledExternalDeactivate,
        };
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

      this.#deps.getValidator()?.lifecycle.warnAsyncGuardSync(name, methodName);

      return false;
    } catch (error) {
      // #959: a throwing sync guard must not vanish silently. `navigate()`
      // surfaces the same throw via `handleGuardError` → TRANSITION_ERROR; the
      // sync predicate (`canNavigateTo`) has no error channel, so core logs it
      // directly. This is an OPERATIONAL signal (the guard crashed — distinct
      // from the opt-in validator DX warnings above for which the validator is
      // the right home): the navigation is still treated as blocked (`false`).
      this.#deps.logger.warn(
        `router.${methodName}`,
        `Guard for "${name}" threw — treated as navigation-blocking (returned false)`,
        error,
      );

      return false;
    }
  }
}
