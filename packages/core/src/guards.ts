// packages/core/src/guards.ts

import type { LoggerConfig, LogLevelConfig, Route } from "./types";
import type { RouterValidator } from "./types/RouterValidator";

/**
 * Intrinsics captured before any application code can run.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these after boot. Measured on the uncaptured
 * form: one naive `Object.hasOwn` polyfill walked straight through five sibling
 * readers of the same intrinsic while the single captured guard held.
 */
const objectKeys = Object.keys;
/**
 * `Object.getOwnPropertyDescriptor`, captured before any application code runs.
 *
 * ⚑ The guard below is one of core's always-on invariant guards and it read a
 * mutable global at call time. Measured: patching that global to strip accessor
 * descriptors made `createRouter` ACCEPT a dependency getter it exists to
 * refuse, and the getter then ran twice. Same class, and the same fix, as the
 * captured `hasOwn` in `src/engine` — a guard is only as strong as the
 * intrinsic it reads when it runs.
 */
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

// ============================================================================
// Structural invariant guards (dependencies + route-tree shape)
// ============================================================================

export function guardDependencies(deps: unknown): void {
  if (
    !deps ||
    typeof deps !== "object" ||
    (deps as { constructor: unknown }).constructor !== Object
  ) {
    throw new TypeError("dependencies must be a plain object");
  }
  for (const key in deps as Record<string, unknown>) {
    if (getOwnPropertyDescriptor(deps, key)?.get) {
      throw new TypeError(`dependencies cannot contain getters: "${key}"`);
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- accepts any Route type */
export function guardRouteStructure(
  routes: Route<any>[],
  validator?: RouterValidator | null,
): void {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  for (const route of routes) {
    const routeValue: unknown = route;

    if (
      routeValue === null ||
      typeof routeValue !== "object" ||
      Array.isArray(routeValue)
    ) {
      throw new TypeError("route must be a non-array object");
    }

    validator?.routes.guardRouteCallbacks(route as Route);
    validator?.routes.guardNoAsyncCallbacks(route as Route);
    const children = (route as Route).children;

    if (children) {
      guardRouteStructure(children, validator);
    }
  }
}

// ============================================================================
// Logger config assertion (RealRouter-specific)
// ============================================================================

const VALID_LEVELS_SET = new Set<string>([
  "all",
  "warn-error",
  "error-only",
  "none",
]);

function isValidLevel(value: unknown): value is LogLevelConfig {
  return typeof value === "string" && VALID_LEVELS_SET.has(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
}

export function assertLoggerConfig(
  config: unknown,
): asserts config is LoggerConfig {
  if (typeof config !== "object") {
    throw new TypeError("Logger config must be an object");
  }

  // `typeof null === "object"`, so TS still sees `object | null` here — but the
  // sole caller (Router's ctor) gates on `if (loggerConfig)`, so null/falsy never
  // arrives; treat it as the non-null object the gate guarantees.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- gated caller never passes null
  const obj = config!;

  // Check for unknown properties
  for (const key of objectKeys(obj)) {
    if (
      key !== "level" &&
      key !== "callback" &&
      key !== "callbackIgnoresLevel"
    ) {
      throw new TypeError(`Unknown logger config property: "${key}"`);
    }
  }

  // Validate level if present
  if ("level" in obj && obj.level !== undefined && !isValidLevel(obj.level)) {
    throw new TypeError(
      `Invalid logger level: ${formatValue(obj.level)}. Expected: "all" | "warn-error" | "error-only" | "none"`,
    );
  }

  // Validate callback if present
  if (
    "callback" in obj &&
    obj.callback !== undefined &&
    typeof obj.callback !== "function"
  ) {
    throw new TypeError(
      `Logger callback must be a function, got ${typeof obj.callback}`,
    );
  }

  // Validate callbackIgnoresLevel if present (logger.configure does not type-check it)
  if (
    "callbackIgnoresLevel" in obj &&
    obj.callbackIgnoresLevel !== undefined &&
    typeof obj.callbackIgnoresLevel !== "boolean"
  ) {
    throw new TypeError(
      `Logger callbackIgnoresLevel must be a boolean, got ${typeof obj.callbackIgnoresLevel}`,
    );
  }
}
