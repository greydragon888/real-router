// packages/validation-plugin/src/validators/retrospective.ts

import { resolveForwardChain as coreResolveForwardChain } from "@real-router/core";

import type { RouteLookup } from "./forwardTo";
import type { LimitsConfig } from "@real-router/core";
import type { RouterLogger } from "@real-router/core/types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectKeys = Object.keys;

/**
 * Retrospective validators — run once, at `usePlugin()` time, over what the
 * router already holds. Called by the validation plugin in a try/catch with
 * rollback.
 *
 * Every function takes FACTS read from the published surface (#2382): the
 * routes as `RoutesApi.get` reports them, the one-hop forward map, the resolved
 * limits, the dependency names. None of them receives a core store.
 */

/**
 * A route as `RoutesApi.get` reports it, with the fields this pass judges typed
 * `unknown` — the pass exists to catch values the declared type rules out.
 */
interface RouteFacts {
  name: string;
  path: string;
  forwardTo?: unknown;
  defaultParams?: unknown;
  defaultSearch?: unknown;
  decodeParams?: unknown;
  encodeParams?: unknown;
  children?: readonly RouteFacts[];
}

// =============================================================================
// Private helpers
// =============================================================================

function walkRoutes(
  routes: readonly RouteFacts[],
  callback: (route: RouteFacts, fullName: string) => void,
  parentName = "",
): void {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    callback(route, fullName);

    if (route.children) {
      walkRoutes(route.children, callback, fullName);
    }
  }
}

/** One slot of every route, in walk order, skipping routes that leave it unset. */
function collectSlot(
  routes: readonly RouteFacts[],
  pick: (route: RouteFacts) => unknown,
): [string, unknown][] {
  const entries: [string, unknown][] = [];

  walkRoutes(routes, (route, fullName) => {
    const value = pick(route);

    if (value !== undefined) {
      entries.push([fullName, value]);
    }
  });

  return entries;
}

/**
 * Wraps core's `resolveForwardChain` so a retrospective refusal names the pass
 * that raised it. The retrospective walk is not a `router.*` call — it runs over
 * a table that is already registered — and `README.md` documents
 * `[validation-plugin]` for this pass.
 *
 * ⚠ Core's own message opens with `[router] ` (#2456), and that head is
 * REPLACED rather than stacked: two prefixes on one message name two subsystems
 * for one fault.
 */
function resolveForwardChainWithPrefix(
  startRoute: string,
  forwardMap: Readonly<Record<string, string>>,
): string {
  try {
    return coreResolveForwardChain(startRoute, forwardMap);
  } catch (error) {
    const bare = (error as Error).message.replace(/^\[router\] /u, "");

    throw new Error(`[validation-plugin] ${bare}`, { cause: error });
  }
}

/**
 * Asserts that a function value is not async (native or transpiled).
 * Adapted from: assertNotAsync() in RoutesNamespace/validators.ts
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needs constructor.name access
function assertNotAsync(fn: Function, label: string, routeName: string): void {
  const function_ = fn as {
    constructor: { name: string };
    toString: () => string;
  };

  if (
    function_.constructor.name === "AsyncFunction" ||
    function_.toString().includes("__awaiter")
  ) {
    throw new TypeError(
      `[validation-plugin] Route "${routeName}" ${label} cannot be async`,
    );
  }
}

// =============================================================================
// 1. validateExistingRoutes
// =============================================================================

/**
 * Validates the existing routes for structural integrity.
 * Walks every route, checking each name and path shape.
 * Adapted from: validateRoutes() in RoutesNamespace/validators.ts
 *
 * Duplicate route names are intentionally NOT checked here. Bare core rejects a
 * duplicate name on every route-population entry point — `createRouter([...])`
 * initial routes (#1351), `add()` (within-batch #953 + the "already exists"
 * guard for cross-batch collisions), and `replace()` (#968) — so a built store
 * can never carry a duplicate for the retrospective pass to catch. Core is the
 * sole authority for the name-uniqueness invariant; a mirror here would be
 * reachable only from a white-box unit test (#1226).
 *
 * @param routes - Every top-level route, nested, as `RoutesApi.get` reports it
 * @throws {TypeError} If a route has structural issues
 */
