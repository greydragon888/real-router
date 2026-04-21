// packages/hash-plugin/src/hash-utils.ts

import { safeParseUrl } from "./browser-env";

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
  const path = prefixRegex ? hash.replace(prefixRegex, "") : hash.slice(1);

  return path || "/";
}

export function hashUrlToPath(url: string, prefixRegex: RegExp | null): string {
  const parsedUrl = safeParseUrl(url);
  const hashPath = extractHashPath(parsedUrl.hash, prefixRegex);

  return hashPath.includes("?") ? hashPath : hashPath + parsedUrl.search;
}
