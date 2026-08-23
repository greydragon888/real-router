---
"@real-router/core": patch
---

`defaultRoute` must be a route name, and is read once (#1876)

**Who is affected:** callers whose `defaultRoute` — or whose `defaultRoute`
callback's return — is not a string. The option is declared
`string | DefaultRouteCallback`, and the callback is declared to return a
`string`, so both need a cast or an `any`-typed return to land here; neither is
unusual in JavaScript or in a config assembled at runtime.

Such a value used to be coerced as a **property key** at four sites per
`navigateToDefault()` — six when the name resolved through a static `forwardTo`
— while a further consumer took it raw. Four or six calls into your code per
navigation, and they could disagree: a value that answered differently was
admitted as one route and indexed as another, which surfaced as an unnamed
`TypeError` rather than a router error.

It is now refused at the boundary and read **zero** times.
`navigateToDefault()` rejects with `ROUTE_NOT_FOUND` and the reason
`defaultRoute did not resolve to a route name`.

**The behaviour change worth knowing about** is that it now refuses
_consistently_. Before, a non-string that named a **forwarding** route actually
navigated: `forwardTo` resolved the name to a plain string, so the raw-value
check at the end never saw the object. The same value naming a non-forwarding
route was rejected. If you relied on that, pass the route name as a string.

Two smaller notes: this refusal no longer emits `$$error`, which aligns it with
the two neighbouring `defaultRoute` refusals that have always been silent; and
the callback form is untouched — it is still re-evaluated on every
`navigateToDefault()` call. (`start()` has never consulted `defaultRoute`.)

⚠ If you run `@real-router/validation-plugin`, one diagnostic changes shape.
A `DefaultRouteCallback` returning a non-string used to reach `navigate`, where
the plugin threw `TypeError: [router.navigate] Invalid routeName: object` and
logged it. The core gate now refuses first, so you get a `ROUTE_NOT_FOUND`
rejection with the reason above and no log line. The reason names the option
that failed, which the plugin's message did not — but it no longer names the
type, and it is a rejection rather than a throw.
