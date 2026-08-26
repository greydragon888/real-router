export interface ParsedUrl {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Scheme-agnostic URL parser.
 *
 * Extracts `pathname`, `search`, and `hash` from any string — absolute
 * (`scheme://authority/path?q#h`), path-relative (`/path?q#h`), or opaque
 * (`data:...`, `javascript:...`). Never throws, never returns null.
 *
 * Routing does not care about scheme or authority, only about the path part.
 * This keeps `browser-plugin`, `navigation-plugin`, and `hash-plugin` working
 * in Electron (`file://`, `app://`), Tauri (`tauri://`, `https://`), and any
 * other webview that may ship with non-HTTP origins. See issue #496.
 */
const URL_DELIMITERS: ReadonlySet<string> = new Set(["/", "?", "#"]);

/**
 * A scheme, and only in the one position a scheme can occupy (#1921).
 *
 * ⚠ This was an UNANCHORED `indexOf("://")`, which asks "does this string
 * contain `://` anywhere" rather than "does this string BEGIN with a scheme".
 * For an absolute URL the first `://` is the real one, so that arc was right.
 * For a RELATIVE one the first `://` is whatever the query or the fragment
 * happens to carry — and everything before it was discarded, taking the path
 * AND the entire query with it. `?returnTo=` / `?redirect_uri=` / `?next=` is
 * the most common query value on the web, so `/login?returnTo=https://app.io/x`
 * parsed as the path `/x`: the router resolved a path the caller had put in a
 * query parameter.
 *
 * The shape is RFC 3986's: `scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`
 * — which is also why `1http://x/y` is a path and not a scheme.
 */
const SCHEME_PREFIX = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

export function safeParseUrl(url: string): ParsedUrl {
  let rest = url;

  const scheme = SCHEME_PREFIX.exec(rest);

  if (scheme) {
    const authorityStart = scheme[0].length;
    let pathStart = rest.length;

    for (let i = authorityStart; i < rest.length; i++) {
      const ch = rest[i];

      if (URL_DELIMITERS.has(ch)) {
        pathStart = i;

        break;
      }
    }

    rest = pathStart === rest.length ? "/" : rest.slice(pathStart);

    if (rest.startsWith("?") || rest.startsWith("#")) {
      rest = `/${rest}`;
    }
  }

  const hashIdx = rest.indexOf("#");
  const hash = hashIdx === -1 ? "" : rest.slice(hashIdx);
  const beforeHash = hashIdx === -1 ? rest : rest.slice(0, hashIdx);

  const queryIdx = beforeHash.indexOf("?");
  const search = queryIdx === -1 ? "" : beforeHash.slice(queryIdx);
  const pathname = queryIdx === -1 ? beforeHash : beforeHash.slice(0, queryIdx);

  return { pathname, search, hash };
}
