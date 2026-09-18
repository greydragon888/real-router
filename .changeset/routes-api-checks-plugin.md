---
"@real-router/validation-plugin": minor
---

Route-CRUD refusals are registered as checks, and the per-route walk moves here (#2388)

Six more registrations at install, all removed on `teardown`. Each runs the
door's calls in the order core consulted them, so the first refusal a caller
hears about is the same one.

⚑ **The per-route callback walk is this package's now.** Core deleted the
`guardRouteCallbacks` helper that existed only to thread the validator into it,
so the plugin recurses into `children` itself and `guardRouteCallbacks` /
`guardNoAsyncCallbacks` leave `RouterValidator` with the nine other route
members.

⚠ The walk is pinned by a cell that refuses an async `decodeParams` on a CHILD —
the one input nothing else catches. A `canActivate` was tried first and could not
discriminate: core's own factory-shape guard refuses that whether the walk runs
or not.
