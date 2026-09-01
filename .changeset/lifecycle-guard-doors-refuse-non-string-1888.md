---
"@real-router/core": minor
---

The four guard doors refuse a non-string route name (#1888)

`getLifecycleApi(router)`'s `addActivateGuard` / `addDeactivateGuard` /
`removeActivateGuard` / `removeDeactivateGuard` accepted a non-string name
without a word. They are the only doors in the route-name family that failed
OPEN, and the outcome was worse than silence — measured on bare core with a bag
whose `toString` names a real route:

```
addActivateGuard(bag, denyGuard)   ->  no error, the caller's factory RUNS
get(name).canActivate              ->  present — the router reports the guard
navigate(name)                     ->  proceeds; the guard never runs
cloneRouter(base).navigate(name)   ->  BLOCKED — the clone enforces it
removeActivateGuard(bag)           ->  the real guard survives the call
```

The compiled-function `Map` is keyed by SameValueZero, so the object was stored
under its own identity and no string lookup reached it — while the record
materialisation behind `get()` coerces, so the two halves of one registration
disagreed. Under `createRequestScope` that is
a per-request clone enforcing a departure guard its base does not.

The refusal is a `TypeError` naming the door, with the wording the route-CRUD
doors already use — one home, `assertRouteNameIsString`, which
`assertNoInternalRouteName` now delegates to. The `@@` prefix rule does NOT
travel with it: registering a guard on a system route is a declared capability.

`getPluginApi().addEventListener` is the fifth door of the same shape and is
closed in the same pass — but with a different predicate, which is why no fifth
copy of the route-name check arises. Its valid set is CLOSED and `events`
declares it, so core derives the seven from that constant and refuses anything
else, typo'd strings included:

```
addEventListener("$$sucess", cb)   ->  TypeError, naming the seven
addEventListener(bag, cb)          ->  TypeError
addEventListener(events.X, cb)     ->  unchanged
```

⚠ Scope: on the route-name doors this closes the TYPE half. A typo'd STRING (`addActivateGuard("admn", …)`)
behaves identically and is refused by neither layer — that needs a
route-existence check, and by the split #359 drew it belongs to
`@real-router/validation-plugin`.

`minor`: a call that used to succeed silently now throws — at the point where
the thing it claimed to register was already not working. One core test that
asserted the lax event-name behaviour as "graceful" is rewritten to the new
contract, with a valid name kept as the discriminator.
