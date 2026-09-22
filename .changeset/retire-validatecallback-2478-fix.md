---
"@real-router/core": patch
---

`EventEmitter.validateCallback` is removed — nothing called it (#1845)

The static assertion had **zero call sites** in `packages/*/src` and `shared/`;
only its own tests reached it. Its message was the one entry `[EventEmitter]` held
in `message-prefix-authority-1845`'s internal register, so the register is back to
the FSM pair.

⚠ **The register entry's stated reason traced the wrong method.** It argued from
`on()`'s four call sites and from `assertListenerIsFunction` refusing first — but
`on()` neither calls `validateCallback` nor raises its message; `on()` raises
`[router] Duplicate listener` and `[router] Listener limit`, both of which that
same docblock correctly keeps OUT of the register. So the prefix was unreachable
for a stronger reason than the one recorded: the code was dead.

What goes with it: the `TypeError` invariant in `event-emitter/INVARIANTS.md`, its
row in that package's `CLAUDE.md` and `ARCHITECTURE.md` sketch, four functional
cells, one property, and the `arbNonFunction` arbitrary those cells were the only
consumer of. Coverage stays at 100 % on all four metrics.
