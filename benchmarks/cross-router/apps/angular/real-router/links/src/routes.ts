import type { Route } from "@real-router/core";

// active-links spec: TAB_COUNT sibling routes /tab/1..N. Inlined from
// apps/solid/_shared/links-spec.ts.
// Sweep-aware: link count comes from `?n=` at load (default 100) so the
// active-links scenario measures 10 / 100 / 1000 links from one app.
const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
export const TAB_COUNT = _n > 0 ? _n : 100;
export const tabs: number[] = Array.from({ length: TAB_COUNT }, (_, i) => i + 1);

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...tabs.map((i) => ({ name: `tab${i}`, path: `/tab/${i}` })),
];
