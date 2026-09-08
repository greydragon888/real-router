---
"@real-router/core": patch
---

A listener's thenable is judged and invoked on the SAME read of `.then` (#2136)

`EventEmitter#invokeIsolated` asked the slot once to decide whether the returned
value was a thenable, and `Promise.resolve` asked it again to adopt it. A `then`
that answers differently between the two was therefore adopted on one value and
run on another. When the later read answered a non-function the object was taken
for a plain value and its rejection reached nobody — the per-listener isolation
#1412 established, undone, with the error surfacing as a Node
`unhandledRejection` instead of at `onListenerError`.

⚑ The thenable is a LEAF, so the discipline is read-once rather than adoption:
core must CALL `.then` on the object the listener returned, and a copy of it is
not the same promise. The captured function is invoked directly, which keeps the
allocation count where `Promise.resolve(…).catch(…)` had it — for a native
promise the call IS `.catch`.

⚠ Measured on the fixture: the defect read the slot twice, and three times
through the router when the first read answered a native promise's bound `then`.
