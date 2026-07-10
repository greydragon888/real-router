---
"@real-router/memory-plugin": patch
---

Fix stack corruption when an async `canActivate` on the back()/go() target races a concurrent `navigate()` (#1234)

#807 fixed the sync `back(); navigate()` race by consuming `#navigatingFromHistory` on the restore commit, but that consumption is by **timing** ("the first commit after the flag was set"), not **identity**. When the back()/go() target has an async `canActivate` guard, the restore `navigateToState` is in flight and a concurrent `navigate()` cancels it and commits first — its `onTransitionSuccess` steals the flag and records the forward navigate as a phantom history-restore (no push, `direction: "back"`, stale `historyIndex`), while the cancelled restore's `.catch` reverts `#index` past the array, corrupting the stack three ways.

The restore navigation is now tagged `source: MEMORY_RESTORE` — the same `source` convention the browser/hash URL plugins already use — and the flag is consumed only when the committing navigation carries that tag, attributing it by identity rather than timing. The cancelled `#go`'s `.catch` likewise reverts `#index` only when it is still the optimistic target (a concurrent push has otherwise already re-based it), keeping the stack in bounds for deep `go(-N)` races too. Companion stress `#1235` (async-guard interleave) now locks the invariant.
