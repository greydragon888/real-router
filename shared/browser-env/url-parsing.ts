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
export function safeParseUrl(url: string): ParsedUrl {
  let rest = url;

  const schemeIdx = rest.indexOf("://");

  if (schemeIdx !== -1) {
    const authorityStart = schemeIdx + 3;
    let pathStart = rest.length;

    for (let i = authorityStart; i < rest.length; i++) {
      const ch = rest[i];

      if (ch === "/" || ch === "?" || ch === "#") {
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
