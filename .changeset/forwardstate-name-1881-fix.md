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

⚠ `forwardState` handing the value BACK is not the same as the value going
nowhere: the caller's object is then used as a key in a string-keyed query
cache, where it is retained until the next matcher rebuild. It is never read
again, and the same cache already memoises arbitrary bogus string names.

Together with `isActiveRoute` in this same release, three route-name doors are
now closed without reading the value. They are not the whole family, and the
rest is worth naming rather than implying: `buildPath`, `makeState` and
`navigate` still reach `canonicalize`, which reads the name as a property key
twice (`defaultParams` and `defaultSearch`). `makeState` goes further and
ANSWERS — but only in its four-argument form, where `path` is supplied;
with `path` omitted it reads the name six times and throws instead. `buildPath`
reads it four times, or five on a route declaring `encodeParams`, whose encoder
then RUNS before the throw. `canNavigateTo` is not in this list: it is already
closed at 0 reads.

`@real-router/validation-plugin` reports all three as an error at the call, so
they keep the posture core has everywhere: bare core stays tolerant, the opt-in
validator diagnoses. The exported `resolveForwardChain` is the one door with no
gate at either level — it coerces and resolves the chain, returning the same
answer it would for the string.
