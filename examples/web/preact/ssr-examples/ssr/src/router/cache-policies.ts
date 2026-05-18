// Per-route HTTP cache policies. Maps a URL path to a `Cache-Control`
// header value. Public/cacheable paths (home, marketing) get long
// max-age + s-maxage so CDNs can serve them; user-specific paths
// (profile, dashboard, admin) are private with short or no cache.

const CACHE_RULES: readonly {
  match: (path: string) => boolean;
  header: string;
}[] = [
  {
    match: (p) => p === "/" || p === "",
    header: "public, max-age=300, s-maxage=3600, must-revalidate",
  },
  {
    match: (p) => /^\/users(\/?$|\?)/.test(p),
    header: "public, max-age=60, must-revalidate",
  },
  {
    match: (p) => /^\/users\/[^/]+/.test(p),
    header: "public, max-age=120, must-revalidate",
  },
  {
    match: (p) => p === "/dashboard" || p === "/admin",
    header: "private, no-store",
  },
  {
    match: (p) => p === "/slow" || p === "/boom",
    header: "no-store",
  },
];

export function getCachePolicy(path: string): string | undefined {
  const onlyPath = path.split("?")[0] ?? path;

  for (const rule of CACHE_RULES) {
    if (rule.match(onlyPath) || rule.match(path)) {
      return rule.header;
    }
  }

  return undefined;
}
