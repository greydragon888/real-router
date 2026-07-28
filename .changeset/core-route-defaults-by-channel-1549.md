---
"@real-router/core": minor
---

Route a route's own defaults into the channel it declares (#1549)

A default is spelled in one of two slots, and the router now reads both the same
way in both positions — on a terminal route and on a forwarding hop.

Before, each slot worked in exactly one position:

|  | `defaultParams` | `defaultSearch` |
| --- | --- | --- |
| forwarding hop | routed into the target's channel (#1570) | **silently ignored** |
| terminal route | **left in the path bag** | routed correctly |

The terminal half had escalated past mis-channelling: because `start()` commits
through `navigateToState`, the always-on channel guard's P3 position rejected
core's own state, so a route as ordinary as
`{ path: "/x?page", defaultParams: { page: "5" } }` made `start()` throw
`WRONG_CHANNEL`. Through `navigate()` the same config committed silently wrong —
the key in `state.params`, absent from `state.path`.

Both halves are fixed with the primitive already used for hop defaults
(`separateChannels` over the route's declared query names), applied at every
place a route's own defaults are merged: `pipeline/canonicalize`,
`StateNamespace.makeState`, `RoutesNamespace.buildPath` and the `matchPath` URL
rebuild. All four are needed — the URL builders run *before* the state builders
split, so fixing only the latter would have published a `state.search` its own
`state.path` contradicts (INVARIANTS makeState #6).

`defaultSearch` is spread last and so outranks the query half of
`defaultParams`; an explicit caller value still outranks both. Unchanged by
construction: a name occupying both a path slot and a query declaration
(`/coll/:id?id`) stays path-owned, an arbitrary default (`{ theme: "dark" }` on
a static route) keeps its v1 home in `state.params`, and a path default stays in
`state.params`.
