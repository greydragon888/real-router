---
"@real-router/persistent-params-plugin": patch
---

Move the documented examples to the query channel (#1572)

Core's channel guard now throws when a key a route declares with `?name`
arrives in the `params` bag, so this package's README and guide examples — which
showed the legacy single-bag form — no longer describe working code.

Examples and tests moved to the explicit query argument:
`navigate("products", {}, { lang: "en" })`. No runtime change in this package.

An UNDECLARED tracked key is unaffected: the guard only fires on names the route
declares with `?`.
