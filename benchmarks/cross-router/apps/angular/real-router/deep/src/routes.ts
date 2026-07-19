import type { Route } from "@real-router/core";

// deep-config spec: nested chain /deep/l1/l2/.../l90 with a layout at every
// level. Inlined from apps/solid/_shared/deep-spec.ts.
export const DEEP_TARGETS = [3, 30, 60, 90] as const;
// DERIVED (audit 07-18 K19): the chain depth = the deepest sweep target. A free literal
// twin drifts silently — the exact class that twice broke the search sweep's angular copy.
export const DEEP_DEPTH = Math.max(...DEEP_TARGETS);

// real-router dotted route name to depth d: deep.l1.l2.....ld
export function deepName(d: number): string {
  let n = "deep";
  for (let i = 1; i <= d; i++) n += `.l${i}`;

  return n;
}

function buildRoute(k: number): Route {
  return {
    name: `l${k}`,
    path: `/l${k}`,
    children: k < DEEP_DEPTH ? [buildRoute(k + 1)] : [],
  };
}

export const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "deep", path: "/deep", children: [buildRoute(1)] },
];
