---
"@real-router/core": patch
---

The FSM's dispatch pair stops allocating a rest array per call (#1641)

`send` and `canSend` declared their payload as a conditional rest tuple, which
is the only way to express the payload/event correlation their types promise —
but a rest parameter materialises an array on every call, and these are the
router's hottest entry points.

The tuple now lives in the overload and the implementation takes the payload
positionally, so the types are byte-for-byte what they were and the array is
gone. Measured **−88 B per navigation** (alloc probe, 200-op window, median of
31 windows, interleaved processes, A/A control at zero drift), with the p90 tail
collapsing from 2384 to 2133 B — the array was intermittently escaping. Timing is
a wash at 733 vs 734 ns, so this is purely GC pressure.

`@real-router/event-emitter` already made this exact trade (`emit(name, a?, b?,
c?, d?)` rather than `...args`); the FSM engine had simply never received it.

Nothing changes for callers: `send("A", payloadForB)` is still a type error, a
payload event still requires its payload, and a no-payload event still rejects
one.
