---
"@real-router/sources": minor
---

Fix `getSnapshot()` of a lazy source with no listener returning a stale snapshot (#2909)

`createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource` (and `createActiveSource` off its default-options path) and `createDismissableError` hold no subscription while they have no listener. A read in that window — before the first subscribe, or between the last unsubscribe and the next subscribe — returned the snapshot stored at the last disconnect or at creation. React's `useSyncExternalStore` and the Preact polyfill read during render, before they subscribe, so a remounted `RouteView` rendered the previous route first and ran its effects, a remounted `RouterErrorBoundary` rendered its children instead of the fallback, a `RouterProvider` shown again under `<Activity>` rendered the previous route, and a page boundary reset by a navigation rendered the page that threw again and stayed on its fallback. Svelte's `.current` read outside a reactive context stayed stale.

- A read with no listener shows the router: route and node sources its current state (a node source while the node is active), an active source its flag recomputed, `createDismissableError` the error source's error. A subscribe right after such a read notifies nobody; one without a read before it still catches up and notifies once when the snapshot changed.
- After a navigation the source did not take, route and node sources show `previousRoute: undefined`, and any route they show is the router's own state object, a same-path navigation included.
- A node source re-subscribed with no navigation since the last one it took keeps its snapshot, `previousRoute` included, and notifies nobody.
- `createDismissableError` also shows an error re-reported while it was disconnected (the same error object with a new version).
- The first subscribe catches up after it connects. A first subscribe that throws — the router refuses the subscription (a listener cap, a disposed router), or the catch-up throws — is undone: the listener is removed, reads keep following the router, and the next subscribe tries to connect again. On a disposed router every subscribe throws.
- An active source created and then subscribed computes its flag once instead of twice.

**Breaking Change:** the same-path deduplication covers the navigations a connected source takes, not one it missed while it had no listener. The README promised that same-path non-reload transitions preserve the snapshot reference and skip listener notifications, and 0.16.0's `createRouteSource` kept its snapshot object across such a navigation missed with no listener and notified nobody at the next subscribe. After a missed navigation, route and node sources now show `previousRoute: undefined` and the router's own state object as `route` (a node source while its node is active) — a new snapshot even when the path did not change — and a subscribe without a read before it is notified once.

**Migration:** nothing changes for a source that stays connected. Code that compares snapshots by reference across an unmount compares the route's `path` and hash instead, as `stabilizeState` does; code that reads `previousRoute` after a remount treats `undefined` as unknown.
