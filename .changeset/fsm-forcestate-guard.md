---
"@real-router/fsm": patch
---

Guard `forceState()` against undeclared states (#754)

`forceState()` now throws an explicit error when given a state that is not declared in `config.transitions`, instead of silently leaving the FSM unable to transition — previously the next `canSend`/`send` threw a cryptic `TypeError: Cannot read properties of undefined`. The guard reuses the existing transition lookup and throws **before** mutating `#state`, so the FSM is left untouched on rejection. Typed callers are unaffected (`state: TStates` already forbids undeclared states); this hardens JS / cast callers, mirroring how `send()` is already defensive on unknown input.
