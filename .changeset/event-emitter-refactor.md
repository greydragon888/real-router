---
"@real-router/core": patch
---

Extract event-emitter package and inline ObservableNamespace into Router.ts

Internal architecture change: generic event-emitter logic (listener storage, snapshot iteration, recursion depth guard, duplicate detection, limits) extracted into private `event-emitter` package. ObservableNamespace eliminated — Router.ts owns `EventEmitter<RouterEventMap>` directly, FSM actions call `emitter.emit()` without intermediate delegation layer.
