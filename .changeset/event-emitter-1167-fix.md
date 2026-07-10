---
"@real-router/core": patch
---

Fix `EventEmitter.on()` leaving an orphan record when a rejection throws (#1167)

`on()` created and stored the per-event record before its rejection checks, so a
negative `maxListeners` (the limit check is already met at size 0) threw on the
first registration of a new name while retaining an empty `Set` — an unbounded,
`listenerCount`-invisible heap leak. `on()` now validates before mutating: the
record is created only after every check passes, so a rejected registration
leaves nothing behind.
