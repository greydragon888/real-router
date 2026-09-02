---
"@real-router/core": minor
---

A route definition is read once, above every guard that judges it ([#1911](https://github.com/greydragon888/real-router/issues/1911))

`snapshotRouteBatch` exists so one value answers for every reader. On the `add`
and `replace` doors it ran LAST — after every read the validator made — so a
definition that answers differently per read was validated under one value and
registered under another. A `Proxy` does exactly that while reporting an ordinary
data descriptor, so the accessor ban never reached the shape, and `Proxy`-backed
bags are supported input. Measured on `decodeParams`: flipping to an async
function at read 4, 5 or 6 was ACCEPTED, and the async callback landed in the
tree, surfacing later as `[router.matchPath] Invalid routeParams: undefined`.

The snapshot now happens at the door, above every validator, and the guards that
judge a definition are split by what they need to see:

- **the OBJECT** — is it an object, is its prototype plain, does it carry
  accessors — must see the CALLER's value, because a spread answers all three the
  same way whatever it was made from. These run in `guardRouteStructure`.
- **its VALUES** — every callback and config check — must see the SNAPSHOT, or
  there is a second read to differ from.

**Breaking, in the tightening direction.** Those three object-shape checks were
plugin-gated; they are always-on now, so bare core refuses a route definition
that is a class instance or carries getters — shapes
`@real-router/validation-plugin` already refused, and which
`packages/core/CLAUDE.md` names as the ones that bite. The message is unchanged
and identical with and without the plugin.
