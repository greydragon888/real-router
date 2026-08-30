// packages/validation-plugin/src/validators/options.ts

import { isObjKey } from "../type-guards";

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
const hasOwn = Object.hasOwn;
const objectKeys = Object.keys;

const VALID_OPTION_VALUES = {
  trailingSlash: ["strict", "never", "always", "preserve"] as const,
  queryParamsMode: ["default", "strict", "loose"] as const,
  urlParamsEncoding: ["default", "uri", "uriComponent", "none"] as const,
} as const;

const VALID_QUERY_PARAMS = {
  arrayFormat: ["none", "brackets", "index", "comma"] as const,
  booleanFormat: ["none", "auto", "empty-true"] as const,
  nullFormat: ["default", "hidden"] as const,
  numberFormat: ["none", "auto"] as const,
} as const;

// `logger` is a valid option name, but its contents are NOT validated here.
// The Router constructor consumes `options.logger` (applies it to the
// process-global logger singleton via `logger.configure()`) and strips the key
// before options are stored (#724). The retrospective pass reads the stored,
// logger-stripped options, so any logger validation in this plugin is dead on
// the live path. Logger config is therefore validated solely by core's
// `isLoggerConfig` guard at construction — the only place the input exists (#789).
const KNOWN_OPTIONS = new Set<string>([
  "defaultRoute",
  "defaultParams",
  "defaultSearch",
  "trailingSlash",
  "caseSensitive",
  "queryParamsMode",
  "queryParams",
  "urlParamsEncoding",
  "allowNotFound",
  "rewritePathOnMatch",
  "logger",
  "limits",
]);

// Local type - mirrors LimitsConfig from @real-router/types
// (@real-router/types is not a direct dependency of this package)
interface LimitsConfig {
  maxDependencies: number;
  maxPlugins: number;
  maxListeners: number;
  warnListeners: number;
  maxLifecycleHandlers: number;
}

// Single source of truth (plugin-owned): core has no `LIMIT_BOUNDS` constant and
// does not enforce these bounds — this constant is the sole owner.
const LIMIT_BOUNDS = {
  maxDependencies: { min: 0, max: 10_000 },
  maxPlugins: { min: 0, max: 1000 },
  maxListeners: { min: 0, max: 100_000 },
  warnListeners: { min: 0, max: 100_000 },
  maxLifecycleHandlers: { min: 0, max: 10_000 },
} as const;

export function validateLimitValue(
  limitName: keyof LimitsConfig,
  value: unknown,
  methodName: string,
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(
      `[router.${methodName}] limit "${limitName}" must be an integer, got ${String(value)}`,
    );
  }

  const bounds = LIMIT_BOUNDS[limitName];

  if (value < bounds.min || value > bounds.max) {
    throw new RangeError(
      `[router.${methodName}] limit "${limitName}" must be between ${bounds.min} and ${bounds.max}, got ${value}`,
    );
  }
}

export function validateLimits(
  limits: unknown,
  methodName: string,
): asserts limits is Partial<LimitsConfig> {
  if (!limits || typeof limits !== "object" || limits.constructor !== Object) {
    throw new TypeError(
      `[router.${methodName}] invalid limits: expected plain object, got ${typeof limits}`,
    );
  }

  for (const [key, value] of objectEntries(limits)) {
    if (!hasOwn(LIMIT_BOUNDS, key)) {
      throw new TypeError(`[router.${methodName}] unknown limit: "${key}"`);
    }

    if (value === undefined) {
      continue;
    }

    validateLimitValue(key as keyof LimitsConfig, value, methodName);
  }

  const { warnListeners, maxListeners } = limits as Partial<LimitsConfig>;

  if (
    typeof warnListeners === "number" &&
    typeof maxListeners === "number" &&
    maxListeners > 0 &&
    warnListeners > maxListeners
  ) {
    throw new RangeError(
      `[router.${methodName}] "limits.warnListeners" (${warnListeners}) must not exceed "limits.maxListeners" (${maxListeners}) — the warning channel would be unreachable`,
    );
  }
}

