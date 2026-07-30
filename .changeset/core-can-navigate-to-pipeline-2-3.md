---
"@real-router/core": patch
---

Compose `canNavigateTo` through the nav pipeline (nav-pipeline Phase 2, step 2-3)

The predicate resolved the route, normalised the params, built the URL and made
the state in four hand-written steps. It now runs `canonicalize` → `buildURL` →
`materialize`, from the same read-model `navigate`, `matchPath` and `buildPath`
use. Behaviour is unchanged, verified byte-for-byte across 11 fixtures covering
both channels, route defaults in either slot, `forwardTo`, the `/coll/:id?id`
collision, a missing required param, an undeclared key in `loose`, and the
mis-channelled bag the predicate answers `false` for (#1576).

Both `try` boundaries are preserved deliberately, and they mean different things:
resolution runs USER code and must be logged when it throws (#1577 / #959), while
an unbuildable path is a normal "unreachable with this input" answer and stays
silent (#725). The predicate remains total — it answers, it never throws.

This step also settles the `materialize` fork the milestone left open: it does
NOT grow a port argument. With both deferred consumers finally on the table the
answer is that neither needs one — `canNavigateTo` builds the URL through
`buildURL` (safe here, since this point is not the one the port prints through),
and `isActiveRoute` passes `path: ""` because `areStatesEqual` compares channels
and never reads the URL.
