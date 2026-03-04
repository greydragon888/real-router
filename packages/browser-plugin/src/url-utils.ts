// packages/browser-plugin/modules/url-utils.ts

import { LOGGER_CONTEXT } from "./constants";
import { escapeRegExp } from "./utils";

import type { URLParseOptions, RegExpCache } from "./types";

/**
 * Parses URL and extracts path using native URL API.
 * Handles hash mode, base path stripping, and edge cases (IPv6, Unicode).
 *
 * @returns Path string or null on parse error
 */
export function urlToPath(
  url: string,
  options: URLParseOptions,
  regExpCache: RegExpCache,
): string | null {
  try {
    const parsedUrl = new URL(url, globalThis.location.origin);
    const pathname = parsedUrl.pathname;
    const hash = parsedUrl.hash;
    const search = parsedUrl.search;
    const base = options.base ?? "";

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      console.warn(`[${LOGGER_CONTEXT}] Invalid URL protocol in ${url}`);

      return null;
    }

    if (options.useHash) {
      const hashPrefix = options.hashPrefix ?? "";
      const escapedHashPrefix = escapeRegExp(hashPrefix);
      const path = escapedHashPrefix
        ? hash.replace(regExpCache.get(`^#${escapedHashPrefix}`), "")
        : hash.slice(1);

      return path + search;
    } else if (base) {
      const escapedBase = escapeRegExp(base);
      const baseRegExp = regExpCache.get(`^${escapedBase}`);
      const stripped = pathname.replace(baseRegExp, "");

      return (stripped.startsWith("/") ? "" : "/") + stripped + search;
    }

    return pathname + search;
  } catch (error) {
    console.warn(`[${LOGGER_CONTEXT}] Could not parse url ${url}`, error);

    return null;
  }
}

export function buildUrl(path: string, base: string, prefix: string): string {
  return base + prefix + path;
}

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
