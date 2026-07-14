// wide-config spec (Vue cohort) — a flat table of N sibling routes
// (/catalog/item-1..N). Sweep navigates to positions in WIDE_TARGETS to reveal
// matcher scaling (linear scan vs trie). Same table for every engine.
export const WIDE_TARGETS = [4, 8, 16, 32, 64, 128, 256, 512, 1024] as const;
export const WIDE_COUNT = Math.max(...WIDE_TARGETS); // build exactly enough sibling routes
export const wideItems: number[] = Array.from(
  { length: WIDE_COUNT },
  (_, i) => i + 1,
);
