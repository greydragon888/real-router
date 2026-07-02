import type { Route } from "@real-router/core";

// param-scaling spec: routes with N path params (/pN/:k1/.../:kN). Inlined from
// apps/solid/_shared/param-spec.ts.
export const PARAM_COUNTS = [1, 10, 100] as const;

export function paramKeys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `k${i + 1}`);
}

// { k1: "v1", ..., kN: "vN" } — for real-router routeParams.
export function paramValues(n: number): Record<string, string> {
  return Object.fromEntries(paramKeys(n).map((k, i) => [k, `v${i + 1}`]));
}

// pattern: /pN/:k1/.../:kN
export function paramPattern(n: number): string {
  return `/p${n}/${paramKeys(n)
    .map((k) => `:${k}`)
    .join("/")}`;
}

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...PARAM_COUNTS.map((n) => ({ name: `p${n}`, path: paramPattern(n) })),
];
