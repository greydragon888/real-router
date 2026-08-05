---
"@real-router/persistent-params-plugin": patch
---

A committed `UNKNOWN_ROUTE` state is no longer read as a param removal (#1676)

`onTransitionSuccess` treats a tracked key that is absent from the committed state as an irreversible removal (#803). Core's 404 state is hand-built with both channels empty — it matched no route, so there is no route to declare where its keys belong — which the plugin read as `navigate(…, { key: undefined })` and used to retire the key for the rest of the router's life.

Every core channel that commits a 404 hit this: `start()` on an unmatched path (the plugin was dead before the app's first navigation), a popstate onto a dead link, and `replace()` dropping the active route. The last one broke the persistent-params e2e of all six `combined` examples (#1674).

The snapshot now passes through such a commit untouched, and is still published to `state.context.persistentParams` so a 404 page reads it like any other route. Explicit removal via `navigate(…, { key: undefined })` and the defensive removal on a hand-built `navigateToState` are unchanged.
