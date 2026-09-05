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
 * escaped to `%25`. A `decodeURI`/`encodeURI` pair reaches the same output for
 * such input, by throwing and being caught — so the difference is that no
 * `URIError` is raised behind the scenes and no warning is printed.
 *
 * ⚑ Two classes differ, not one. Besides the corruption above, that pair also
 * NORMALISES an escape whose literal form needs none — `%41` comes back as `A`
 * — because `decodeURI` decodes the unreserved set. This does not: an escape is
 * left alone whatever it encodes. Measured harmless — the
 * matcher decodes `/files/%41` and `/files/A` to the same `"A"`, and `buildPath`
 * never emits such an escape in the first place, so the class is only reachable
 * from a hand-typed URL, where the address bar now keeps what was typed.
 *
 * `encodeURI` still throws on a lone surrogate — measured, not assumed — so the
 * guard below stays reachable and keeps its warning.
 *
 * ⚑ The `includes` is a fast path, and it is load-bearing: only browser-plugin
 * memoizes this call (`createDefaultBrowser`), while `navigation-plugin`'s
 * `getLocation` and `hash-plugin`'s `buildHashLocation` run it uncached, and
 * `getLocation` is read per popstate. A path containing `%` at all is the rare
 * case. Measured, 100 paths × 2000 iterations, medians, against the old
 * `encodeURI(decodeURI(p))`: ordinary path **−62.6 %** (86.7 ns vs 231.9),
 * non-ASCII path **−34.6 %**, and the path that does carry escapes +48.8 % —
 * which is the case this function was rewritten to get RIGHT, and 409 ns of it.
 * Without the `includes` the common path is only −18.2 %, so the branch buys
 * more than half the win.
 */
export const safelyEncodePath = (path: string): string => {
  try {
    return path.includes("%")
      ? path.replaceAll(/%[0-9A-Fa-f]{2}|[^%]+|%/g, (chunk) =>
          chunk.startsWith("%") ? chunk : encodeURI(chunk),
        )
      : encodeURI(path);
  } catch (error) {
    console.warn(`[browser-env] Could not encode path "${path}"`, error);

    return path;
  }
};
