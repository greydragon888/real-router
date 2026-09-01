---
"@real-router/validation-plugin": patch
---

The event-name set is derived from core's `events`, not hand-written (#1888)

`validateEventName` held its own array of the seven names with a comment calling
it the sole owner, because core neither declared a set nor enforced membership.
Core does both now, so the copy is exactly the shape that drifts from the
emitter it describes. It is built from `Object.values(events)` — captured at
module load, per this package's own intrinsic discipline.

Only the MESSAGE is still written twice, and `bare-core-message-parity` gained a
cell that compares the two wordings byte for byte.
