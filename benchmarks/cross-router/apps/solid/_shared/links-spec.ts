// active-links spec: a page rendering TAB_COUNT active-aware links to sibling
// routes /tab/1..N. On each navigation the router recomputes active state on
// ALL links → cost ∝ link count. Driver navigates tab-1 → tab-2.
export const TAB_COUNT = 100;
export const tabs: number[] = Array.from({ length: TAB_COUNT }, (_, i) => i + 1);
