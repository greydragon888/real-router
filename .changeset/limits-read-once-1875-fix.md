---
"@real-router/core": patch
---

Read `limits` once, at construction, and let a clone inherit them (#1875, #1880)

**Who is affected:** callers whose `limits` are not plain numbers — a value with
a `valueOf`, or an accessor on the `limits` bag. The first needs a cast in
TypeScript; the second does **not**, because a getter is structurally a `number`
property, so it is reachable from ordinary typed code.

For such a value the router called back into your code once per **listener
registration**, for its whole life: `EventEmitter` compares with
`size >= maxListeners`, which runs `ToPrimitive`. A `valueOf` that answered
differently silently moved the cap at runtime; one that threw, threw out of
`subscribe()`. And `cloneRouter` re-read an accessor-backed bag, so a
per-request SSR clone could end up with a different cap from its base — measured,
the base admitted three subscribers while the clone threw `Listener limit (1)
reached` from one options object.

`createLimits` now coerces each limit once and hands numbers downstream, and a
clone inherits the base's resolved limits rather than re-reading the option.

**Behaviour changes worth knowing about:**

- **A falsy non-number no longer breaks every registration.** `null`, `""`,
  `false` and `[]` all coerce to `0`, which is the documented spelling of "no
  cap". Before, each of them made _every_ `subscribe()` throw
  `Listener limit (null) reached` and friends — a config that spells an unset
  limit the way `JSON.parse` does was unusable. `undefined`, `Infinity` and a
  non-numeric string like `"abc"` continue to mean "no cap", as before.
- **A `valueOf` that throws now throws from `createRouter`**, not from an
  unrelated later `subscribe()`. A `Symbol` limit throws there too — `Number()`
  itself refuses it. Neither is a new rejection the router invents: a limit that
  merely fails to become a usable number is coerced, never refused.
- **The `Listener limit (X) reached` message now prints the resolved number.**
  It used to print the raw value — `(true)`, `([object Object])`, a `Date`'s
  full text. If you match on that message, it changed.
- **The warning channel now works for a non-number `warnListeners`.** The check
  is `size === warnListeners`, which could never be true for a non-number, so
  such a config warned exactly never. It warns now.
- **If you pass `limits`, a clone's `getOptions().limits` reports the resolved
  numbers** for the keys you passed, where the base still reports the object you
  passed. The clone does not gain the defaults for keys you left out, and it
  keeps only keys that name a real limit — an own key outside `Limits` is
  reported by the base and dropped by the clone.

⚠ `@real-router/validation-plugin` still reads `getOptions().limits` — the
caller's own bag — once per registration it validates. That path is unchanged
here.
