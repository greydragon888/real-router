---
"@real-router/solid": patch
---

Fix `RouteView` deep-nesting composition cost and per-navigation subtree remount (#1094)

`RouteView` now selects the winning marker with a winner-keyed `createMemo`
(`pickWinner` + `winnersEqual`) and materializes its children only when the
winner actually changes. Two problems are fixed:

- **Correctness:** the active subtree is preserved across navigations that keep
  the same `<Match>` winner (e.g. `users.list` → `users.view`). Previously every
  navigation re-materialized the winning subtree, disposing and recreating the
  child components and silently losing their local state — divergent from the
  React and Vue adapters, which preserve it.
- **Performance:** the `CandidateLookup` cache is now keyed by `routeName` alone
  (its content never depended on `nodeName`), so a deeply nested `RouteView`
  chain no longer rebuilds an identical candidate set at every level — removing
  the O(depth²) substring work that made deep-nesting navigation cost grow
  super-linearly with depth.

No public API change. Marker precedence (Match > Self > NotFound) is unchanged
and remains locked by the RouteView property-based suite.
