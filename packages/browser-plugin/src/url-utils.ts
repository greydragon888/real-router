// packages/browser-plugin/src/url-utils.ts

import { safeParseUrl } from "browser-env";

import { LOGGER_CONTEXT } from "./constants";

export function extractPath(pathname: string, base: string): string {
  if (base && pathname.startsWith(base)) {
    const stripped = pathname.slice(base.length);

    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }

  return pathname;
}

export function buildUrl(path: string, base: string): string {
  return base + path;
}

export function urlToPath(url: string, base: string): string | null {
  const parsedUrl = safeParseUrl(url, LOGGER_CONTEXT);

  return parsedUrl
    ? extractPath(parsedUrl.pathname, base) + parsedUrl.search
    : null;
}
