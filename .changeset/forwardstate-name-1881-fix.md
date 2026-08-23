---
"@real-router/core": patch
---

`forwardState` and `buildNavigationState` refuse a non-string route name (#1881)

**Who is affected:** plugin authors passing either method something other than a
string. Both are declared to take a `string`, so this needs a cast in
TypeScript, and is reachable from JavaScript or from a name computed at runtime.

`forwardState` is a resolver — it hands the name back when there is no forward —
so it never failed _out of_ anything. What it did was turn the caller's object
into a plain **string**, and that is why `buildNavigationState` could return a
valid state for it: the existence check downstream is a `Map`, so once the name
had been laundered it never saw the object. Along the way the value was used as
a property key up to six times, and a value that answered differently between
reads produced a state whose route came from one answer and whose defaults came
from another.

`forwardState` now hands a non-string straight back without resolving, and
`buildNavigationState` answers `undefined` — its own documented closed answer —
without reading it. Neither reads the value at all.

Together with `isActiveRoute` in this same release, that closes the family:
every public entry point that takes a route name now refuses a non-string
rather than coercing it. `@real-router/validation-plugin` continues to report
the same input as an error at the call, rather than a silent `undefined`.
