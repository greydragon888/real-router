import { safeParseUrl } from "./url-parsing.js";

export function extractPath(pathname: string, base: string): string {
  if (!pathname) {
    return "/";
  }

  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    const stripped = pathname.slice(base.length);

    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function buildUrl(path: string, base: string): string {
  if (!path) {
    return base;
  }

  if (!base) {
    return path.startsWith("/") ? path : `/${path}`;
  }

  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export function urlToPath(url: string, base: string): string {
  const parsedUrl = safeParseUrl(url);

  return extractPath(parsedUrl.pathname, base) + parsedUrl.search;
}

/**
 * Parses an absolute URL and returns its path + search, stripped of `base`.
 * Alias of {@link urlToPath} kept for call-site readability — history-query
 * paths (Navigation API entries, etc.) are absolute URLs by contract.
 */
export function extractPathFromAbsoluteUrl(url: string, base: string): string {
  return urlToPath(url, base);
}
