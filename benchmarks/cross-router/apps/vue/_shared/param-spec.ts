// param-scaling spec (Vue cohort): routes with N path params (/pN/:k1/.../:kN).
// `prefix` differs per engine — real-router/vue-router use ":", tanstack "$".
export const PARAM_COUNTS = [1, 10, 100] as const;

export function paramKeys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `k${i + 1}`);
}

export function paramValues(n: number): Record<string, string> {
  return Object.fromEntries(paramKeys(n).map((k, i) => [k, `v${i + 1}`]));
}

export function paramPath(n: number): string {
  return `/p${n}/${paramKeys(n)
    .map((_, i) => `v${i + 1}`)
    .join("/")}`;
}

export function paramPattern(n: number, prefix: string): string {
  return `/p${n}/${paramKeys(n)
    .map((k) => `${prefix}${k}`)
    .join("/")}`;
}
