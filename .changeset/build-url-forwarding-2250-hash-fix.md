---
"@real-router/hash-plugin": minor
---

`router.buildUrl` resolves `forwardTo`, and the popstate rollback stops rebuilding from a name (#2250)

This plugin keeps its own copy of the URL builder (the warn-once on `{ hash }` is
local to it), and that copy asked `router.buildPath` — the LITERAL form, which
answers about the route it was NAMED. A `<Link>` to a forwarding source rendered
the source's hash URL and committed the target's. It now builds from
`buildNavigationState`; an unknown route still throws.

The popstate rollback takes the committed state's own `path` and only prefixes
it, instead of rebuilding the URL from the state's name — which ran the
`forwardState` seam a second time and, on the 404 arm, produced an empty path.
