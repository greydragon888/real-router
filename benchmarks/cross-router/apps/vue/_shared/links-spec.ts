// active-links spec (Vue cohort): TAB_COUNT active-aware links to /tab/1..N.
// On each navigation the router recomputes active state on ALL links.
export const TAB_COUNT = 100;
export const tabs: number[] = Array.from({ length: TAB_COUNT }, (_, i) => i + 1);
