---
"@real-router/core": patch
---

fix(core): liveness-gate the internal navigateToNotFound commit primitive (#1186)

`dispose()` called while a `start()` interceptor was parked (FSM already `DISPOSED`) could still commit an `UNKNOWN_ROUTE` state on the disposed router: when the interceptor resumed, `matchPath` missed the cleared route tree and the default `allowNotFound: true` path routed into the internal `navigateToNotFound` primitive, which had no liveness gate — so `start()` resolved successfully with a phantom state on a disposed instance.

`navigateToNotFound` now throws `RouterError(ROUTER_DISPOSED)` when the router is no longer active, so the disposed-router branch rejects like the matched-route branch (which was already protected by the `canNavigate()` gate). No state is committed after `dispose()`.