export function validateExistingRoutes(routes: readonly RouteFacts[]): void {
  walkRoutes(routes, (route, fullName) => {
    if (typeof route.name !== "string" || !route.name) {
      throw new TypeError(
        `[validation-plugin] validateExistingRoutes: route has invalid name: ${route.name}`,
      );
    }

    // ⚑ No dotted-name check here, and its absence is load-bearing rather
    // than a cleanup. Bare core refuses a dotted route name at registration,
    // with this package's message (#1763), so `createRouter` throws before a
    // plugin exists and nothing dotted can reach this pass. The names walked
    // here come off the TREE, whose nested children carry bare names by
    // construction.

    if (typeof route.path !== "string") {
      throw new TypeError(
        `[validation-plugin] validateExistingRoutes: route "${fullName}" has non-string path (${typeof route.path})`,
      );
    }
  });
}

// =============================================================================
// 2. validateForwardToConsistency
// =============================================================================

/**
 * Validates forwardTo consistency across all chains.
 * Checks target existence, param compatibility, and circular chain detection.
 * Adapted from: validateForwardToTargets() in forwardToValidation.ts
 *
 * @param forwardMap - The ONE-HOP forward map, from `PluginApi.getForwardMap()`
 * @param lookup - Existence and path slots of routes that already exist
 * @throws {Error} If any forwardTo target does not exist in the tree
 * @throws {Error} If param incompatibility is detected across a forwardTo pair
 * @throws {Error} If a circular forwardTo chain is detected
 */
export function validateForwardToConsistency(
  forwardMap: Readonly<Record<string, string>>,
  lookup: RouteLookup,
): void {
  // Check target existence and param compatibility for each static mapping
  for (const [fromRoute, targetRoute] of objectEntries(forwardMap)) {
    if (!lookup.hasRoute(targetRoute)) {
      throw new Error(
        `[validation-plugin] validateForwardToConsistency: forwardTo target "${targetRoute}" ` +
          `does not exist in tree (source route: "${fromRoute}")`,
      );
    }

    // Validate param compatibility: target must not require params absent in source
    const sourceParams = new Set(lookup.getUrlParams(fromRoute));
    const missingParams = [...new Set(lookup.getUrlParams(targetRoute))].filter(
      (param) => !sourceParams.has(param),
    );

    if (missingParams.length > 0) {
      throw new Error(
        `[validation-plugin] validateForwardToConsistency: forwardTo target "${targetRoute}" ` +
          `requires params [${missingParams.join(", ")}] not available in source route "${fromRoute}"`,
      );
    }
  }

  // Detect cycles in the full forwardMap (catches multi-hop cycles)
  for (const fromRoute of objectKeys(forwardMap)) {
    resolveForwardChainWithPrefix(fromRoute, forwardMap);
  }
}

// =============================================================================
// 3. validateRouteProperties
// =============================================================================

/** Every entry of a default-bag slot is a plain object, or the route is bad. */
function assertPlainBagSlot(
  slot: [string, unknown][],
  slotName: "defaultParams" | "defaultSearch",
): void {
  for (const [routeName, bag] of slot) {
    if (bag === null || typeof bag !== "object" || Array.isArray(bag)) {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" ${slotName} must be a plain object, got ${Array.isArray(bag) ? "array" : typeof bag}`,
      );
    }
  }
}

/**
 * Validates route properties for every registered route.
 * Checks decoder/encoder types, defaultParams structure, and async forwardTo callbacks.
 * Adapted from: validateRouteProperties() in forwardToValidation.ts
 *
 * @param routes - Every top-level route, nested, as `RoutesApi.get` reports it
 * @throws {TypeError} If any registered decoder/encoder is not a valid sync function
 * @throws {TypeError} If any defaultParams is not a plain object
 * @throws {TypeError} If any forwardTo callback is async
 */
export function validateRoutePropertiesStore(
  routes: readonly RouteFacts[],
): void {
  const decoders = collectSlot(routes, (route) => route.decodeParams);
  const encoders = collectSlot(routes, (route) => route.encodeParams);
  // A string `forwardTo` is a target name, judged by the forward-map checks.
  const forwardCallbacks = collectSlot(routes, (route) =>
    typeof route.forwardTo === "string" ? undefined : route.forwardTo,
  );

  // Validate decoders — must be non-async functions (sync required for matchPath/buildPath)
  for (const [routeName, decoder] of decoders) {
    if (typeof decoder !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" decoder must be a function, got ${typeof decoder}`,
      );
    }

    assertNotAsync(decoder, "decoder", routeName);
  }

  // Validate encoders — must be non-async functions (sync required for matchPath/buildPath)
  for (const [routeName, encoder] of encoders) {
    if (typeof encoder !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" encoder must be a function, got ${typeof encoder}`,
      );
    }

    assertNotAsync(encoder, "encoder", routeName);
  }

  // The two default bags carry the same rule, one slot apart (#1787).
  // ⚠ Reachable only for a TRUTHY value: core drops a falsy structural field
  // before anything is stored, so this pass has nothing left to read for one.
  // `structural-field-coverage-authority-1787` derives that boundary.
  assertPlainBagSlot(
    collectSlot(routes, (route) => route.defaultParams),
    "defaultParams",
  );
  assertPlainBagSlot(
    collectSlot(routes, (route) => route.defaultSearch),
    "defaultSearch",
  );

  // Validate forwardTo function callbacks — must be non-async functions
  for (const [routeName, callback] of forwardCallbacks) {
    if (typeof callback !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" forwardTo callback must be a function, got ${typeof callback}`,
      );
    }

    assertNotAsync(callback, "forwardTo callback", routeName);
  }
}

