// packages/hash-plugin/src/hash-utils.ts

import { safeParseUrl } from "browser-env";

import { LOGGER_CONTEXT } from "./constants";

export interface RegExpCache {
  get: (pattern: string) => RegExp;
}

const escapeRegExpCache = new Map<string, string>();

export const escapeRegExp = (str: string): string => {
  const cached = escapeRegExpCache.get(str);

  if (cached !== undefined) {
    return cached;
  }

  const escaped = str.replaceAll(/[$()*+.?[\\\]^{|}-]/g, String.raw`\$&`);

  escapeRegExpCache.set(str, escaped);

  return escaped;
};

export function createRegExpCache(): RegExpCache {
  const cache = new Map<string, RegExp>();

  return {
    get(pattern: string): RegExp {
      const cached = cache.get(pattern);

      if (cached !== undefined) {
        return cached;
      }

      const newRegExp = new RegExp(pattern);

      cache.set(pattern, newRegExp);

      return newRegExp;
    },
  };
}

/**
 * Extract path from URL hash, stripping hash prefix.
 *
 * @param hash - URL hash (e.g., "#/path" or "#!/path")
 * @param hashPrefix - Hash prefix to strip (e.g., "!")
 * @param regExpCache - RegExp cache for compiled patterns
 * @returns Extracted path (e.g., "/path")
 */
export function extractHashPath(
  hash: string,
  hashPrefix: string,
  regExpCache: RegExpCache,
): string {
  const escapedHashPrefix = escapeRegExp(hashPrefix);
  const path = escapedHashPrefix
    ? hash.replace(regExpCache.get(`^#${escapedHashPrefix}`), "")
    : hash.slice(1);

  return path || "/";
}

export function hashUrlToPath(
  url: string,
  hashPrefix: string,
  regExpCache: RegExpCache,
): string | null {
  const parsedUrl = safeParseUrl(url, LOGGER_CONTEXT);

  return parsedUrl
    ? extractHashPath(parsedUrl.hash, hashPrefix, regExpCache) +
        parsedUrl.search
    : null;
}
