---
"@real-router/search-schema-plugin": minor
---

Channel-aware `defaultSearch` recovery and dev-time validation (#1549)

Follows core's `Route.defaultSearch` split. The plugin now recovers stripped
invalid query values from the **channel that holds the query**: `defaultSearch`
on the URL→State (matchPath) path (`useSearch`), `defaultParams` on the
State→URL (navigate) path. Before, recovery always read `defaultParams`, which
silently restored nothing once a route's query defaults moved to `defaultSearch`.

Dev-time config validation now targets `defaultSearch`: `usePlugin()`-time and
`TREE_CHANGED` (`add` / `replace`, and `update` when `patch.defaultSearch`
changed) re-validate a route's `defaultSearch` against its `searchSchema`, with
a warning that names the consequence (`defaultSearch` is trusted config injected
by core below the interceptor seam, so an invalid default still reaches state and
the URL at runtime — #802).
