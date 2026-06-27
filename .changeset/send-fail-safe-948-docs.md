---
"@real-router/core": patch
---

Document `EventBusNamespace.sendFailSafe()` semantics and state-branching (#948)

Add JSDoc clarifying that the "Safe" suffix means the error event is never dropped
regardless of FSM state — not that the method catches every error (errors thrown inside a
`TRANSITION_ERROR` listener are isolated separately via the `EventEmitter`'s
`onListenerError` sink). Also document why the method reads its own FSM state to choose
between the FSM-routed `FAIL` action (in `READY`) and a direct `TRANSITION_ERROR` emit
(otherwise). No behaviour change.
