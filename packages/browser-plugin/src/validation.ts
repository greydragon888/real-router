import { type DefaultBrowserPluginOptions, LOGGER_CONTEXT } from "./constants";

import type { BrowserPluginOptions } from "./types";

function isDefaultOptionKey(
  key: string,
  defaults: DefaultBrowserPluginOptions,
): key is keyof DefaultBrowserPluginOptions {
  return key in defaults;
}

function validateOptionType(
  key: keyof DefaultBrowserPluginOptions,
  value: unknown,
  expectedType: string,
): boolean {
  const actualType = typeof value;

  if (actualType !== expectedType && value !== undefined) {
    console.warn(
      `[${LOGGER_CONTEXT}] Invalid type for '${key}': expected ${expectedType}, got ${actualType}`,
    );

    return false;
  }

  return true;
}

export function validateOptions(
  opts: Partial<BrowserPluginOptions> | undefined,
  defaultOptions: DefaultBrowserPluginOptions,
): boolean {
  if (!opts) {
    return false;
  }

  let hasInvalidTypes = false;

  for (const key of Object.keys(opts)) {
    if (isDefaultOptionKey(key, defaultOptions)) {
      const expectedType = typeof defaultOptions[key];
      const value = opts[key];
      const isValid = validateOptionType(key, value, expectedType);

      if (!isValid) {
        hasInvalidTypes = true;
      }
    }
  }

  if (opts.useHash === true && "preserveHash" in opts) {
    console.warn(`[${LOGGER_CONTEXT}] preserveHash ignored in hash mode`);
  }

  if (opts.useHash === false && "hashPrefix" in opts) {
    const optsRecord = opts as unknown as Record<string, unknown>;
    const hashPrefix = optsRecord.hashPrefix;

    if (hashPrefix !== undefined && hashPrefix !== "") {
      console.warn(`[${LOGGER_CONTEXT}] hashPrefix ignored in history mode`);
    }
  }

  return hasInvalidTypes;
}
