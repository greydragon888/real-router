// search-param-scaling spec: routes with N *query* params (/sN?k1=v1&...&kN=vN).
// The REALISTIC high-count vector — marketplace / analytics URLs carry many
// filter / sort / tracking query params (a real AliExpress product URL has ~15,
// tracking URLs 30-50+), unlike PATH params which top out at ~4. The sweep reveals
// how each router's query handling scales AND — because the leaf reads EVERY value
// (`readSearch` below) — forces lazy routers (vue-router `route.query`, solid-router
// `useSearchParams`, react-router `useSearchParams`) to actually materialize, so the
// comparison is apples-to-apples: cost to make all declared params *usable*, not the
// fake "extract params the app then ignores" that a keys-only read measured.
export const SEARCH_COUNTS = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;

export function searchKeys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `k${i + 1}`);
}

// { k1: "v1", ..., kN: "vN" } — for real-router routeSearch (the query channel).
export function searchValues(n: number): Record<string, string> {
  return Object.fromEntries(searchKeys(n).map((k, i) => [k, `v${i + 1}`]));
}

// query string: k1=v1&k2=v2&...&kN=vN — for engines that navigate by full URL.
export function searchQuery(n: number): string {
  return searchKeys(n)
    .map((k, i) => `${k}=v${i + 1}`)
    .join("&");
}

// real-router query declaration appended to a route path: ?k1&k2&...&kN
export function searchDecl(n: number): string {
  return `?${searchKeys(n).join("&")}`;
}

// Reads EVERY k-param value (checksum = Σ value lengths) → forces the lazy routers
// to materialize, while emitting a single constant-size number (no per-param DOM
// churn — that would drown the router signal in framework render). Every app runs
// this identically, so the per-cohort delta is the router's query-exposure cost.
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
