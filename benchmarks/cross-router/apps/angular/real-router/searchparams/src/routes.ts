import type { Route } from "@real-router/core";

// search-param-scaling spec: routes with N *query* params (/sN?k1=v1&...&kN=vN).
// Inlined from apps/react/_shared/search-param-spec.ts — angular apps have no
// _shared dir, mirroring how params/src/routes.ts inlines the param spec.
export const SEARCH_COUNTS = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;

export function searchKeys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `k${i + 1}`);
}

// { k1: "v1", ..., kN: "vN" } — for real-router routeSearch (declared query lives
// in route.search, RFC-4 M2 / #1548).
export function searchValues(n: number): Record<string, string> {
  return Object.fromEntries(searchKeys(n).map((k, i) => [k, `v${i + 1}`]));
}

// real-router query declaration appended to a route path: ?k1&k2&...&kN
export function searchDecl(n: number): string {
  return `?${searchKeys(n).join("&")}`;
}

// Reads EVERY k-param value (checksum = Σ value lengths) → forces the lazy routers
// to materialize while emitting one constant-size number (no per-param DOM churn).
export function readSearch(entries: Iterable<[string, unknown]>): {
  count: number;
  checksum: number;
} {
  let count = 0;
  let checksum = 0;
  for (const [k, v] of entries) {
    if (!/^k\d+$/.test(k)) continue;
    count += 1;
    checksum += String(v).length;
  }
  return { count, checksum };
}

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...SEARCH_COUNTS.map((n) => ({ name: `s${n}`, path: `/s${n}${searchDecl(n)}` })),
];
