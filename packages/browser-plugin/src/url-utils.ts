// packages/browser-plugin/src/url-utils.ts

import { LOGGER_CONTEXT } from "./constants";

import type { URLParseOptions, RegExpCache } from "./types";

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

export function extractPath(
  pathname: string,
  hash: string,
  options: URLParseOptions,
  regExpCache: RegExpCache,
): string {
  if (options.useHash) {
    const escapedHashPrefix = escapeRegExp(options.hashPrefix);
    const path = escapedHashPrefix
      ? hash.replace(regExpCache.get(`^#${escapedHashPrefix}`), "")
      : hash.slice(1);

    return path || "/";
  }

  if (options.base) {
    const escapedBase = escapeRegExp(options.base);
    const stripped = pathname.replace(regExpCache.get(`^${escapedBase}`), "");

    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }

  return pathname;
}

export function urlToPath(
  url: string,
  options: URLParseOptions,
  regExpCache: RegExpCache,
): string | null {
  try {
    const parsedUrl = new URL(url, globalThis.location.origin);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      console.warn(`[${LOGGER_CONTEXT}] Invalid URL protocol in ${url}`);

      return null;
    }

    return (
      extractPath(parsedUrl.pathname, parsedUrl.hash, options, regExpCache) +
      parsedUrl.search
    );
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
