// packages/browser-plugin/src/url-utils.ts

import { LOGGER_CONTEXT } from "./constants";

export function extractPath(pathname: string, base: string): string {
  if (base) {
    if (pathname.startsWith(base)) {
      const stripped = pathname.slice(base.length);

      return stripped.startsWith("/") ? stripped : `/${stripped}`;
    }

    return pathname;
  }

  return pathname;
}

export function urlToPath(url: string, base: string): string | null {
  try {
    const parsedUrl = new URL(url, globalThis.location.origin);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      console.warn(`[${LOGGER_CONTEXT}] Invalid URL protocol in ${url}`);

      return null;
    }

    return extractPath(parsedUrl.pathname, base) + parsedUrl.search;
  } catch (error) {
    console.warn(`[${LOGGER_CONTEXT}] Could not parse url ${url}`, error);

    return null;
  }
}

export function buildUrl(path: string, base: string): string {
  return base + path;
}
