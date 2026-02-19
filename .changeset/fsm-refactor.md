---
"@real-router/core": patch
---

Replace boolean flags with FSM-driven lifecycle

Internal architecture change: all router state (`#started`, `#active`, `#navigating` booleans) replaced by a single RouterFSM. All lifecycle events are now consequences of FSM transitions via typed actions. `#setupDependencies()` extracted into `RouterWiringBuilder` (Builder+Director pattern) in `src/wiring/`. `ObservableNamespace` eliminated — Router.ts owns `EventEmitter<RouterEventMap>` directly.
