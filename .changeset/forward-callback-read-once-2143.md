---
"@real-router/core": patch
---

A `forwardTo` callback and the URL read the params bag once (#2143)

The seam handed the forward chain the caller's bag: the callback read it to pick
a target and `#layerChainDefaults` read it again to build the params that become
the URL. Two questions of one application-owned object, so a value that answered
differently between them chose one destination and shipped another. Measured
through the plugin seam — the callback saw `id: "1"` and `{ id: "999" }` came
back — and through `isActiveRoute`, where a `<Link>` pointing exactly where the
user already stood reported itself inactive.

`#resolveDynamicForward` now takes the one read, before the first callback is
consulted, and returns it so the hop defaults layer over the same object.

⚑ The copy is paid ONLY on the branches that consult a callback, and the two
controls in the fixture say why. `navigate` was already closed at the entry door
(#2134), so this is not a second copy of the same bag. And a route that does not
forward reaches no reader at all through this seam, so it keeps handing its
container back by identity — the measurement #2134 recorded and
`handed-out-containers-1957` pins.
