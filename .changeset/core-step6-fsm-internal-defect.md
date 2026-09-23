---
"@real-router/core": patch
---

The FSM's six refusals take the unbracketed internal form (#2487)

Six messages change. `[FSM.constructor] …` and `[FSM.on] …` become
`Internal error (please report): …` — reaching one of them means core's own
transition table is malformed, and O-1 gives that shape a marker rather than a
prefix naming a class no application author can look up.

The `CORE_INTERNAL` register goes with them: the FSM pair was its only entry.
