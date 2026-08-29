---
"@real-router/core": patch
---

fix: the `buildPath` interceptor is handed a LIVE params bag on every route (#1928)

`addInterceptor("buildPath", …)` received an unfrozen bag on a route with no
defaults and no declared query param, and a frozen one on every other route —
same plugin, two behaviours, decided by a property of the route it never sees.

The split came from a second owner of the freeze: `materialize` freezes
`state.params` at the publication boundary, and the slow path froze it again at
the merge. The merge-time freeze certified nothing a consumer can observe, so it
is gone: the interceptor is handed the real bag by contract — as a route's
`decodeParams` is — and the published state is frozen exactly as before.

⚠ Behaviour change on the previously-frozen routes: a plugin writing into the bag
from a `buildPath` interceptor no longer throws there. Core does not stop the
write; `@real-router/validation-plugin` now reports the state it produces —
`buildURL` takes a second look when the chain GREW the bag, so a key added after
`next()` is named instead of committed silently. Before this, that divergence
produced zero warnings with the plugin installed.
