---
"@real-router/core": minor
---

`PluginApi.subscribeDiagnostic` — the reporting half of #2388

Core now REPORTS what it cannot refuse, on internal event keys a plugin
subscribes to:

```ts
getPluginApi(router).subscribeDiagnostic("PLUGIN_AFTER_START", (methodName) => {
  console.warn(`${methodName} will not be called`);
});
```

⚑ **The twin of `addCheck`, and the split is the right handed out.** A check may
throw and stop the call; a diagnostic states what already happened and cannot.

⚑ **Internal keys, the shape `TREE_CHANGED` established.** They ride the
router's own `EventEmitter` — so this is the mechanism core already has, not a
third one — and are deliberately absent from the public `EventName` union, the
`events.*` registry and the `Plugin` interface. `addEventListener` cannot reach
them, and a diagnostic never competes for a public event's listener budget.

⚠ **One key per diagnostic KIND, never one shared key.** `EventEmitter.emit`
coalesces a re-entrant emit of an in-flight event NAME and drops it silently
(#1033), and a handler here reaches the application's own `LoggerConfig.callback`,
from which another diagnostic is raisable. Under one shared key that second
diagnostic is lost — proven by probe.

`DiagnosticEventMap` ships on `@real-router/core/types`, paired with the runtime
`DIAGNOSTIC` by `satisfies` in both directions, the way `CheckPositionMap` is
paired with `POSITION`.

**One kind ships: `PLUGIN_AFTER_START`.** `plugins.warnPluginAfterStart` leaves
`RouterValidator` — this was its only consultation. Behaviour is unchanged;
`@real-router/validation-plugin` subscribes and logs exactly as before.

⚠ **A throwing handler cannot break the operation that reported.** The emitter
isolates per listener, which is why reporting is safe where refusing is not.
