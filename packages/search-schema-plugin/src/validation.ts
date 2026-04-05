import { ERROR_PREFIX } from "./constants";

import type { SearchSchemaPluginOptions } from "./types";

const VALID_MODES = new Set(["development", "production"]);

export function validateOptions(options: SearchSchemaPluginOptions): void {
  if (options.mode !== undefined && !VALID_MODES.has(options.mode)) {
    throw new TypeError(
      `${ERROR_PREFIX} Invalid mode: "${options.mode}". Must be "development" or "production".`,
    );
  }

  if (options.strict !== undefined && typeof options.strict !== "boolean") {
    throw new TypeError(
      `${ERROR_PREFIX} Invalid strict option: expected boolean, got ${typeof options.strict}.`,
    );
  }

  if (options.onError !== undefined && typeof options.onError !== "function") {
    throw new TypeError(
      `${ERROR_PREFIX} Invalid onError: expected function, got ${typeof options.onError}.`,
    );
  }
}
