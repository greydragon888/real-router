// active-links spec: a page rendering TAB_COUNT active-aware links to sibling
// routes /tab/1..N. On each navigation the router recomputes active state on
// ALL links → cost ∝ link count. Driver navigates tab-1 → tab-2.
// Sweep-aware: link count comes from `?n=` at load (default 100) so the
// active-links scenario measures 10 / 100 / 1000 links from one app.
const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
export const TAB_COUNT = _n > 0 ? _n : 100;
export const tabs: number[] = Array.from({ length: TAB_COUNT }, (_, i) => i + 1);
