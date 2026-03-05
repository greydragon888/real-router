import { LOGGER_CONTEXT, defaultOptions } from "./constants";

import type { BrowserPluginOptions } from "./types";

const expectedTypes: Record<keyof Required<BrowserPluginOptions>, string> = {
  forceDeactivate: typeof defaultOptions.forceDeactivate,
  base: typeof defaultOptions.base,
};

export function validateOptions(
  opts: Partial<BrowserPluginOptions> | undefined,
): void {
  if (!opts) {
    return;
  }

  for (const key of Object.keys(opts) as (keyof BrowserPluginOptions)[]) {
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
