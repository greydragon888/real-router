// packages/hash-plugin/src/validation.ts

import { LOGGER_CONTEXT, defaultOptions } from "./constants";

import type { HashPluginOptions } from "./types";

const expectedTypes: Record<keyof Required<HashPluginOptions>, string> = {
  hashPrefix: typeof defaultOptions.hashPrefix,
  base: typeof defaultOptions.base,
  forceDeactivate: typeof defaultOptions.forceDeactivate,
};

export function validateOptions(
  opts: Partial<HashPluginOptions> | undefined,
): void {
  if (!opts) {
    return;
  }

  for (const key of Object.keys(opts) as (keyof HashPluginOptions)[]) {
    if (key in expectedTypes) {
      const value = opts[key];
      const expected = expectedTypes[key];
      const actual = typeof value;

      if (value !== undefined && actual !== expected) {
        throw new Error(
          `[${LOGGER_CONTEXT}] Invalid type for '${key}': expected ${expected}, got ${actual}`,
        );
      }
    }
  }
}
