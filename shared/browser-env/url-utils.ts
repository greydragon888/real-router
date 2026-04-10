import { safeParseUrl } from "./url-parsing.js";

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
