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

export function urlToPath(
  url: string,
  base: string,
  context: string,
): string | null {
  const parsedUrl = safeParseUrl(url, context);

  return parsedUrl
    ? extractPath(parsedUrl.pathname, base) + parsedUrl.search
    : null;
}

/**
 * Parses an absolute URL and returns its path + search, stripped of `base`.
 * Alias of {@link urlToPath} with an explicit non-null contract when the caller
 * already knows the URL is valid (e.g., sourced from the Navigation API or a
 * plugin-owned history store). Safe against malformed input — returns `null`.
 */
export function extractPathFromAbsoluteUrl(
  url: string,
  base: string,
  context: string,
): string | null {
  return urlToPath(url, base, context);
}
