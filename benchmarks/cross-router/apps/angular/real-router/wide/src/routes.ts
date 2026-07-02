import type { Route } from "@real-router/core";

// wide-config spec: a flat table of WIDE_COUNT sibling routes
// (/catalog/item-1..N). Matcher is a segment trie → match cost should stay
// ~flat across N. Inlined from apps/solid/_shared/wide-spec.ts.
const WIDE_COUNT = 1000;
const wideItems: number[] = Array.from({ length: WIDE_COUNT }, (_, i) => i + 1);

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...wideItems.map((n) => ({ name: `item${n}`, path: `/catalog/item-${n}` })),
];
