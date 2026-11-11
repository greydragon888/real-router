---
"@real-router/hash-plugin": minor
---

Restore a `history.state` entry holding a `Date` as it was recorded (#2834)

`isState` no longer refuses a `Date` in an entry's `params` or `search`: it is a
state value in `@real-router/core`'s types. It still refuses a `Date` made in
another realm — an iframe's, say — an object that only looks like a `Date` (one
built on `Date.prototype`, or a `Proxy` over a `Date`) and every other class
instance; an instance of an `Array` subclass is walked as an array, as before.

**Breaking Change:** Back and Forward restore such an entry as it was recorded
instead of matching its URL again, so the route's `decodeParams` does not run
for it. The structured clone `history.pushState` makes keeps a `Date`'s time,
but a subclass's instance — a date-fns `UTCDate`, say — comes back as a plain
`Date`: where the subclass matters, convert the value where you read it.
