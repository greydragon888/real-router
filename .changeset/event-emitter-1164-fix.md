---
"@real-router/core": patch
---

Fix `EventEmitter.clearAll()` lifting the in-flight re-entrancy guard (#1164)

`clearAll()` called from inside a listener cleared the per-event `#dispatching`
guard held by the live `emit` frame, so a re-entrant same-event `emit()` was no
longer coalesced and re-entered — violating the #1033 depth-≤-1 contract
(empirically reached depth 5). The guard is owned by the active emit frame and
self-releases in its `finally`; `clearAll()` no longer touches it.
