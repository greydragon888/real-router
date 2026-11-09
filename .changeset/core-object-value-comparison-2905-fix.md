---
"@real-router/core": minor
---

Compare two object values by what they hold, not by identity (#2905)

A route codec or a search schema decodes a fresh object on every read, so two matches of one URL gave states that compared unequal, and a `<Link>` built with a `Date` was never active. Core now compares two object values by a key — in `areParamValuesEqual` (`@real-router/core/validation`), and so in `areStatesEqual`, `isActiveRoute` and the choice of the segments a navigation re-enters:

- a `Date`, a subclass's instance included, by `getTime()`;
- a plain or null-prototype object by `JSON.stringify`, so its key order counts. One holding a field JSON drops or spells as another value — a function, a symbol, `NaN`, a `Map` — has no key, but a field holding `undefined` counts as absent;
- any other object by the string its `toString` returns, unless that string is a default `[object …]` tag.

A `Date` or a plain object from another realm, such as an iframe's, falls to the last rule. Two objects with no key still compare by identity, and still leave a segment unchanged. An object never equals a scalar: a `Date` is not its ISO string.

**Breaking Change:** documented behavior changes.

- `areStatesEqual` and `isActiveRoute` answer `true` where two object values share a key; they answered `false`.
- A navigation that changes only a keyed object a shared segment declares, such as a `Date` in `?from`, deactivates and re-activates that segment and the segments below it, and runs their guards, as a changed string does. A change between a keyed and a keyless object counts as one.

**Migration:** nothing to change for a codec that decodes the same value on every read. A segment whose `Date` changes now re-enters — its guards run and its `useRouteNode` updates — so code that forced that by hand can drop it.