function validateStringEnum(
  value: unknown,
  optionName: string,
  validValues: readonly string[],
  methodName: string,
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || !validValues.includes(value)) {
    const validList = validValues.map((val) => `"${val}"`).join(", ");
    const display = typeof value === "string" ? value : `(${typeof value})`;

    throw new TypeError(
      `[router.${methodName}] Invalid "${optionName}": "${display}". Must be one of: ${validList}`,
    );
  }
}

function validateDefaultRoute(defaultRoute: unknown, methodName: string): void {
  if (defaultRoute === undefined) {
    return;
  }

  if (typeof defaultRoute !== "string" && typeof defaultRoute !== "function") {
    throw new TypeError(
      `[router.${methodName}] Invalid "defaultRoute": expected string or function, got ${typeof defaultRoute}`,
    );
  }
}

/**
 * Shared by `defaultParams` and its query-channel twin `defaultSearch` — one
 * rule, two channels (RFC-4 M2 / #1548). Parameterised by the option name
 * rather than copied, so the two can never drift into accepting different
 * shapes for the same kind of value.
 */
function validateDefaultBag(
  value: unknown,
  optionName: string,
  methodName: string,
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value === "function") {
    return;
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.constructor !== Object
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "${optionName}": expected plain object or function, got ${typeof value}`,
    );
  }
}

function validateQueryParamsOptions(
  queryParams: unknown,
  methodName: string,
): void {
  if (queryParams === undefined) {
    return;
  }

  if (
    !queryParams ||
    typeof queryParams !== "object" ||
    Array.isArray(queryParams)
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "queryParams": expected plain object`,
    );
  }

  const qp = queryParams as Record<string, unknown>;

  for (const [key, value] of objectEntries(qp)) {
    if (!isObjKey(key, VALID_QUERY_PARAMS)) {
      throw new TypeError(
        `[router.${methodName}] Invalid "queryParams.${key}": unknown option`,
      );
    }

    validateStringEnum(
      value,
      `queryParams.${key}`,
      VALID_QUERY_PARAMS[key],
      methodName,
    );
  }
}

export function validateOptions(options: unknown, methodName: string): void {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(
      `[router.${methodName}] Invalid options: expected plain object`,
    );
  }

  const opts = options as Record<string, unknown>;

  for (const key of objectKeys(opts)) {
    if (!KNOWN_OPTIONS.has(key)) {
      throw new TypeError(`[router.${methodName}] Unknown option: "${key}"`);
    }
  }

  validateDefaultRoute(opts.defaultRoute, methodName);
  validateDefaultBag(opts.defaultParams, "defaultParams", methodName);
  validateDefaultBag(opts.defaultSearch, "defaultSearch", methodName);
  validateStringEnum(
    opts.trailingSlash,
    "trailingSlash",
    VALID_OPTION_VALUES.trailingSlash,
    methodName,
  );
  validateStringEnum(
    opts.queryParamsMode,
    "queryParamsMode",
    VALID_OPTION_VALUES.queryParamsMode,
    methodName,
  );
  validateStringEnum(
    opts.urlParamsEncoding,
    "urlParamsEncoding",
    VALID_OPTION_VALUES.urlParamsEncoding,
    methodName,
  );

  if (
    opts.allowNotFound !== undefined &&
    typeof opts.allowNotFound !== "boolean"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "allowNotFound": expected boolean, got ${typeof opts.allowNotFound}`,
    );
  }

  if (
    opts.rewritePathOnMatch !== undefined &&
    typeof opts.rewritePathOnMatch !== "boolean"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "rewritePathOnMatch": expected boolean, got ${typeof opts.rewritePathOnMatch}`,
    );
  }

  if (
    opts.caseSensitive !== undefined &&
    typeof opts.caseSensitive !== "boolean"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "caseSensitive": expected boolean, got ${typeof opts.caseSensitive}`,
    );
  }

  validateQueryParamsOptions(opts.queryParams, methodName);

  if (opts.limits !== undefined) {
    validateLimits(opts.limits, methodName);
  }
}
