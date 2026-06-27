---
"@real-router/core": patch
---

Reject reserved `@@`-prefixed route names in `add()` even without the validation plugin (#954)

`getRoutesApi(router).add({ name: "@@router/…", … })` now throws `[router.addRoute] Route name "…" uses the reserved "@@" prefix…` instead of silently registering the route. Previously this rejection lived only in `@real-router/validation-plugin`, so core accepted a reserved name in the production default (no plugin). That was silent corruption: a route named `@@router/UNKNOWN_ROUTE` makes a real URL `matchPath` to a state whose `name === UNKNOWN_ROUTE`, indistinguishable from the not-found sentinel and breaking the public `state.name === UNKNOWN_ROUTE` check. The guard runs before any tree build (atomic) and mirrors the plugin's message, so the error is identical with or without the plugin.
