---
"@real-router/hash-plugin": patch
---

Reduce per-call allocation in `router.replaceHistoryState()` (#470)

Shared `createReplaceHistoryState` helper in `browser-env` now reuses a
mutable `{ name, params, path }` buffer via `createUpdateBrowserState()`
across calls instead of allocating a fresh literal per invocation. Hash
plugin benefits transparently — no API change.
