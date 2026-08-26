/**
 * Normalizes base path to canonical form: leading slash, no trailing slash,
 * no repeated slashes. Isolated "/" collapses to "".
 *
 * @example
 * normalizeBase("app")     // "/app"
 * normalizeBase("/app/")   // "/app"
 * normalizeBase("//app//") // "/app"
 * normalizeBase("")        // ""
 * normalizeBase("/")       // ""
 */
export function normalizeBase(base: string): string {
  if (!base) {
    return base;
  }

  let result = base.replaceAll(/\/+/g, "/");

  if (!result.startsWith("/")) {
    result = `/${result}`;
  }

  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }

  return result === "/" ? "" : result;
}

/**
 * Makes a path safe to hand to the History API: whatever still needs escaping
 * gets escaped, and whatever is ALREADY escaped is left exactly as it was.
 *
 * ⚠ The second half is the whole point, and it is why this is not
 * `encodeURI(decodeURI(path))` (#1920). Those two are NOT inverses over the
 * escapes of RFC-3986 reserved characters: `decodeURI` deliberately PRESERVES
 * them — that is its defining difference from `decodeURIComponent` — and
 * `encodeURI` then escapes the `%` that survived. So `%2F` became `%252F`, once
 * and permanently, on a path `buildPath` had just produced correctly. `%2F` is
 * the only legal way to carry a literal `/` inside a segment, and
 * `createStartInterceptor` feeds `browser.getLocation()` through here on every
 * page reload, so a param holding any reserved character came back corrupted
 * and the address bar kept the corruption.
 *
 * ⚑ A `%` that begins nothing interpretable is left WHERE IT IS rather than
 * escaped to `%25`. That is what the old catch branch already did (the throw was
 * how it got there), so this fix changes the corrupted class and nothing else;
 * escaping it instead is a separate decision, and a wider one.
 *
 * `encodeURI` still throws on a lone surrogate — measured, not assumed — so the
 * guard below stays reachable and keeps its warning.
 */
export const safelyEncodePath = (path: string): string => {
  try {
    return path.replaceAll(/%[0-9A-Fa-f]{2}|[^%]+|%/g, (chunk) =>
      chunk.startsWith("%") ? chunk : encodeURI(chunk),
    );
  } catch (error) {
    console.warn(`[browser-env] Could not encode path "${path}"`, error);

    return path;
  }
};
