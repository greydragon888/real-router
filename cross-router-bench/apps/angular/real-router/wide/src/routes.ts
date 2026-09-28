import type { Route } from "@real-router/core";

// wide-config spec: a flat table of WIDE_COUNT sibling routes
// (/catalog/item-1..N). Matcher is a segment trie → match cost should stay
// ~flat across N. Inlined from apps/solid/_shared/wide-spec.ts.
export const WIDE_TARGETS = [4, 8, 16, 32, 64, 128, 256, 512, 1024] as const; // sweep positions the driver clicks (app.component imports this)
const WIDE_COUNT = Math.max(...WIDE_TARGETS); // build exactly enough sibling routes
const wideItems: number[] = Array.from({ length: WIDE_COUNT }, (_, i) => i + 1);

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...wideItems.map((n) => ({ name: `item${n}`, path: `/catalog/item-${n}` })),
];
