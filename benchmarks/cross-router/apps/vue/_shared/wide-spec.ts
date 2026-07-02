// wide-config spec (Vue cohort) — a flat table of N sibling routes
// (/catalog/item-1..N). Sweep navigates to positions in WIDE_TARGETS to reveal
// matcher scaling (linear scan vs trie). Same table for every engine.
export const WIDE_COUNT = 1000;
export const WIDE_TARGETS = [10, 100, 1000] as const;
export const wideItems: number[] = Array.from(
  { length: WIDE_COUNT },
  (_, i) => i + 1,
);