// =============================================================================
// 4. validateForwardToTargets
// =============================================================================

/**
 * Validates that all static forwardTo targets exist in the route tree.
 * This is a focused existence-only check (param compat is in validateForwardToConsistency).
 * Adapted from: validateForwardToTargets() in forwardToValidation.ts
 *
 * @param forwardMap - The ONE-HOP forward map, from `PluginApi.getForwardMap()`
 * @param lookup - Existence of routes that already exist
 * @throws {Error} If any forwardTo target route does not exist in the tree
 */
export function validateForwardToTargetsStore(
  forwardMap: Readonly<Record<string, string>>,
  lookup: RouteLookup,
): void {
  for (const [fromRoute, targetRoute] of objectEntries(forwardMap)) {
    if (!lookup.hasRoute(targetRoute)) {
      throw new Error(
        `[validation-plugin] validateForwardToTargetsStore: forwardTo target "${targetRoute}" ` +
          `does not exist for route "${fromRoute}"`,
      );
    }
  }
}

// =============================================================================
// 5. validateDependenciesStructure
// =============================================================================

/**
 * Validates the dependency record and the resolved limits.
 *
 * ⚠ The getter walk reads core's LIVE dependency record, the one read of a
 * core store this pass makes. Core refuses a getter at every dependency
 * door, so the only way one lands there is `Object.defineProperty` through the
 * record `getInternals(router).dependenciesGetStore()` hands out, and the walk
 * exists for as long as that door does (#2386).
 *
 * @param dependencies - Core's dependency record
 * @param limits - The resolved limits, from `PluginApi.getResolvedLimits()`
 * @throws {TypeError} If a dependency is a getter
 * @throws {TypeError} If a limit is not an integer
 */
export function validateDependenciesStructure(
  dependencies: object,
  limits: Readonly<LimitsConfig>,
): void {
  // Getters can throw, return different values, or have side effects — reject them
  for (const key of objectKeys(dependencies)) {
    if (getOwnPropertyDescriptor(dependencies, key)?.get) {
      throw new TypeError(
        `[validation-plugin] validateDependenciesStructure: dependency "${key}" must not use a getter`,
      );
    }
  }

  for (const [key, value] of objectEntries(limits)) {
    // ⚑ `Number.isInteger`, not `typeof === "number"`. Core coerces the caller's
    // limits ONCE at construction (#1875), so every resolved limit is already
    // `typeof "number"` — and `Number(undefined)`, `Number("abc")` and
    // `Number({})` are all `NaN`, which passes a `typeof` test. The values
    // worth rejecting are spread across that type; `retrospective.test.ts`
    // owns which ones and reds on both `typeof` and `isFinite`. This also lands
    // the check on the same predicate `validateLimitValue` already uses, so the
    // two mirrors agree.
    if (!Number.isInteger(value)) {
      throw new TypeError(
        `[validation-plugin] validateDependenciesStructure: deps.limits.${key} must be an integer, got ${String(value)}`,
      );
    }
  }
}

// =============================================================================
// 6. validateLimitsConsistency
// =============================================================================

/**
 * Validates that the dependency count does not exceed the configured limit.
 * Adapted from: validateLimits() in OptionsNamespace/validators.ts
 *
 * @param options - Router options (typed as unknown to avoid core coupling)
 * @param dependencyCount - How many dependencies the router holds
 * @param resolvedMaxDependencies - `maxDependencies` from the resolved limits
 * @throws {RangeError} If dependency count exceeds maxDependencies limit (#1225:
 *   `>` not `>=` — an at-limit store is legal, mirroring the live limiter)
 */
