import type { Route } from "@real-router/core";

// active-links spec: TAB_COUNT sibling routes /tab/1..N. Inlined from
// apps/solid/_shared/links-spec.ts.
export const TAB_COUNT = 100;
export const tabs: number[] = Array.from(
  { length: TAB_COUNT },
  (_, i) => i + 1,
);

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...tabs.map((i) => ({ name: `tab${i}`, path: `/tab/${i}` })),
];
