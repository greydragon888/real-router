---
"@real-router/core": patch
---

Internal: FSM-driven lifecycle, EventBusNamespace, wiring extraction

All router state (`#started`, `#active`, `#navigating` booleans) replaced by a single RouterFSM — lifecycle events are consequences of FSM transitions via typed actions. `ObservableNamespace` removed; generic event-emitter logic extracted into private `event-emitter` package; FSM + EventEmitter + `#currentToState` encapsulated in `EventBusNamespace`. `#setupDependencies()` extracted into `RouterWiringBuilder` (Builder+Director pattern). Guard registration logic moved from Router facade into `RouteLifecycleNamespace`. Router.ts reduced from 1585 to 1176 lines.
