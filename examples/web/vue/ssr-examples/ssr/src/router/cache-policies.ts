// Per-route HTTP cache policies. Maps a URL path to a `Cache-Control`
// header value. Public/cacheable paths (home, marketing) get long
// max-age + s-maxage so CDNs can serve them; user-specific paths
// (profile, dashboard, admin) are private with short or no cache.
//
// The wire format is the standard HTTP `Cache-Control` directives:
//   - `public` / `private` — who may cache
//   - `max-age=N` — browser cache lifetime, seconds
//   - `s-maxage=N` — shared cache (CDN) lifetime, seconds
//   - `no-store` — never cache (auth-sensitive)
//   - `must-revalidate` — re-check with origin even if fresh-by-age
//
// Compose this with ETag generation in server/index.ts: even for short
// max-age, conditional GETs return 304 cheaply via If-None-Match.
//
// Used by both server/index.ts (production) and server/dev.ts (dev).

const CACHE_RULES: readonly {
  match: (path: string) => boolean;
  header: string;
}[] = [
  // Home: cacheable and long-lived; same for everyone.
  {
    match: (p) => p === "/" || p === "",
    header: "public, max-age=300, s-maxage=3600, must-revalidate",
  },
  // Users list: depends on ?sort, but data is non-sensitive — short
  // public cache. Browsers and CDNs may cache distinct query strings
  // independently if Vary header is set (we don't, kept simple).
  {
    match: (p) => /^\/users(\/?$|\?)/.test(p),
    header: "public, max-age=60, must-revalidate",
  },
  // User profile + posts: per-user but not auth-private. Short cache,
  // forces revalidation through ETag.
  {
    match: (p) => /^\/users\/[^/]+/.test(p),
    header: "public, max-age=120, must-revalidate",
  },
  // Auth-sensitive routes: never cache (browser, CDN, anywhere).
  {
    match: (p) => p === "/dashboard" || p === "/admin",
    header: "private, no-store",
  },
  // Slow / boom: skip caching (demo / error).
  {
    match: (p) => p === "/slow" || p === "/boom",
    header: "no-store",
  },
];

export function getCachePolicy(path: string): string | undefined {
  // Strip query string for matching (we keep ?sort handling in the
  // user list rule via regex).
  const onlyPath = path.split("?")[0] ?? path;

  for (const rule of CACHE_RULES) {
    if (rule.match(onlyPath) || rule.match(path)) {
      return rule.header;
    }
  }

  return undefined;
}
