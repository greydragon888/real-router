---
"@real-router/svelte": minor
---

A `<Link>` to a `forwardTo` source renders the href its own click commits (#2250)

`buildHref` falls back to the resolving door (`buildNavigationState`) instead of
`router.buildPath` when no URL plugin is installed. `buildPath` is the LITERAL
form by record — it answers about the route it was NAMED, which is what lets a
plugin build a state for an alias without being teleported off it — so the href
for a forwarding route pointed at the source while the click landed on the
target, and the URL plugin immediately rewrote the address bar.

`router.buildPath` stays the `??` right-hand side: an unknown route answers
`undefined` at the resolving door and THROWS there, and the adapters pin that
throw. A router the plugin registry does not hold (a test double, a `Proxy`
wrapper) keeps the literal path too.

⚠ **Visible with a URL plugin installed:** that plugin's `buildUrl` now also
refuses a route's declared query name handed in `routeParams` (the channel guard
#1572, which the click has always refused), so such a `<Link>` renders no href
rather than one its own click rejects. Pass it in `routeSearch`.
