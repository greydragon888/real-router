---
"@real-router/core": patch
---

Replace boolean flags with FSM-driven lifecycle

Internal architecture change: all router state (`#started`, `#active`, `#navigating` booleans) replaced by a single RouterFSM. All lifecycle events are now consequences of FSM transitions via typed actions. `#setupDependencies()` extracted into `RouterWiringBuilder` (Builder+Director pattern) in `src/wiring/`. `ObservableNamespace` replaced by `EventBusNamespace` — unified FSM + EventEmitter abstraction that encapsulates all event/state management. Guard registration logic moved from Router facade into `RouteLifecycleNamespace.addCanActivate()`/`addCanDeactivate()` — state-dependent validation now encapsulated in the namespace. Router.ts reduced from 1585 to 1209 lines.
