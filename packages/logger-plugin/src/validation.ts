// packages/logger-plugin/src/validation.ts

import { ERROR_PREFIX } from "./constants";

import type { LoggerPluginConfig } from "./types";

const VALID_LEVELS = new Set(["all", "transitions", "errors", "none"]);

export function validateOptions(options?: Partial<LoggerPluginConfig>): void {
  if (options === undefined) {
    return;
  }

  // Runtime defense: typeof null === "object", so check identity first.
  // TypeScript excludes null from the parameter type, but JS callers may pass it.
  if (options === (null as never) || typeof options !== "object") {
    throw new TypeError(`${ERROR_PREFIX} Options must be an object`);
  }

  if (options.level !== undefined && !VALID_LEVELS.has(options.level)) {
    throw new TypeError(
      `${ERROR_PREFIX} Invalid level: "${options.level}". Expected: ${[...VALID_LEVELS].join(", ")}`,
    );
  }

  if (
    options.context !== undefined &&
    (typeof options.context !== "string" || options.context.length === 0)
  ) {
    throw new TypeError(
      `${ERROR_PREFIX} Option "context" must be a non-empty string`,
    );
  }

  if (
    options.showTiming !== undefined &&
    typeof options.showTiming !== "boolean"
  ) {
    throw new TypeError(
      `${ERROR_PREFIX} Option "showTiming" must be a boolean`,
    );
  }

  if (
    options.showParamsDiff !== undefined &&
    typeof options.showParamsDiff !== "boolean"
  ) {
    throw new TypeError(
      `${ERROR_PREFIX} Option "showParamsDiff" must be a boolean`,
    );
  }

  if (
    options.usePerformanceMarks !== undefined &&
    typeof options.usePerformanceMarks !== "boolean"
  ) {
    throw new TypeError(
      `${ERROR_PREFIX} Option "usePerformanceMarks" must be a boolean`,
    );
  }
}
