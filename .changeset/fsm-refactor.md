---
"@real-router/core": patch
---

Replace boolean flags with FSM-driven lifecycle

Internal architecture change: all router state (`#started`, `#active`, `#navigating` booleans) replaced by a single RouterFSM. All lifecycle events are now consequences of FSM transitions via typed actions. `#setupDependencies()` decomposed into 11 focused methods. `ObservableNamespace` refactored to use 6 typed emit methods instead of `invoke()` with switch routing.
