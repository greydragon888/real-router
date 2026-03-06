// packages/hash-plugin/src/hash-utils.ts

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

/**
 * Parse a hash URL to extract the route path.
 *
 * @param url - URL to parse
 * @param hashPrefix - Hash prefix to strip
 * @param regExpCache - RegExp cache
 * @returns Extracted path with search params, or null on error
 */
export function hashUrlToPath(
  url: string,
  hashPrefix: string,
  regExpCache: RegExpCache,
): string | null {
  try {
    const parsedUrl = new URL(url, globalThis.location.origin);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      console.warn(`[${LOGGER_CONTEXT}] Invalid URL protocol in ${url}`);

      return null;
    }

    return (
      extractHashPath(parsedUrl.hash, hashPrefix, regExpCache) +
      parsedUrl.search
    );
  } catch (error) /* v8 ignore start */ {
    console.warn(`[${LOGGER_CONTEXT}] Could not parse url ${url}`, error);

    return null;
  } /* v8 ignore stop */
}
