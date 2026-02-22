// packages/core/src/typeGuards.ts

/**
 * Re-export common type guards from centralized type-guards package
 */
import type { LoggerConfig, LogLevelConfig } from "@real-router/logger";

export {
  isObjKey,
  isString,
  isState,
  isParams,
  isNavigationOptions,
  isBoolean,
  validateRouteName,
} from "type-guards";

/**
 * RealRouter-specific type guards for logger configuration
 */

const VALID_LEVELS_SET = new Set<string>(["all", "warn-error", "error-only"]);

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

export function isLoggerConfig(config: unknown): config is LoggerConfig {
  if (typeof config !== "object" || config === null) {
    throw new TypeError("Logger config must be an object");
  }

  const obj = config;

  // Check for unknown properties
  for (const key of Object.keys(obj)) {
    if (key !== "level" && key !== "callback") {
      throw new TypeError(`Unknown logger config property: "${key}"`);
    }
  }

  // Validate level if present
  if ("level" in obj && obj.level !== undefined && !isValidLevel(obj.level)) {
    throw new TypeError(
      `Invalid logger level: ${formatValue(obj.level)}. Expected: "all" | "warn-error" | "error-only"`,
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

  return true;
}
