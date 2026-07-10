---
"@real-router/browser-plugin": patch
---

Fix two hash-sync drift bugs on `state.context.url.hash` (#1210, #1212)

- **#1210 (TIME):** a deferred popstate — one that arrives while a navigation is in flight — replayed against the LIVE fragment, which the in-flight navigation's `replaceState` had since overwritten, so the deferred event resolved the wrong hash (TOCTOU). The popstate handler now snapshots the fragment at the event's fire time (alongside the path/query location #757 already snapshotted) and the deferred replay uses that snapshot.
- **#1212 (CACHE):** `router.replaceHistoryState({ hash })` set the fragment via `replaceState` (which fires no `hashchange`) but did not sync the `currentHash` cache — so a subsequent preserve-navigate read the stale cache and wiped the fragment. `replaceHistoryState` now re-syncs the cache; it is a cold path, so the live read is free (the #1019 hot-path optimization is untouched — the per-navigation stream still reads the cache).

Both mutation-validated. Part of the wave-2 hash cluster; the FORM axis (#1211) is a separate cross-layer contract change. The #1210 shared popstate-handler change is neutral for hash-plugin (no fragment augmentation there).
