---
"@real-router/core": patch
---

`subscribeChanges` refuses a handler the emitter cannot call (#2246)

`RoutesApi.subscribeChanges` was the one subscription primitive with no guard at
all. A non-function registered cleanly, handed back a working `Unsubscribe`, and
then logged out of the emitter's isolation wrapper on every structural mutation
for the life of the router — while the mutation itself reported success. A
registration that never works and never says so.

Its siblings all guard: `Router.subscribe` and `subscribeLeave` through
`EventBusNamespace`, `PluginApi.addEventListener` through the always-on set. This
door now joins them as the ninth member of that set.

The message carries no `@real-router/rx` hint, matching `subscribeLeave` and for
a sharper reason: rx exposes the Observable pattern for transitions, and a tree
change is not one.
