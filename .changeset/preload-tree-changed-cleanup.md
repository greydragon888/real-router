---
"@real-router/preload-plugin": minor
---

Invalidate preload caches on route-tree mutations via TREE_CHANGED (#702)

The plugin now subscribes to `getRoutesApi(router).subscribeChanges()` and, on
`remove`/`replace`/`clear`:

- **Fixes a stale pre-resolved `State` bug**: the href-keyed snapshot cache
  (consumed via `router.getPreloadedState(href)`) is now cleared on structural
  mutations. Previously a `<FastLink>` could read a cached `State` for a route
  that had since been removed/changed and commit it via `navigateToState`,
  navigating to a route no longer in the tree.
- Drops `#compiledPreloads` entries for removed routes (previously unreachable
  dead memory until teardown — `matchUrl` never resolves a removed route).

`add`/`update` still rely on lazy factory-reference revalidation; runtime preload
behavior on a stable tree is unchanged. The subscription is removed in `teardown`.
