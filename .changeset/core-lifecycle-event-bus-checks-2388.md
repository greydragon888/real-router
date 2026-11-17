---
"@real-router/core": minor
---

The guard doors and the event bus refuse and report through checks and diagnostics ([#2388](https://github.com/greydragon888/real-router/issues/2388))

Two new check positions: `canActivate:count` and `canDeactivate:count`. Eight
new diagnostic kinds: `CAN_ACTIVATE_COUNT`, `CAN_DEACTIVATE_COUNT`,
`CAN_ACTIVATE_OVERWRITE`, `CAN_DEACTIVATE_OVERWRITE`, `SYNC_GUARD_THENABLE`,
`SYNC_GUARD_NON_BOOLEAN`, `GUARD_NON_BOOLEAN` and `LISTENER_COUNT`.

`RouterValidator` loses its `lifecycle` and `eventBus` namespaces: core has no
consultation left for them. A validator of your own registers checks at these
positions with `PluginApi.addCheck`, and subscribes to these kinds with
`PluginApi.subscribeDiagnostic`, instead.

⚑ **A count position is asked before a guard takes a new slot**, with the
number of routes holding a guard of its type; an overwrite takes no slot and is
not judged. `add`, `update` and `replace` ask it before they write anything,
once per guard type that gains a slot, with the highest count their per-slot
asks will receive; each new slot is then asked as it registers. The count kind
follows once the checks pass, with the count the registration makes, so a
refused guard reports nothing.

⚠ **A report handler that throws no longer escapes the door.** The router logs
the throw through `logger.error`, and the call completes as if the handler had
returned. Previously a throwing report of the validator made `addActivateGuard`
and `addDeactivateGuard` throw without registering the guard, keeping the old
one on an overwrite; made `add`, `update` and `replace` throw after writing the
routes, without the guard; made `subscribe`, `PluginApi.addEventListener` and
`usePlugin` with a hook throw before the listener registered; and made a
transition to a guard answering a non-boolean — `navigate`,
`navigateToDefault`, `start` or `PluginApi.navigateToState` — reject with that
error, which `TRANSITION_ERROR` listeners received too, instead of a
`CANNOT_ACTIVATE` `RouterError`. The synchronous ask of `canNavigateTo`,
`navigateToNotFound` and `replace`'s revalidation keeps its answers, and the
throw reaches `logger.error` instead of the `logger.warn` "Guard … threw —
treated as navigation-blocking". Only a
synchronous throw is isolated; the rejected promise of an `async` handler is not
([#2836](https://github.com/greydragon888/real-router/issues/2836)).

⚠ **Disposing the router during these calls makes them throw
`ROUTER_DISPOSED`.** `addActivateGuard`, `addDeactivateGuard`, `add`, `update`
and `replace` throw when a check at the count position, a report handler, the
logger callback behind a report or a guard factory disposes it; `subscribe` and
`PluginApi.addEventListener` when a handler of `LISTENER_COUNT`, or the logger
callback behind it, does. Previously these calls returned normally on the
disposed router.

Bare core counts the routes holding a guard only for a consumer: a check at the
count position, or a handler of the count kind.
