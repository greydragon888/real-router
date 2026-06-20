---
"@real-router/fsm": patch
---

Guard `constructor` and `on()` against undeclared states (#885)

Extends the `forceState` guard (#754) to the engine's two other state-entry-points via a shared `requireDeclared` check, so an undeclared state fails loud with an explicit error instead of bricking the FSM or silently dead-registering an action:

- `new FSM({ initial, … })` with an undeclared `initial` now throws `[FSM.constructor] state "…" is not declared in config.transitions` instead of bricking the next `canSend`/`send` with a cryptic `TypeError`.
- `on(from, …)` with an undeclared `from` now throws `[FSM.on] state "…" is not declared in config.transitions` instead of silently registering an action that can never fire.

Typed callers with a narrow state union are unaffected (the type forbids an undeclared state); this hardens `string`-typed / JS / cast callers. Dormant for `@real-router/core` (the router uses declared states throughout). Runtime guard only — `forceState`'s message and behavior are unchanged.