export function validateLimitsConsistency(
  options: unknown,
  dependencyCount: number,
  resolvedMaxDependencies: number,
): void {
  const opts =
    options && typeof options === "object"
      ? (options as Record<string, unknown>)
      : {};
  const configuredLimits =
    opts.limits && typeof opts.limits === "object"
      ? (opts.limits as Record<string, unknown>)
      : {};
  const maxDepsFromOptions = configuredLimits.maxDependencies;
  const maxDeps =
    typeof maxDepsFromOptions === "number"
      ? maxDepsFromOptions
      : resolvedMaxDependencies;

  // `>`, not `>=` (#1225): the live limiter (`validateDependencyCount`) counts
  // BEFORE the insert, so a store may legally REACH exactly maxDependencies. This
  // retrospective pass checks committed STATE (re-run on usePlugin AND every
  // cloneRouter), so it must accept an at-limit store and reject only one that
  // STRICTLY exceeds the limit — else every SSR per-request clone of an at-limit
  // base throws.
  if (maxDeps > 0 && dependencyCount > maxDeps) {
    throw new RangeError(
      `[validation-plugin] validateLimitsConsistency: dependency count (${dependencyCount}) exceeds maxDependencies limit (${maxDeps})`,
    );
  }
}

// =============================================================================
// 7. validateResolvedDefaultRoute
// =============================================================================

/**
 * Validates that a resolved defaultRoute name points to a route that exists
 * in the tree. Called at two places:
 *
 *   1. At plugin registration (retrospective) — with the static string value
 *      of options.defaultRoute, if any.
 *   2. At runtime inside resolveDefault() — with the return value of a
 *      DefaultRouteCallback, on every navigateToDefault(). (`start()` has no
 *      `defaultRoute` fallback — measured, it consults the option zero times.)
 *
 * No-op for empty string (means "no default configured" — handled upstream by
 * NavigationNamespace.navigateToDefault).
 */
/** Shared predicate; each door owns its own head, so no prefix travels as data. */
function namesNoRoute(
  routeName: unknown,
  lookup: RouteLookup,
): routeName is string {
  return (
    typeof routeName === "string" &&
    routeName !== "" &&
    !lookup.hasRoute(routeName)
  );
}

/**
 * The retrospective pass, for a `defaultRoute` configured as a STRING. No call
 * reaches it — the sweep runs over a table that is already registered — so the
 * refusal names the package rather than a door.
 */
export function validateConfiguredDefaultRoute(
  routeName: unknown,
  lookup: RouteLookup,
): void {
  if (namesNoRoute(routeName, lookup)) {
    throw new Error(
      `[validation-plugin] defaultRoute resolved to non-existent route: "${routeName}"`,
    );
  }
}

/**
 * The runtime pass, for a `defaultRoute` configured as a CALLBACK. Reached from
 * `navigateToDefault()` alone, so the caller made a call they can look up and the
 * refusal names it. ⚠ It arrives as a rejected promise: the `catch` around
 * `resolveDefault()` preserves the user callback's throw shape.
 */
export function validateResolvedDefaultRoute(
  routeName: unknown,
  lookup: RouteLookup,
): void {
  if (namesNoRoute(routeName, lookup)) {
    throw new Error(
      `[router.navigateToDefault] defaultRoute callback resolved to non-existent route: "${routeName}"`,
    );
  }
}

/**
 * Reports EXTERNAL guards bound to a name the route tree does not carry
 * (#2049).
 *
 * ⚑ **Why this cannot live at the door.** Registering a guard before its route
 * exists is a declared, working capability — register for `"later"`, add the
 * route, navigate, and the guard fires. At `addActivateGuard` a typo and a
 * not-yet-added route are therefore indistinguishable, and a reject there would
 * retire the capability. `start()` is the first moment they come apart: the tree
 * is built by then, so a guard naming nothing is a typo or a route the
 * application will add later, and the second is rare after boot.
 *
 * ⚠ **A warning, not a throw, unlike `validateResolvedDefaultRoute` one door
 * over.** A `defaultRoute` naming nothing is unusable, so that one throws. A
 * guard for a route added after `start()` is unusual but legitimate — the
 * capability above is not scoped to before-start — so this reports and steps
 * aside.
 *
 * ⚠ **EXTERNAL origins only.** A definition guard arrives attached to a route in
 * the config, so its name cannot be a typo by construction; reporting it would
 * be noise no caller could act on. `PluginApi.getExternalGuardNames()` hands
 * out exactly that origin, each name once.
 */
export function warnOrphanedGuards(
  guardNames: readonly string[],
  lookup: RouteLookup,
  logger: RouterLogger,
): void {
  for (const name of guardNames) {
    if (!lookup.hasRoute(name)) {
      logger.warn(
        "router.start",
        `Guard registered for route "${name}", which the route tree does not contain. ` +
          `It will never run unless that route is added. Check the name for a typo.`,
      );
    }
  }
}
