// deep-config spec (Vue cohort) — nested chain /deep/l1/.../l90 with a layout at
// every level. Sweep navigates to depth D in DEEP_TARGETS to reveal nested-layout
// composition scaling. All three Vue routers support nested layouts.
export const DEEP_TARGETS = [3, 30, 60, 90] as const;
// DERIVED (audit 07-18 K19): the chain depth = the deepest sweep target. A free literal
// twin drifts silently — the exact class that twice broke the search sweep's angular copy.
export const DEEP_DEPTH = Math.max(...DEEP_TARGETS);

export function deepPath(d: number): string {
  let p = "/deep";
  for (let i = 1; i <= d; i++) p += `/l${i}`;
  return p;
}

export function deepName(d: number): string {
  let n = "deep";
  for (let i = 1; i <= d; i++) n += `.l${i}`;
  return n;
}
