---
"@real-router/navigation-plugin": patch
---

Fix entryToState discarding query string and remove redundant shouldReplaceHistory call (#449, #450)

**Bug fix (#449):** `entryToState` now includes `url.search` when matching history entries, aligning with `traverseToLast` and `handleNavigateEvent` which already preserved query strings. Previously, history extensions like `peekBack`, `hasVisited`, `canGoBackTo`, and `getVisitedRoutes` would fail to match entries whose URLs contained query parameters.

**Performance (#450):** `onTransitionSuccess` no longer calls `shouldReplaceHistory()` a second time — the push/replace decision is derived from the already-computed `navigationType` on `capturedMeta`.
