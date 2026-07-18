---
"@real-router/core": patch
---

Internal: fold the FSM engine and the `event-emitter` primitive into `@real-router/core` at `src/foundation/` — no public API or behavior change.

`event-emitter` (private) is dissolved and its package removed. `@real-router/fsm` (published to npm by mistake, unpublish blocked) is frozen and no longer a dependency of core — core now builds its router state machine on an in-tree copy, so consumers no longer receive `@real-router/fsm` as a transitive dependency.
