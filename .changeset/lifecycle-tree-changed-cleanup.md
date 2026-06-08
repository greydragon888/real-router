---
"@real-router/lifecycle-plugin": minor
---

Evict compiled hooks for removed routes via TREE_CHANGED (#702)

The plugin now subscribes to `getRoutesApi(router).subscribeChanges()` and drops
cached `hookName:routeName` entries for routes removed via `remove`/`replace`
(and clears the cache on `clear`). Previously those entries were unreachable dead
memory until teardown. `add`/`update` still rely on lazy factory-reference
revalidation; hook dispatch behavior is unchanged. A `teardown` was added to
remove the subscription on unsubscribe.
