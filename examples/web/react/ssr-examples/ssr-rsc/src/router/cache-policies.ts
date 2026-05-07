// Per-route HTTP cache policies for the RSC example. Maps a URL path
// (the SAME path the user navigates to, regardless of whether the
// response is full HTML or a Flight stream) to a `Cache-Control`
// header value. Both endpoints share the same policy:
//   - `GET /:path` returns SSR'd HTML
//   - `GET /__rsc?route=/:path` returns a Flight stream for the same
//     route — the consumer (App.tsx's router.subscribe) re-fetches it
//     on client-side navigation
// Production CDNs can therefore cache both shapes with the same
// freshness policy. The Vary header is NOT set in this demo (kept
// simple); a real deployment would `Vary: Accept` if HTML and Flight
// share a URL, or use distinct paths (we already do via /__rsc).
//
// IMPORTANT: ETag is NOT computed here. Both HTML and Flight
// responses are streamed (React 19 renderToReadableStream + RSC
// renderToReadableStream); buffering would defeat streaming.
// Production setups rely on CDN-level caching with the CDN's own
// buffered ETag layer. See ssr-streaming/cache-policies.ts for the
// same trade-off.

const CACHE_RULES: readonly {
  match: (path: string) => boolean;
  header: string;
}[] = [
  {
    match: (p) => p === "/" || p === "",
    header: "public, max-age=300, s-maxage=3600",
  },
  {
    match: (p) =>
      p === "/users" || /^\/users\/?$/.test(p) || p.startsWith("/users?"),
    header: "public, max-age=60",
  },
  {
    match: (p) => /^\/users\/[^/]+/.test(p),
    header: "public, max-age=120",
  },
  // Auth-sensitive variants of /users (filtered by ?role=admin).
  // Even though the underlying data is per-role, the response is
  // identical for all anon visitors — but we keep it shorter to
  // hint at the boundary.
  // (Already covered by the /users rule above; left as documentation.)
  {
    match: (p) => p === "/boom",
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
