---
"@real-router/solid": minor
---

Optimize active route detection with `createSelector` for O(1) updates (#328)

`Link` components now use a shared `createSelector` from `RouterProvider` instead of per-link subscriptions. On navigation, only the previously-active and newly-active links update — all other links skip computation entirely.
