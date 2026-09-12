---
"@real-router/core": patch
---

A `Proxy` can no longer talk a non-bag past the shape gates (#2282)

`isPlainBag` decided "is this a plain object?" by reading the value's prototype,
and a `Proxy` traps that read. One line —
`new Proxy(["a","b"], { getPrototypeOf: () => Object.prototype })` — walked an
array past the gate that refuses the same array bare, and `extendRouter` then
copied its indices onto the live router: `router["0"] === "a"`. That is #2243's
symptom, reached around the fix that closed it.

`adoptChannel` read the prototype for the same decision and made it worse rather
than merely wrong: on a `true` it SPREADS, so the lying array was laundered into
a genuine `{0:…,1:…}` and every shape check downstream — including the ones that
do carry an array term — was handed an ordinary object and found nothing wrong.
Measured, that let `PluginApi.makeState` ship those indices as `state.params`
even with `@real-router/validation-plugin` installed.

Both predicates now ask `Array.isArray`, which the specification makes a proxy
answer for its TARGET. The same spelling `guardRouteStructure` and
`validateOptionsIsObject` already used — `isPlainBag` was the odd one out.

⚠ The gate is not proxy-proof and is not documented as one: there is no portable
way to detect a `Proxy`. The same lie still admits a class instance, a `Map` and
a `Date` — measured, the last two have no own enumerable keys to copy and the
first carries names its own author declared, so `Array.isArray` closes the one
admitted shape that has a consequence.

A pass-through `Proxy` over a plain object — Vue `reactive()`, Svelte `$state` —
is unaffected.
