// packages/validation-plugin/src/validators/options.ts

import { isObjKey } from "type-guards";

const VALID_OPTION_VALUES = {
  trailingSlash: ["strict", "never", "always", "preserve"] as const,
  queryParamsMode: ["default", "strict", "loose"] as const,
  urlParamsEncoding: ["default", "uri", "uriComponent", "none"] as const,
} as const;

const VALID_QUERY_PARAMS = {
  arrayFormat: ["none", "brackets", "index", "comma"] as const,
  booleanFormat: ["none", "string", "empty-true"] as const,
  nullFormat: ["default", "hidden"] as const,
} as const;

const VALID_LOGGER_LEVELS = [
  "all",
  "warn-error",
  "error-only",
  "none",
] as const;

const KNOWN_OPTIONS = new Set<string>([
  "defaultRoute",
  "defaultParams",
  "trailingSlash",
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
  maxEventDepth: number;
  maxLifecycleHandlers: number;
}

// Local constant - mirrors LIMIT_BOUNDS from @real-router/core/constants
// (not exported from @real-router/core public API)
const LIMIT_BOUNDS = {
  maxDependencies: { min: 0, max: 10_000 },
  maxPlugins: { min: 0, max: 1000 },
  maxListeners: { min: 0, max: 100_000 },
  warnListeners: { min: 0, max: 100_000 },
  maxEventDepth: { min: 0, max: 100 },
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

  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(LIMIT_BOUNDS, key)) {
      throw new TypeError(`[router.${methodName}] unknown limit: "${key}"`);
    }

    if (value === undefined) {
      continue;
    }

    validateLimitValue(key as keyof LimitsConfig, value, methodName);
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

function validateDefaultParams(
  defaultParams: unknown,
  methodName: string,
): void {
  if (defaultParams === undefined) {
    return;
  }

  if (typeof defaultParams === "function") {
    return;
  }

  if (
    !defaultParams ||
    typeof defaultParams !== "object" ||
    Array.isArray(defaultParams) ||
    defaultParams.constructor !== Object
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "defaultParams": expected plain object or function, got ${typeof defaultParams}`,
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

  for (const key of Object.keys(qp)) {
    if (!isObjKey(key, VALID_QUERY_PARAMS)) {
      throw new TypeError(
        `[router.${methodName}] Invalid "queryParams.${key}": unknown option`,
      );
    }

    validateStringEnum(
      qp[key],
      `queryParams.${key}`,
      VALID_QUERY_PARAMS[key],
      methodName,
    );
  }
}

function validateLoggerOption(loggerOpt: unknown, methodName: string): void {
  if (loggerOpt === undefined) {
    return;
  }

  if (!loggerOpt || typeof loggerOpt !== "object" || Array.isArray(loggerOpt)) {
    throw new TypeError(
      `[router.${methodName}] Invalid "logger": expected plain object`,
    );
  }

  const loggerOptions = loggerOpt as Record<string, unknown>;

  if (
    loggerOptions.level !== undefined &&
    !VALID_LOGGER_LEVELS.includes(
      loggerOptions.level as (typeof VALID_LOGGER_LEVELS)[number],
    )
  ) {
    const validLevelList = VALID_LOGGER_LEVELS.map((val) => `"${val}"`).join(
      ", ",
    );
    const levelDisplay =
      typeof loggerOptions.level === "string"
        ? loggerOptions.level
        : `(${typeof loggerOptions.level})`;

    throw new TypeError(
      `[router.${methodName}] Invalid "logger.level": "${levelDisplay}". Must be one of: ${validLevelList}`,
    );
  }

  if (
    loggerOptions.callback !== undefined &&
    typeof loggerOptions.callback !== "function"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "logger.callback": expected function`,
    );
  }

  if (
    loggerOptions.callbackIgnoresLevel !== undefined &&
    typeof loggerOptions.callbackIgnoresLevel !== "boolean"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "logger.callbackIgnoresLevel": expected boolean`,
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

  for (const key of Object.keys(opts)) {
    if (!KNOWN_OPTIONS.has(key)) {
      throw new TypeError(`[router.${methodName}] Unknown option: "${key}"`);
    }
  }

  validateDefaultRoute(opts.defaultRoute, methodName);
  validateDefaultParams(opts.defaultParams, methodName);
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

  validateQueryParamsOptions(opts.queryParams, methodName);
  validateLoggerOption(opts.logger, methodName);

  if (opts.limits !== undefined) {
    validateLimits(opts.limits, methodName);
  }
}
