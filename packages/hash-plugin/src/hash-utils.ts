// packages/hash-plugin/src/hash-utils.ts

import { safelyEncodePath, safeParseUrl } from "./browser-env";

function escapeRegExp(str: string): string {
  return str.replaceAll(/[$()*+.?[\\\]^{|}-]/g, String.raw`\$&`);
}

export function createHashPrefixRegex(hashPrefix: string): RegExp | null {
  if (!hashPrefix) {
    return null;
  }

  return new RegExp(`^#${escapeRegExp(hashPrefix)}`);
}

/**
 * Extract path from URL hash, stripping hash prefix.
 *
 * @param hash - URL hash (e.g., "#/path" or "#!/path")
 * @param prefixRegex - Pre-compiled regex for prefix stripping (null if no prefix)
 * @returns Extracted path (e.g., "/path")
 */
export function extractHashPath(
  hash: string,
  prefixRegex: RegExp | null,
): string {
  if (hash === "" || hash === "#") {
    return "/";
  }

  const path = prefixRegex ? hash.replace(prefixRegex, "") : hash.slice(1);

  return path || "/";
}

export function hashUrlToPath(url: string, prefixRegex: RegExp | null): string {
  const parsedUrl = safeParseUrl(url);
  const hashPath = extractHashPath(parsedUrl.hash, prefixRegex);

  return hashPath.includes("?") ? hashPath : hashPath + parsedUrl.search;
}

/**
 * Build the router-side location string from a hash + query pair.
 *
 * Encodes the hash path via `safelyEncodePath` after stripping the
 * configured prefix, then appends the outer `search` only when the hash
 * path itself does not already carry a `?` — otherwise the outer search
 * would be duplicated (see `url.test.ts` — "well-formed path (no double '?')").
 *
 * Used by the `createSafeBrowser` `getLocation` callback both in the
 * production factory and in functional/stress test helpers. Extracting
 * here keeps the production path and test mocks aligned; a regression in
 * this logic previously slipped between the two.
 */
export function buildHashLocation(
  hash: string,
  search: string,
  prefixRegex: RegExp | null,
): string {
  const hashPath = safelyEncodePath(extractHashPath(hash, prefixRegex));

  return hashPath.includes("?") ? hashPath : hashPath + search;
}
