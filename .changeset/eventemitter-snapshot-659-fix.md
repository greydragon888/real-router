---
"@real-router/core": patch
---

Fix EventEmitter snapshot invariant when depth tracking is enabled and only one listener exists (#659)

`#emitWithDepthTracking` skipped the snapshot copy for listener sets of size 1
and iterated the live `Set` directly, so a listener registered reentrantly
inside the lone listener fired in the current emit cycle instead of waiting
for the next one. Since core uses `maxEventDepth: 5`, this affected every
reentrant `router.subscribe(...)` call made while only one subscriber was
registered for the same event.
