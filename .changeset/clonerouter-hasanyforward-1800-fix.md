---
"@real-router/core": patch
---

fix: a clone carries the `forwardTo` arm, not just the forward config (#1800)

`cloneRouter` copied the forward configuration and left the derived flag that
gates it behind. `isActiveRoute` consults its `forwardTo` arm only when the
tree-wide `hasAnyForward` is set, so on every clone the predicate answered
`false` for **every** forwarding route.

Navigation was unaffected — the clone still resolved and committed the forward
target. The damage was confined to the render-path predicate, which is what
makes it easy to miss: nothing threw, and the URL was right.

**Who is affected:** anyone cloning a router whose tree contains a `forwardTo`,
which on the server is everyone — `@real-router/ssr-utils`' `createRequestScope`
clones per request.

⚠ Scope, measured rather than assumed. Active state reaches a `<Link>` through
two channels, and this repairs one of them. A link with custom `routeParams` /
`routeSearch` / `activeStrict` / `ignoreQueryParams={false}` / `hash` goes
through `isActiveRoute` and was wrong on every clone; it is right now. A link that supplies only a
route NAME — no params, no search, non-strict, query-ignoring, no hash — takes a
name-only fast path that never calls the router and matches lexically, so it
still does not light up for a forwarding route, on clones and on plain client
routers alike. That gap is older than this change and is not closed here.

⚠ The split is not identical across adapters, so check yours rather than
assuming: Solid routes its `to` form to the SLOW path explicitly
(`local.to === undefined` is part of its fast-path test) and uses its own
selector, so a Solid `<Link to="alias">` does get this fix.

The clone's store is built from the source's route TREE, which carries
`{ name, path, children }` and no `forwardTo`, so it starts with the flag
unset; the config copy then installed the forward config behind it.

It healed itself as soon as anything re-derived the flag — measured, `add` and
`replace` do, and so does an `update` that touches `forwardTo`. (An `update`
that does not is measured NOT to, which is harmless: the config it derives from
did not change.) That is why no existing test saw it — a test that mutates
routes on a clone never observes the window.

The clone now installs its forward state through `adoptForwardState`, the
function whose own docstring says it is "the ONE way `resolvedForwardMap` and
`hasAnyForward` move" and predicts exactly this failure for "a site that
assigned only the map".
