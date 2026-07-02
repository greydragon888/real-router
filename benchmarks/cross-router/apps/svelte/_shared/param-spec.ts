// param-scaling spec: routes with N path params (/pN/:k1/.../:kN). Sweep reveals
// how each router's param-extraction cost scales with the number of params.
export const PARAM_COUNTS = [1, 10, 100] as const;

export function paramKeys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `k${i + 1}`);
}

// { k1: "v1", ... , kN: "vN" } — for real-router routeParams.
export function paramValues(n: number): Record<string, string> {
  return Object.fromEntries(paramKeys(n).map((k, i) => [k, `v${i + 1}`]));
}

// built URL: /pN/v1/.../vN
export function paramPath(n: number): string {
  return `/p${n}/${paramKeys(n)
    .map((_, i) => `v${i + 1}`)
    .join("/")}`;
}

// pattern: /pN/:k1/.../:kN  (prefix ":" for real-router/react-router/wouter, "$" for tanstack)
export function paramPattern(n: number, prefix: string): string {
  return `/p${n}/${paramKeys(n)
    .map((k) => `${prefix}${k}`)
    .join("/")}`;
}
