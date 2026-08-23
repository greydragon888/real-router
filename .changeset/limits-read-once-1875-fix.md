---
"@real-router/core": patch
---

Read `limits` once, at construction, and let a clone inherit them (#1875, #1880)

**Who is affected:** only callers whose `limits` are not plain numbers — a value
with a `valueOf`, or an accessor on the `limits` bag. `LimitsConfig` declares
every field `number`, so both need a cast in TypeScript, and both are ordinary
in JavaScript or in a config assembled at runtime from computed properties or a
class instance. If yours are plain numbers, nothing changed.

For such a value, the router called back into your code once per **listener
registration**, for its whole life: `EventEmitter` compares with
`size >= maxListeners`, which runs `ToPrimitive`. A `valueOf` that answered
differently silently moved the cap at runtime; one that threw, threw out of
`subscribe()`. And `cloneRouter` re-read an accessor-backed bag, so a
per-request SSR clone could end up with a different cap from its base — measured
before the fix, the base admitted three subscribers while the clone threw
`Listener limit (1) reached` from one options object.

`createLimits` now coerces each limit once and hands numbers downstream, and a
clone inherits the base's resolved limits rather than re-reading the option.

**Three behaviour changes worth knowing about:**

- **`{ maxListeners: null }` used to make every `subscribe()` throw**
  `Listener limit (null) reached`. It now means "no cap", which is what `0`
  already meant — so a config that spells an unset limit the way `JSON.parse`
  does works instead of failing. `undefined`, `Infinity` and a non-numeric
  string all continue to mean "no cap", exactly as before.
- **A `valueOf` that throws now throws from `createRouter`**, not from an
  unrelated later `subscribe()`. It is still your error, not a new rejection: a
  limit that will not become a usable number is coerced, never refused.
- **If you pass `limits`, a clone's `getOptions().limits` now reports the
  resolved numbers** where the base still reports the object you passed. A base
  that passed no `limits` is unaffected — the clone reports none either, rather
  than gaining the defaults.
