---
"@real-router/core": patch
---

`defaultRoute` must be a route name, and is read once (#1876)

**Who is affected:** only callers whose `defaultRoute` — or whose `defaultRoute`
callback's return — is not a string. The option is declared `string | callback`,
so an object needs a cast in TypeScript; the callback's return is not checked by
the type system at all, which is the likelier way to land here. A plain string
and a callback returning one are unaffected.

Such a value used to be coerced as a **property key** at four sites per
`navigateToDefault()` — the forward maps, then the route's `defaultParams` and
`defaultSearch` — while a fifth consumer took it raw. Four calls into your code
per navigation, and the four could disagree with each other and with the fifth:
a value that answered differently was admitted as one route and indexed as
another, which surfaced as an unnamed `TypeError` rather than a router error.

It is now refused at the boundary and read **zero** times. `navigateToDefault()`
rejects with `ROUTE_NOT_FOUND` and the reason `defaultRoute did not resolve to a
route name`.

**The behaviour change worth knowing about** is that it now refuses
_consistently_. Before, a non-string that named a **forwarding** route actually
navigated: `forwardTo` resolved the name to a plain string, so the raw-value
check at the end never saw the object. The same value naming a non-forwarding
route was rejected. Failing quietly in the wrong place is the case this closes;
if you relied on it, pass the route name as a string.

The callback form is untouched — it is still re-evaluated on every
`start()` and `navigateToDefault()` call, as documented.
