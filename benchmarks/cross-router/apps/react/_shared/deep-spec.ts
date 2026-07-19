// deep-config spec: a nested chain /deep/l1/l2/.../l90 with a layout at every
// level. Sweep navigates to depth D in DEEP_TARGETS to reveal match + nested
// layout/Outlet composition scaling. Shared so every engine builds the SAME
// depth. D=90 is safe: the render is fiber-iterative (no render-stack overflow)
// and the config recursion (buildRoute/buildLevel) is far below the JS stack
// limit. The wider 3→90 range makes the cost-vs-depth curve unambiguous.
export const DEEP_TARGETS = [3, 30, 60, 90] as const;
// DERIVED (audit 07-18 K19): the chain depth = the deepest sweep target. A free literal
// twin drifts silently — the exact class that twice broke the search sweep's angular copy.
export const DEEP_DEPTH = Math.max(...DEEP_TARGETS);

// URL path to depth d: /deep/l1/l2/.../ld
export function deepPath(d: number): string {
  let p = "/deep";
  for (let i = 1; i <= d; i++) p += `/l${i}`;
  return p;
}

// real-router dotted route name to depth d: deep.l1.l2.....ld
export function deepName(d: number): string {
  let n = "deep";
  for (let i = 1; i <= d; i++) n += `.l${i}`;
  return n;
}
