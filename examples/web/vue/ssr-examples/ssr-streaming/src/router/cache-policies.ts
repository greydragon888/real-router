// Per-route HTTP cache policies. Maps a URL path to a `Cache-Control`
// header value.
//
// IMPORTANT: this is the **streaming** SSR example. We do NOT compute
// ETag here — buffering the entire stream to hash it would defeat the
// streaming purpose (ETag requires final body bytes; streaming emits
// chunks as they resolve and never holds the full body in memory).
// Production streaming setups typically rely on:
//   1. CDN-level shared caching (s-maxage in Cache-Control + the CDN's
//      own ETag layer, applied AFTER the body is buffered into the CDN)
//   2. Or skip ETag entirely for streamed responses (clients re-fetch
//      on revalidate without the 304 fast-path)
// Cache-Control alone is still useful — it tells browsers and CDNs how
// long the response is fresh, even without the conditional-GET 304.

const CACHE_RULES: readonly {
  match: (path: string) => boolean;
  header: string;
}[] = [
  // Home: cacheable and long-lived; same for everyone.
  {
    match: (p) => p === "/" || p === "",
    header: "public, max-age=300, s-maxage=3600",
  },
  // Products list: short public cache.
  {
    match: (p) => p === "/products" || /^\/products\/?$/.test(p),
    header: "public, max-age=60",
  },
  // Product detail: per-product but not auth-private; medium cache.
  {
    match: (p) => /^\/products\/[^/]+/.test(p),
    header: "public, max-age=120",
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
