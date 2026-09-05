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
 * A scheme, matched ONLY in the one position a scheme can occupy (#1921).
 *
 * ⚠ The anchor is the whole predicate. An UNANCHORED `indexOf("://")` asks
 * "does this string contain `://` anywhere" rather than "does this string BEGIN
 * with a scheme". For an absolute URL the first `://` is the real one, so that
 * arc agrees. For a RELATIVE one the first `://` is whatever the query or the
 * fragment happens to carry — and everything before it is discarded, taking the
 * path AND the entire query with it. `?returnTo=` / `?redirect_uri=` / `?next=` is
 * the most common query value on the web, so `/login?returnTo=https://app.io/x`
 * parsed as the path `/x`: the router resolved a path the caller had put in a
 * query parameter.
 *
 * The accepted shape is RFC 3986's
 * `scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )` — which is also why
 * `1http://x/y` is a path and not a scheme.
 *
 * ⚑ It costs something, and the cost was measured rather than waved through:
 * `hasVisited` / `getVisitedRoutes` run this over EVERY session-history entry,
 * which is why the rest of the parser is hand-written (#496). Against the old
 * `indexOf`, 100 entries × 2000 iterations, medians: **+10.4 % on absolute URLs**
 * (+13.5 ns/call, so +1.35 µs per 100-entry walk) and +0.3 % on relative ones.
 * Validating a scheme is strictly more work than finding `://` — that is the
 * price of asking the right question, and at ~1 µs per full history walk it is
 * not worth trading for.
 *
 * ⚑ Two hand-written forms were measured and BOTH lost. A `charCodeAt` range
 * loop was fastest (+3.6 % absolute, −27 % relative) but `unicorn/prefer-code-
 * point` forbids `charCodeAt`, and the `codePointAt` rewrite cannot avoid an
 * `undefined` branch that is unreachable for `i < url.length` — which the 100 %
 * branch-coverage gate then fails on. A `Set`-of-characters loop in this file's
 * own idiom is lint-legal but **+21.6 %**, worse than the regex. Do not
 * "optimise" this back into a loop without re-measuring all three.
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
