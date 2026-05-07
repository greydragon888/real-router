// Per-route HTTP cache policies for streaming SSR. Same shape as
// classical SSR but no ETag (streaming + content hashing don't mix).

const CACHE_RULES: readonly {
  match: (path: string) => boolean;
  header: string;
}[] = [
  {
    match: (p) => p === "/" || p === "",
    header: "public, max-age=300, s-maxage=3600, must-revalidate",
  },
  {
    match: (p) => p === "/products" || p === "/products/",
    header: "public, max-age=60, must-revalidate",
  },
  {
    match: (p) => /^\/products\/[^/]+/.test(p),
    header: "public, max-age=120, must-revalidate",
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
